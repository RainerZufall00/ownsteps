import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
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

export type TripSummary = Trip & {
  stepCount: number;
  photoCount: number;
  firstStepAt: number | null;
  lastStepAt: number | null;
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

export async function listTrips(): Promise<TripSummary[]> {
  const rows = await db.select().from(trips).orderBy(desc(trips.updatedAt));
  if (rows.length === 0) return [];

  const stats = await db
    .select({
      tripId: steps.tripId,
      stepCount: sql<number>`count(*)`,
      firstStepAt: sql<number | null>`min(${steps.occurredAt})`,
      lastStepAt: sql<number | null>`max(${steps.occurredAt})`,
    })
    .from(steps)
    .where(eq(steps.published, true))
    .groupBy(steps.tripId);

  const photoStats = await db
    .select({ tripId: photos.tripId, photoCount: sql<number>`count(*)` })
    .from(photos)
    // The cover isn't attached to any step and doesn't count as a trip photo.
    .where(isNotNull(photos.stepId))
    .groupBy(photos.tripId);

  // Without an explicit cover, the trip's first photo serves as the lead image.
  const allPhotos = await db
    .select()
    .from(photos)
    .where(
      inArray(
        photos.tripId,
        rows.map((t) => t.id),
      ),
    )
    .orderBy(asc(photos.id));

  const statsByTrip = new Map(stats.map((s) => [s.tripId, s]));
  const photoCountByTrip = new Map(
    photoStats.map((s) => [s.tripId, s.photoCount]),
  );
  const photoById = new Map(allPhotos.map((p) => [p.id, p]));
  const firstPhotoByTrip = new Map<number, Photo>();
  for (const photo of allPhotos) {
    if (!firstPhotoByTrip.has(photo.tripId)) {
      firstPhotoByTrip.set(photo.tripId, photo);
    }
  }

  return rows.map((trip) => {
    const stat = statsByTrip.get(trip.id);
    const cover =
      (trip.coverPhotoId ? photoById.get(trip.coverPhotoId) : undefined) ??
      firstPhotoByTrip.get(trip.id) ??
      null;
    return {
      ...trip,
      stepCount: stat?.stepCount ?? 0,
      photoCount: photoCountByTrip.get(trip.id) ?? 0,
      firstStepAt: stat?.firstStepAt ?? null,
      lastStepAt: stat?.lastStepAt ?? null,
      coverPhoto: cover,
    };
  });
}

export async function getTrip(tripId: number): Promise<Trip | null> {
  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  return rows[0] ?? null;
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

  if (stepRows.length === 0) return [];

  const photoRows = await db
    .select()
    .from(photos)
    .where(
      inArray(
        photos.stepId,
        stepRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(photos.sortOrder), asc(photos.id));

  const commentRows = await db
    .select()
    .from(comments)
    .where(
      inArray(
        comments.stepId,
        stepRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(comments.createdAt));

  const byStep = new Map<number, Photo[]>();
  for (const photo of photoRows) {
    if (photo.stepId === null) continue;
    const list = byStep.get(photo.stepId);
    if (list) list.push(photo);
    else byStep.set(photo.stepId, [photo]);
  }

  const commentsByStep = new Map<number, Comment[]>();
  for (const comment of commentRows) {
    const list = commentsByStep.get(comment.stepId);
    if (list) list.push(comment);
    else commentsByStep.set(comment.stepId, [comment]);
  }

  return stepRows.map((step) => ({
    ...step,
    photos: byStep.get(step.id) ?? [],
    comments: commentsByStep.get(step.id) ?? [],
  }));
}

export async function getStep(stepId: number): Promise<StepWithPhotos | null> {
  const rows = await db
    .select()
    .from(steps)
    .where(eq(steps.id, stepId))
    .limit(1);
  const step = rows[0];
  if (!step) return null;

  const photoRows = await db
    .select()
    .from(photos)
    .where(eq(photos.stepId, stepId))
    .orderBy(asc(photos.sortOrder), asc(photos.id));

  const commentRows = await db
    .select()
    .from(comments)
    .where(eq(comments.stepId, stepId))
    .orderBy(asc(comments.createdAt));

  return { ...step, photos: photoRows, comments: commentRows };
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

export async function createDraftStep(tripId: number, userId: number) {
  return createStep({ tripId, userId, published: false });
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
  if (step.published) await recordChange(step.tripId, "step", step.id, "upsert");
  return step;
}

export async function getStepByClientUuid(clientUuid: string) {
  const rows = await db
    .select()
    .from(steps)
    .where(eq(steps.clientUuid, clientUuid))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateStep(
  stepId: number,
  patch: Partial<
    Pick<
      Step,
      | "title"
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
  await db
    .update(steps)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(steps.id, stepId));

  const [row] = await db
    .select({ tripId: steps.tripId })
    .from(steps)
    .where(eq(steps.id, stepId))
    .limit(1);
  if (row) {
    await db
      .update(trips)
      .set({ updatedAt: Date.now() })
      .where(eq(trips.id, row.tripId));
    await recordChange(row.tripId, "step", stepId, "upsert");
  }
}

export async function deleteStep(stepId: number) {
  const [row] = await db
    .select({ tripId: steps.tripId })
    .from(steps)
    .where(eq(steps.id, stepId))
    .limit(1);
  const photoRows = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .where(eq(photos.stepId, stepId));
  await db.delete(steps).where(eq(steps.id, stepId));
  // The step's delete implies its photos and comments.
  if (row) await recordChange(row.tripId, "step", stepId, "delete");
  await deletePhotoFilesFor(photoRows);
}
