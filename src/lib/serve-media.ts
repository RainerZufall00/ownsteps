import "server-only";

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { isVariant, variantPath, videoPath } from "./images";

function stream(datei: string, start?: number, ende?: number) {
  return Readable.toWeb(
    createReadStream(datei, start !== undefined ? { start, end: ende } : undefined),
  ) as unknown as ReadableStream;
}

/**
 * Liefert eine Bildvariante oder ein Video von der Platte aus – mit
 * Bereichsauslieferung, damit sich im Video springen lässt. Die
 * Zugriffsprüfung passiert vorher in der jeweiligen Route; hier geht es nur
 * noch ums Ausliefern, damit `/api/photos` (angemeldet) und `/api/share-media`
 * (Share-Link) sich denselben Code teilen.
 */
export async function serveMediaVariant(input: {
  storageKey: string;
  variant: string;
  videoMime: string | null;
  request: Request;
}): Promise<Response> {
  const { storageKey, variant, videoMime, request } = input;
  const istVideo = variant === "video";
  if (!istVideo && !isVariant(variant)) {
    return new Response("Unbekannte Größe", { status: 404 });
  }

  const file = istVideo
    ? videoPath(storageKey)
    : variantPath(storageKey, variant as "thumb" | "medium" | "large");

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

  const typ = videoMime || "video/mp4";

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
