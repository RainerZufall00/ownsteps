import "server-only";

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  photos,
  steps,
  trips,
  type Comment,
  type Photo,
  type Step,
  type Trip,
} from "@/db/schema";
import { recordChange } from "./changes";
import { deletePhotoFilesFor } from "./photos";
import { newShareToken } from "./share";

export type StepWithPhotos = Step & { photos: Photo[]; comments: Comment[] };

/** What a trip's list entry and API shape show besides the trip itself. */
export type TripStats = {
  coverPhotoId: number | null;
  stepCount: number;
  photoCount: number;
  firstStepAt: number | null;
  lastStepAt: number | null;
};

export type TripSummary = Trip &
  Omit<TripStats, "coverPhotoId"> & {
    coverPhoto: Photo | null;
  };

/** Drafts are created when the editor opens – clean up unused ones eventually. */
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function cleanupStaleDrafts() {
  const stale = await db
    .select({ id: steps.id })
    .from(steps)
    .where(
      and(eq(steps.published, false), lt(steps.updatedAt, Date.now() - DRAFT_TTL_MS)),
    );
  if (stale.length === 0) return;
  await Promise.all(stale.map((s) => deleteStep(s.id)));
}

/**
 * The stats of a trip whose published steps are already loaded (oldest
 * first). The rule for the lead image is the same as in `listTrips`: the
 * cover if set, otherwise the timeline's first photo.
 */
export function summarizeSteps(
  trip: Pick<Trip, "coverPhotoId">,
  stepList: StepWithPhotos[],
): TripStats {
  return {
    coverPhotoId: trip.coverPhotoId ?? stepList.find((s) => s.photos.length > 0)?.photos[0].id ?? null,
    stepCount: stepList.length,
    photoCount: stepList.reduce((sum, step) => sum + step.photos.length, 0),
    firstStepAt: stepList[0]?.occurredAt ?? null,
    lastStepAt: stepList.at(-1)?.occurredAt ?? null,
  };
}

/** All trips, newest first – or only those with the given IDs. */
export async function listTrips(options: { ids?: number[] } = {}): Promise<TripSummary[]> {
  if (options.ids?.length === 0) return [];
  const rows = await db
    .select()
    .from(trips)
    .where(options.ids ? inArray(trips.id, options.ids) : undefined)
    .orderBy(desc(trips.updatedAt));
  if (rows.length === 0) return [];
  const tripIds = rows.map((t) => t.id);

  const stats = await db
    .select({
      tripId: steps.tripId,
      stepCount: sql<number>`count(*)`,
      firstStepAt: sql<number | null>`min(${steps.occurredAt})`,
      lastStepAt: sql<number | null>`max(${steps.occurredAt})`,
    })
    .from(steps)
    .where(and(eq(steps.published, true), inArray(steps.tripId, tripIds)))
    .groupBy(steps.tripId);

  // The photos of published steps in timeline order – only their IDs. The
  // cover isn't attached to any step and doesn't count as a trip photo.
  const stepPhotos = await db
    .select({ tripId: photos.tripId, id: photos.id })
    .from(photos)
    .innerJoin(steps, eq(steps.id, photos.stepId))
    .where(and(eq(steps.published, true), inArray(photos.tripId, tripIds)))
    .orderBy(asc(steps.occurredAt), asc(steps.id), asc(photos.sortOrder), asc(photos.id));
  const photoCount = new Map<number, number>();
  const firstPhotoId = new Map<number, number>();
  for (const photo of stepPhotos) {
    photoCount.set(photo.tripId, (photoCount.get(photo.tripId) ?? 0) + 1);
    if (!firstPhotoId.has(photo.tripId)) firstPhotoId.set(photo.tripId, photo.id);
  }

  // Only the photos that end up as covers – not every photo of every trip.
  const coverIds = new Map<number, number>();
  for (const trip of rows) {
    const coverId = trip.coverPhotoId ?? firstPhotoId.get(trip.id);
    if (coverId) coverIds.set(trip.id, coverId);
  }
  const coverRows =
    coverIds.size > 0
      ? await db.select().from(photos).where(inArray(photos.id, [...coverIds.values()]))
      : [];

  const statsByTrip = new Map(stats.map((s) => [s.tripId, s]));
  const photoById = new Map(coverRows.map((p) => [p.id, p]));

  return rows.map((trip) => {
    const stat = statsByTrip.get(trip.id);
    const coverId = coverIds.get(trip.id);
    return {
      ...trip,
      stepCount: stat?.stepCount ?? 0,
      photoCount: photoCount.get(trip.id) ?? 0,
      firstStepAt: stat?.firstStepAt ?? null,
      lastStepAt: stat?.lastStepAt ?? null,
      coverPhoto: (coverId ? photoById.get(coverId) : undefined) ?? null,
    };
  });
}

export async function getTrip(tripId: number): Promise<Trip | null> {
  return (await db.select().from(trips).where(eq(trips.id, tripId)).get()) ?? null;
}

