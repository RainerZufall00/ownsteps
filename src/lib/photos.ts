import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
import { deletePhotoFiles } from "./images";

export async function deletePhoto(photoId: number) {
  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  const photo = rows[0];
  if (!photo) return;

  await db.delete(photos).where(eq(photos.id, photoId));
  // Titelbild der Reise darf nicht auf ein gelöschtes Foto zeigen.
  await db
    .update(trips)
    .set({ coverPhotoId: null })
    .where(eq(trips.coverPhotoId, photoId));
  await deletePhotoFiles(photo.storageKey);
}

/** Räumt die Dateien mehrerer Fotos ab, z.B. wenn ein Beitrag gelöscht wird. */
export async function deletePhotoFilesFor(photoRows: { storageKey: string }[]) {
  await Promise.all(photoRows.map((p) => deletePhotoFiles(p.storageKey)));
}
