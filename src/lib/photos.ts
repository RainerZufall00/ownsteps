import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
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
  // The trip's cover must not point at a deleted photo.
  await db
    .update(trips)
    .set({ coverPhotoId: null })
    .where(eq(trips.coverPhotoId, photoId));
  await deletePhotoFiles(photo.storageKey);
  return photo;
}

export async function setPhotoCaption(photoId: number, caption: string | null) {
  await db.update(photos).set({ caption }).where(eq(photos.id, photoId));
}

/** Removes the files of several photos, e.g. when a step is deleted. */
export async function deletePhotoFilesFor(photoRows: { storageKey: string }[]) {
  await Promise.all(photoRows.map((p) => deletePhotoFiles(p.storageKey)));
}
