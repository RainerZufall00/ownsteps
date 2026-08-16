import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
import { isVariant, variantPath, videoPath } from "@/lib/images";
import { resolveTripAccess } from "@/lib/share";

function stream(datei: string, start?: number, ende?: number) {
  return Readable.toWeb(
    createReadStream(datei, start !== undefined ? { start, end: ende } : undefined),
  ) as unknown as ReadableStream;
}

/**
 * Medien liegen außerhalb von /public und werden nur ausgeliefert, wenn der
 * Abrufende angemeldet ist oder den freigeschalteten Share-Link besitzt.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/photos/[id]/[variant]">,
) {
  const { id, variant } = await context.params;
  const istVideo = variant === "video";
  if (!istVideo && !isVariant(variant)) {
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

  const file = istVideo
    ? videoPath(row.photo.storageKey)
    : variantPath(row.photo.storageKey, variant as "thumb" | "medium" | "large");

  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response("Datei fehlt", { status: 404 });
  }

  // storage_key ist pro Medium einmalig, die Datei ändert sich nie.
  const cache = "private, max-age=31536000, immutable";

  if (!istVideo) {
    return new Response(stream(file), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(size),
        "Cache-Control": cache,
      },
    });
  }

  const typ = row.photo.videoMime || "video/mp4";

  // Ohne Bereichsauslieferung ließe sich im Video nicht springen, und Safari
  // spielt es teilweise gar nicht erst ab.
  const bereich = request.headers.get("range");
  if (bereich) {
    const treffer = /bytes=(\d*)-(\d*)/.exec(bereich);
    if (treffer) {
      const start = treffer[1] ? Number(treffer[1]) : 0;
      const ende = treffer[2] ? Number(treffer[2]) : size - 1;
      if (start >= size || ende >= size || start > ende) {
        return new Response("Bereich außerhalb der Datei", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      return new Response(stream(file, start, ende), {
        status: 206,
        headers: {
          "Content-Type": typ,
          "Content-Length": String(ende - start + 1),
          "Content-Range": `bytes ${start}-${ende}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cache,
        },
      });
    }
  }

  return new Response(stream(file), {
    headers: {
      "Content-Type": typ,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cache,
    },
  });
}
