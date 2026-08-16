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

/** Entwürfe entstehen beim Öffnen des Editors – ungenutzte irgendwann wegräumen. */
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
    .groupBy(photos.tripId);

  // Fehlt ein gesetztes Titelbild, dient das erste Foto der Reise als Aufmacher.
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
  userId: number;
}) {
  const [trip] = await db
    .insert(trips)
    .values({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      startDate: input.startDate || null,
      shareToken: newShareToken(),
      createdBy: input.userId,
    })
    .returning();
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
}

export async function deleteTrip(tripId: number) {
  const photoRows = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .where(eq(photos.tripId, tripId));
  // Zeilen verschwinden per ON DELETE CASCADE, die Dateien nicht.
  await db.delete(trips).where(eq(trips.id, tripId));
  await deletePhotoFilesFor(photoRows);
}

export async function createDraftStep(tripId: number, userId: number) {
  const [step] = await db
    .insert(steps)
    .values({
      tripId,
      occurredAt: Date.now(),
      createdBy: userId,
      published: false,
    })
    .returning();
  return step;
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
  }
}

export async function deleteStep(stepId: number) {
  const photoRows = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .where(eq(photos.stepId, stepId));
  await db.delete(steps).where(eq(steps.id, stepId));
  await deletePhotoFilesFor(photoRows);
}
