import "server-only";

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { DEFAULT_VIDEO_MIME, isVariant, variantPath, videoPath } from "./images";

function stream(file: string, start?: number, end?: number) {
  return Readable.toWeb(
    createReadStream(file, start !== undefined ? { start, end } : undefined),
  ) as unknown as ReadableStream;
}

/**
 * A single byte range (RFC 9110 §14.1.2) resolved against the file size:
 * `bytes=500-` to the end, `bytes=-500` the last 500 bytes, and an end past
 * the file is cut to it. Anything else – no header, several ranges, garbage –
 * gets the whole file (null).
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
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

  const file = isVariant(variant) ? variantPath(storageKey, variant) : videoPath(storageKey);

  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response("File missing", { status: 404 });
  }

  const headers = {
    "Content-Type": isVideo ? videoMime || DEFAULT_VIDEO_MIME : "image/webp",
    // storage_key is unique per medium, the file never changes.
    "Cache-Control": "private, max-age=31536000, immutable",
    ...(isVideo ? { "Accept-Ranges": "bytes" } : {}),
  };

  if (!isVideo) {
    return new Response(stream(file), {
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  // Without range requests seeking in the video wouldn't work, and Safari
  // sometimes refuses to play it at all.
  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response("Range outside the file", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  if (range) {
    const { start, end } = range;
    return new Response(stream(file, start, end), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  return new Response(stream(file), {
    headers: { ...headers, "Content-Length": String(size) },
  });
}
