import "server-only";

import { and, eq, isNull, notExists } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
import { recordChange } from "./changes";
import { deletePhotoFiles } from "./images";

export async function getPhoto(photoId: number) {
  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns the deleted photo, or null if there was none. */
export async function deletePhoto(photoId: number) {
  const photo = await getPhoto(photoId);
  if (!photo) return null;

  await db.delete(photos).where(eq(photos.id, photoId));
  await recordChange(photo.tripId, "photo", photo.id, "delete");
  // The trip's cover must not point at a deleted photo.
  await db
    .update(trips)
    .set({ coverPhotoId: null })
    .where(eq(trips.coverPhotoId, photoId));
  await deletePhotoFiles(photo.storageKey);
  return photo;
}

export async function setPhotoCaption(photoId: number, caption: string | null) {
  const [photo] = await db
    .update(photos)
    .set({ caption })
    .where(eq(photos.id, photoId))
    .returning({ tripId: photos.tripId });
  if (photo) await recordChange(photo.tripId, "photo", photoId, "upsert");
}

export async function getPhotoByClientUuid(clientUuid: string) {
  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.clientUuid, clientUuid))
    .limit(1);
  return rows[0] ?? null;
}

/** Removes the files of several photos, e.g. when a step is deleted. */
export async function deletePhotoFilesFor(photoRows: { storageKey: string }[]) {
  await Promise.all(photoRows.map((p) => deletePhotoFiles(p.storageKey)));
}

/**
 * Separately uploaded covers that no trip points at any more – replaced
 * before replacing removed the old one. Runs at startup.
 */
export async function cleanupOrphanedCovers() {
  const orphans = await db
    .select({ id: photos.id })
    .from(photos)
    .where(
      and(
        isNull(photos.stepId),
        notExists(
          db.select({ id: trips.id }).from(trips).where(eq(trips.coverPhotoId, photos.id)),
        ),
      ),
    );
  for (const orphan of orphans) await deletePhoto(orphan.id);
}
