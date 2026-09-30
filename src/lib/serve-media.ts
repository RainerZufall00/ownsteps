import "server-only";

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { isVariant, variantPath, videoPath } from "./images";

function stream(file: string, start?: number, end?: number) {
  return Readable.toWeb(
    createReadStream(file, start !== undefined ? { start, end } : undefined),
  ) as unknown as ReadableStream;
}

/**
 * Serves an image variant or a video from disk – with range support so
 * seeking in videos works. The access check happens beforehand in the
 * respective route; this is only about serving, so that `/api/photos`
 * (signed in) and `/api/share-media` (share link) share the same code.
 */
export async function serveMediaVariant(input: {
  storageKey: string;
  variant: string;
  videoMime: string | null;
  request: Request;
}): Promise<Response> {
  const { storageKey, variant, videoMime, request } = input;
  const isVideo = variant === "video";
  if (!isVideo && !isVariant(variant)) {
    return new Response("Unknown variant", { status: 404 });
  }

  const file = isVideo
    ? videoPath(storageKey)
    : variantPath(storageKey, variant as "thumb" | "medium" | "large");

  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response("File missing", { status: 404 });
  }

  // storage_key is unique per medium, the file never changes.
  const cache = "private, max-age=31536000, immutable";

  if (!isVideo) {
    return new Response(stream(file), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(size),
        "Cache-Control": cache,
      },
    });
  }

  const type = videoMime || "video/mp4";

  // Without range requests seeking in the video wouldn't work, and Safari
  // sometimes refuses to play it at all.
  const range = request.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;
      if (start >= size || end >= size || start > end) {
        return new Response("Range outside the file", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      return new Response(stream(file, start, end), {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cache,
        },
      });
    }
  }

  return new Response(stream(file), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cache,
    },
  });
}
