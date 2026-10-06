import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/db";

const VARIANTS = {
  thumb: { width: 480, quality: 70 },
  medium: { width: 1280, quality: 78 },
  large: { width: 2400, quality: 80 },
} as const;

type VariantName = keyof typeof VARIANTS;

export function isVariant(value: string): value is VariantName {
  return value in VARIANTS;
}

/** For videos whose type the upload didn't say. */
export const DEFAULT_VIDEO_MIME = "video/mp4";

/** Keeping originals costs space but preserves the full resolution. */
const KEEP_ORIGINALS = process.env.KEEP_ORIGINALS !== "false";

export function photoDir(storageKey: string) {
  return path.join(UPLOAD_DIR, storageKey);
}

export function variantPath(storageKey: string, variant: VariantName) {
  return path.join(photoDir(storageKey), `${variant}.webp`);
}

export function videoPath(storageKey: string) {
  return path.join(photoDir(storageKey), "video");
}

/**
 * Stores a video. The poster frame arrives as a finished image from the
 * browser and goes through the same processing as a photo – that keeps the
 * image free of ffmpeg, and grid and fullscreen view treat both media alike.
 *
 * The video itself never passes through memory: `saveVideo` puts it at the
 * given path (for an upload, a rename out of `tmp/`).
 */
export async function processVideo(
  saveVideo: (destination: string) => Promise<void>,
  poster: Buffer,
): Promise<ExtractedMeta> {
  const meta = await processUpload(poster);
  const destination = videoPath(meta.storageKey);
  try {
    await saveVideo(destination);
    const { size } = await fs.stat(destination);
    return { ...meta, bytes: meta.bytes + size };
  } catch (error) {
    await deletePhotoFiles(meta.storageKey);
    throw error;
  }
}

export type ExtractedMeta = {
  width: number;
  height: number;
  bytes: number;
  takenAt: number | null;
  lat: number | null;
  lon: number | null;
  placeholder: string | null;
  storageKey: string;
};

type ExifResult = {
  latitude?: number;
  longitude?: number;
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
};

function toTimestamp(value: Date | string | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  // Filter out obviously broken camera clocks.
  if (ms < Date.UTC(1990, 0, 1) || ms > Date.now() + 1000 * 60 * 60 * 24 * 2) {
    return null;
  }
  return ms;
}

function isValidCoord(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // 0/0 in the Atlantic is practically always a placeholder, not a real place.
    !(Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001)
  );
}

/**
 * Takes an uploaded image, creates the web variants and reads capture time
 * and GPS position from the EXIF data.
 */
export async function processUpload(buffer: Buffer): Promise<ExtractedMeta> {
  const storageKey = crypto.randomUUID();
  const dir = photoDir(storageKey);

  // Read EXIF before converting – sharp discards the metadata.
  let exif: ExifResult = {};
  try {
    exif =
      ((await exifr.parse(buffer, {
        gps: true,
        exif: true,
        tiff: true,
      })) as ExifResult) ?? {};
  } catch (error) {
    // Missing or broken metadata is no reason to abort – but it belongs in
    // the log, otherwise you're searching in the dark later.
    console.warn("[upload] EXIF unreadable:", (error as Error)?.message);
  }

  // Some cameras and formats only yield the position through exifr's
  // specialized GPS reader.
  if (!isValidCoord(exif?.latitude, exif?.longitude)) {
    try {
      const gps = await exifr.gps(buffer);
      if (gps && isValidCoord(gps.latitude, gps.longitude)) {
        exif = { ...exif, latitude: gps.latitude, longitude: gps.longitude };
      }
    } catch {
      // Second attempt, nothing more.
    }
  }

  // Only the header – the stored size is the full one, after rotation.
  const metadata = await sharp(buffer, { failOn: "none" }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("File could not be read as an image.");
  }
  const swap = (metadata.orientation ?? 1) >= 5;
  const width = swap ? metadata.height : metadata.width;
  const height = swap ? metadata.width : metadata.height;

  // Decode once: rotated and scaled to the largest variant, as raw pixels.
  // Every variant and the placeholder are made from that – decoding the
  // original for each of them was the expensive part, above all for HEIC
  // and big PNGs, which have no shrink-on-load.
  const base = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: VARIANTS.large.width, withoutEnlargement: true, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fromBase = () =>
    sharp(base.data, {
      raw: { width: base.info.width, height: base.info.height, channels: base.info.channels },
    });

  await fs.mkdir(dir, { recursive: true });

  let bytes = 0;
  try {
    for (const [name, config] of Object.entries(VARIANTS)) {
      const output = await fromBase()
        .resize({
          width: config.width,
          withoutEnlargement: true,
          fit: "inside",
        })
        .webp({ quality: config.quality })
        .toBuffer();
      await fs.writeFile(variantPath(storageKey, name as VariantName), output);
      bytes += output.byteLength;
    }

    if (KEEP_ORIGINALS) {
      await fs.writeFile(path.join(dir, "original"), buffer);
      bytes += buffer.byteLength;
    }
  } catch (error) {
    // Don't leave half-finished directories behind.
    await deletePhotoFiles(storageKey);
    throw error;
  }

  let placeholder: string | null = null;
  try {
    const tiny = await fromBase()
      .resize({ width: 20, fit: "inside" })
      .jpeg({ quality: 45 })
      .toBuffer();
    placeholder = `data:image/jpeg;base64,${tiny.toString("base64")}`;
  } catch {
    // The placeholder is purely cosmetic.
  }

  const hasGps = isValidCoord(exif?.latitude, exif?.longitude);

  return {
    storageKey,
    width,
    height,
    bytes,
    takenAt: toTimestamp(exif?.DateTimeOriginal ?? exif?.CreateDate),
    lat: hasGps ? (exif.latitude as number) : null,
    lon: hasGps ? (exif.longitude as number) : null,
    placeholder,
  };
}

export async function deletePhotoFiles(storageKey: string) {
  await fs.rm(photoDir(storageKey), { recursive: true, force: true });
}
