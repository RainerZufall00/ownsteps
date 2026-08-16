import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
import { isVariant, variantPath } from "@/lib/images";
import { resolveTripAccess } from "@/lib/share";

/**
 * Fotos liegen außerhalb von /public und werden nur ausgeliefert, wenn der
 * Abrufende angemeldet ist oder den freigeschalteten Share-Link besitzt.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/photos/[id]/[variant]">,
) {
  const { id, variant } = await context.params;
  if (!isVariant(variant)) {
    return new Response("Unbekannte Größe", { status: 404 });
  }

  const photoId = Number(id);
  if (!Number.isInteger(photoId)) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  const rows = await db
    .select({ photo: photos, trip: trips })
    .from(photos)
    .innerJoin(trips, eq(trips.id, photos.tripId))
    .where(eq(photos.id, photoId))
    .limit(1);

  const row = rows[0];
  if (!row) return new Response("Nicht gefunden", { status: 404 });

  const access = await resolveTripAccess(row.trip);
  if (access.kind !== "owner" && access.kind !== "guest") {
    return new Response("Kein Zugriff", { status: 403 });
  }

  const file = variantPath(row.photo.storageKey, variant);
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response("Datei fehlt", { status: 404 });
  }

  const stream = Readable.toWeb(
    createReadStream(file),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      // storage_key ist pro Bild einmalig, die Datei ändert sich nie.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