/** Steps with their photos and comments, in the order given. */
async function withChildren(stepRows: Step[]): Promise<StepWithPhotos[]> {
  if (stepRows.length === 0) return [];
  const stepIds = stepRows.map((s) => s.id);

  const photoRows = await db
    .select()
    .from(photos)
    .where(inArray(photos.stepId, stepIds))
    .orderBy(asc(photos.sortOrder), asc(photos.id));
  const commentRows = await db
    .select()
    .from(comments)
    .where(inArray(comments.stepId, stepIds))
    .orderBy(asc(comments.createdAt));

  const photosByStep = groupBy(photoRows, (photo) => photo.stepId);
  const commentsByStep = groupBy(commentRows, (comment) => comment.stepId);
  return stepRows.map((step) => ({
    ...step,
    photos: photosByStep.get(step.id) ?? [],
    comments: commentsByStep.get(step.id) ?? [],
  }));
}

function groupBy<T, K>(items: T[], key: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const list = groups.get(key(item));
    if (list) list.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

export async function getSteps(
  tripId: number,
  options: { includeDrafts?: boolean } = {},
): Promise<StepWithPhotos[]> {
  const where = options.includeDrafts
    ? eq(steps.tripId, tripId)
    : and(eq(steps.tripId, tripId), eq(steps.published, true));

  const stepRows = await db
    .select()
    .from(steps)
    .where(where)
    .orderBy(asc(steps.occurredAt), asc(steps.id));
  return withChildren(stepRows);
}

export async function getStep(stepId: number): Promise<StepWithPhotos | null> {
  const step = await db.select().from(steps).where(eq(steps.id, stepId)).get();
  if (!step) return null;
  const [withPhotos] = await withChildren([step]);
  return withPhotos;
}

/** The trip list is sorted by this: a trip that got new content moves up. */
export async function touchTrip(tripId: number) {
  await db.update(trips).set({ updatedAt: Date.now() }).where(eq(trips.id, tripId));
}

export async function createTrip(input: {
  title: string;
  summary?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userId: number;
}) {
  const [trip] = await db
    .insert(trips)
    .values({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      shareToken: newShareToken(),
      createdBy: input.userId,
    })
    .returning();
  await recordChange(trip.id, "trip", trip.id, "upsert");
  return trip;
}

export async function updateTrip(
  tripId: number,
  patch: Partial<
    Pick<
      Trip,
      | "title"
      | "summary"
      | "startDate"
      | "endDate"
      | "coverPhotoId"
      | "shareEnabled"
      | "sharePasswordHash"
      | "shareToken"
    >
  >,
) {
  await db
    .update(trips)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(trips.id, tripId));
  await recordChange(tripId, "trip", tripId, "upsert");
}

export async function deleteTrip(tripId: number) {
  const photoRows = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .where(eq(photos.tripId, tripId));
  // Rows vanish via ON DELETE CASCADE, the files don't.
  await db.delete(trips).where(eq(trips.id, tripId));
  // The trip's delete implies its steps, photos and comments.
  await recordChange(tripId, "trip", tripId, "delete");
  await deletePhotoFilesFor(photoRows);
}

/** Creates a step; the app sends content right away, the web editor a draft. */
export async function createStep(input: {
  tripId: number;
  userId: number;
  published: boolean;
  clientUuid?: string | null;
  body?: string;
  placeName?: string | null;
  lat?: number | null;
  lon?: number | null;
  occurredAt?: number;
}) {
  const [step] = await db
    .insert(steps)
    .values({
      tripId: input.tripId,
      occurredAt: input.occurredAt ?? Date.now(),
      createdBy: input.userId,
      published: input.published,
      clientUuid: input.clientUuid ?? null,
      body: input.body ?? "",
      placeName: input.placeName ?? null,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
    })
    .returning();
  if (step.published) {
    await touchTrip(step.tripId);
    await recordChange(step.tripId, "step", step.id, "upsert");
  }
  return step;
}

export async function getStepByClientUuid(clientUuid: string) {
  return (await db.select().from(steps).where(eq(steps.clientUuid, clientUuid)).get()) ?? null;
}

export async function updateStep(
  stepId: number,
  patch: Partial<
    Pick<
      Step,
      | "body"
      | "lat"
      | "lon"
      | "placeName"
      | "countryCode"
      | "occurredAt"
      | "published"
    >
  >,
) {
  const [row] = await db
    .update(steps)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(steps.id, stepId))
    .returning({ tripId: steps.tripId });
  if (row) {
    await touchTrip(row.tripId);
    await recordChange(row.tripId, "step", stepId, "upsert");
  }
}

export async function deleteStep(stepId: number) {
  const photoRows = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .where(eq(photos.stepId, stepId));
  // Rows vanish via ON DELETE CASCADE, the files don't.
  const [row] = await db
    .delete(steps)
    .where(eq(steps.id, stepId))
    .returning({ tripId: steps.tripId });
  // The step's delete implies its photos and comments.
  if (row) await recordChange(row.tripId, "step", stepId, "delete");
  await deletePhotoFilesFor(photoRows);
}
