import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/db";

export const VARIANTS = {
  thumb: { width: 480, quality: 70 },
  medium: { width: 1280, quality: 78 },
  large: { width: 2400, quality: 80 },
} as const;

export type VariantName = keyof typeof VARIANTS;

export function isVariant(value: string): value is VariantName {
  return value in VARIANTS;
}

/** Originale aufzuheben kostet Platz, rettet aber die volle Auflösung. */
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
 * Legt ein Video ab. Das Standbild kommt als fertiges Bild vom Browser und
 * durchläuft dieselbe Aufbereitung wie ein Foto – so bleibt das Image frei von
 * ffmpeg, und Raster wie Vollbildansicht behandeln beide Medien gleich.
 */
export async function processVideo(
  video: Buffer,
  poster: Buffer,
): Promise<ExtractedMeta> {
  const meta = await processUpload(poster);
  try {
    await fs.writeFile(videoPath(meta.storageKey), video);
  } catch (error) {
    await fs.rm(photoDir(meta.storageKey), { recursive: true, force: true });
    throw error;
  }
  return { ...meta, bytes: meta.bytes + video.byteLength };
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
  // Offensichtlich kaputte Kamera-Uhren aussortieren.
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
    // 0/0 im Atlantik ist praktisch immer ein Platzhalter, kein echter Ort.
    !(Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001)
  );
}

/**
 * Nimmt ein hochgeladenes Bild entgegen, legt die Web-Varianten an und liest
 * Aufnahmezeit und GPS-Position aus den EXIF-Daten.
 */
export async function processUpload(buffer: Buffer): Promise<ExtractedMeta> {
  const storageKey = crypto.randomUUID();
  const dir = photoDir(storageKey);

  // EXIF vor der Umwandlung lesen – sharp verwirft die Metadaten.
  let exif: ExifResult = {};
  try {
    exif =
      ((await exifr.parse(buffer, {
        gps: true,
        exif: true,
        tiff: true,
      })) as ExifResult) ?? {};
  } catch (error) {
    // Fehlende oder defekte Metadaten sind kein Grund abzubrechen – aber sie
    // gehören ins Log, sonst sucht man später im Dunkeln.
    console.warn("[upload] EXIF nicht lesbar:", (error as Error)?.message);
  }

  // Manche Kameras und Formate liefern die Position erst über den
  // spezialisierten GPS-Leser von exifr.
  if (!isValidCoord(exif?.latitude, exif?.longitude)) {
    try {
      const gps = await exifr.gps(buffer);
      if (gps && isValidCoord(gps.latitude, gps.longitude)) {
        exif = { ...exif, latitude: gps.latitude, longitude: gps.longitude };
      }
    } catch {
      // Zweiter Versuch, mehr nicht.
    }
  }

  const source = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Datei konnte nicht als Bild gelesen werden.");
  }
  // Nach .rotate() tauschen hochkant aufgenommene Bilder Breite und Höhe.
  const swap = (metadata.orientation ?? 1) >= 5;
  const width = swap ? metadata.height : metadata.width;
  const height = swap ? metadata.width : metadata.height;

  await fs.mkdir(dir, { recursive: true });

  let bytes = 0;
  try {
    for (const [name, config] of Object.entries(VARIANTS)) {
      const output = await sharp(buffer, { failOn: "none" })
        .rotate()
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
    // Halbfertige Verzeichnisse nicht liegen lassen.
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }

  let placeholder: string | null = null;
  try {
    const tiny = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 20, fit: "inside" })
      .jpeg({ quality: 45 })
      .toBuffer();
    placeholder = `data:image/jpeg;base64,${tiny.toString("base64")}`;
  } catch {
    // Platzhalter ist reine Kosmetik.
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
