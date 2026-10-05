import "server-only";

import { and, eq, isNull, notExists } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips, type Photo } from "@/db/schema";
import { recordChange } from "./changes";
import { deletePhotoFiles, type ExtractedMeta } from "./images";

export async function getPhoto(photoId: number) {
  return (await db.select().from(photos).where(eq(photos.id, photoId)).get()) ?? null;
}

/**
 * Stores the row for files `processUpload`/`processVideo` already put on
 * disk. If the insert fails, the files go too – without a row nothing would
 * ever find or delete them.
 */
export async function createPhoto(
  meta: ExtractedMeta,
  values: Omit<
    typeof photos.$inferInsert,
    "storageKey" | "width" | "height" | "bytes" | "placeholder"
  >,
): Promise<Photo> {
  let photo: Photo;
  try {
    [photo] = await db
      .insert(photos)
      .values({
        storageKey: meta.storageKey,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        placeholder: meta.placeholder,
        ...values,
      })
      .returning();
  } catch (error) {
    await deletePhotoFiles(meta.storageKey);
    throw error;
  }
  await recordChange(photo.tripId, "photo", photo.id, "upsert");
  return photo;
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
  return (await db.select().from(photos).where(eq(photos.clientUuid, clientUuid)).get()) ?? null;
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
