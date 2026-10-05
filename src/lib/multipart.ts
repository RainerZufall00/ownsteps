import "server-only";

import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import { DATA_DIR } from "@/db";
import { ServiceError } from "./errors";

/**
 * Multipart uploads, streamed to disk. `request.formData()` holds the whole
 * body in memory before anyone can look at it – a 400 MB video then needs
 * gigabytes on a small VPS. Here every file goes straight into `tmp/` next to
 * `uploads/` (same disk, so moving it into place later is a rename), and a
 * file over its limit stops being written the moment it crosses it.
 */

/** Same file system as `uploads/`, so a rename moves a file into place. */
export const TMP_DIR = path.join(DATA_DIR, "tmp");

export type UploadedFile = {
  /** Form field it came in. */
  field: string;
  name: string;
  type: string;
  /** Bytes sent. Past the limit they were counted but no longer written. */
  size: number;
  /** Where the bytes are, until `dispose()`. */
  path: string;
};

export type MultipartForm = {
  fields: Map<string, string>;
  files: UploadedFile[];
  file(field: string): UploadedFile | null;
  /** Removes the temporary files; call it in a `finally`. */
  dispose(): Promise<void>;
};

/** Text fields here are IDs, durations and UUIDs – nothing long. */
const FIELD_LIMIT = 64 * 1024;
const MAX_FILES = 20;

export async function parseMultipart(
  request: Request,
  /** Byte limit per file, decided from its declared type. */
  limitFor: (type: string) => number,
): Promise<MultipartForm> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!request.body || !contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ServiceError("invalid_request");
  }

  await fs.mkdir(TMP_DIR, { recursive: true });
  const fields = new Map<string, string>();
  const files: UploadedFile[] = [];
  const writes: Promise<void>[] = [];
  const dispose = async () => {
    await Promise.all(files.map((file) => fs.rm(file.path, { force: true })));
  };

  let parser: busboy.Busboy;
  try {
    parser = busboy({
      headers: { "content-type": contentType },
      limits: { fieldSize: FIELD_LIMIT, files: MAX_FILES },
      // Browsers send file names as raw UTF-8; busboy's default (Latin-1)
      // would turn "Müller.jpg" into mojibake.
      defParamCharset: "utf8",
    });
  } catch {
    throw new ServiceError("invalid_request");
  }

  parser.on("field", (name, value) => fields.set(name, value));
  parser.on("file", (field, stream, info) => {
    const file: UploadedFile = {
      field,
      name: info.filename || "upload",
      type: info.mimeType || "",
      size: 0,
      path: path.join(TMP_DIR, crypto.randomUUID()),
    };
    files.push(file);
    const limit = limitFor(file.type);
    const out = createWriteStream(file.path);

    // Count while writing; past the limit the rest is read and dropped –
    // the stream must be drained, or the parser stalls.
    const counted = stream.filter((chunk: Buffer) => {
      file.size += chunk.length;
      return file.size <= limit;
    });
    const write = pipeline(counted, out);
    // Awaited below; until then a failure (disk full) must not count as an
    // unhandled rejection, which would take the whole server down.
    write.catch(() => {});
    writes.push(write);
  });

  try {
    await pipeline(Readable.fromWeb(request.body as never), parser);
    await Promise.all(writes);
  } catch {
    await dispose();
    // A broken or aborted body – nothing the server did wrong.
    throw new ServiceError("invalid_request");
  }

  return {
    fields,
    files,
    file: (field) => files.find((f) => f.field === field) ?? null,
    dispose,
  };
}

/** Removes what aborted requests left behind in `tmp/`; runs at startup. */
export async function clearTmp() {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
}
