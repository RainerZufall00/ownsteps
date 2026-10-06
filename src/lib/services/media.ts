import "server-only";

import fs from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { photos, type Photo } from "@/db/schema";
import { ServiceError, type ErrorCode } from "@/lib/errors";
import { reverseGeocode } from "@/lib/geocode";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { DEFAULT_VIDEO_MIME, processUpload, processVideo } from "@/lib/images";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/limits";
import type { UploadedFile } from "@/lib/multipart";
import {
  createPhoto,
  deletePhoto,
  getPhoto,
  getPhotoByClientUuid,
  setPhotoCaption,
} from "@/lib/photos";
import { normalizeCaption } from "@/lib/schemas";
import { touchTrip, updateStep } from "@/lib/trips";
import { requireStep } from "./steps";
import { requireTrip, switchCover } from "./trips";

const ACCEPTED_VIDEO = /^video\//i;

function isAcceptedImage(type: string) {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type.toLowerCase());
}

/**
 * An uploaded file as the services see it. The bytes are only read on demand,
 * so an oversized file is rejected before it's pulled into memory.
 */
export type IncomingMedia = {
  name: string;
  type: string;
  size: number;
  read: () => Promise<Buffer>;
  /**
   * Puts the bytes at `destination` without reading them into memory – for
   * an upload in `tmp/` a rename. Videos go this way; without it they are
   * read and written.
   */
  saveTo?: (destination: string) => Promise<void>;
  /** Videos only: the poster frame, created by the client. */
  poster?: { read: () => Promise<Buffer> } | null;
  durationMs?: number | null;
  /** Set by the app; a retried upload with the same UUID isn't stored twice. */
  clientUuid?: string | null;
};

type MediaFailure = { name: string; code: ErrorCode };

type MediaResult = {
  photos: Photo[];
  failed: MediaFailure[];
  /** What the step took over from the media, for the editor to show. */
  derived: {
    lat: number | null;
    lon: number | null;
    occurredAt: number | null;
    placeName: string | null;
  };
};

function isVideo(file: IncomingMedia) {
  return ACCEPTED_VIDEO.test(file.type);
}

/** Checks a file against limits and formats before anything is read. */
function rejectReason(file: IncomingMedia): ErrorCode | null {
  const video = isVideo(file);
  if (video && file.size > MAX_VIDEO_BYTES) return "video_too_large";
  if (!video && file.size > MAX_IMAGE_BYTES) return "image_too_large";
  if (file.type && !video && !isAcceptedImage(file.type)) return "unsupported_format";
  if (video && !file.poster) return "poster_missing";
  return null;
}

/**
 * Adds photos and videos to a step. Files are processed one at a time; a
 * failing file doesn't stop the others, it's reported in `failed`.
 */
export async function addMediaToStep(
  stepId: number,
  files: IncomingMedia[],
  /** Language of the place name derived from the photos' GPS position. */
  language: Locale = DEFAULT_LOCALE,
): Promise<MediaResult> {
  const step = await requireStep(stepId);
  if (files.length === 0) throw new ServiceError("no_file");

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${photos.sortOrder}), -1)` })
    .from(photos)
    .where(eq(photos.stepId, stepId));

  const created: Photo[] = [];
  const failed: MediaFailure[] = [];
  let nextOrder = maxOrder + 1;

  for (const file of files) {
    if (file.clientUuid) {
      const existing = await getPhotoByClientUuid(file.clientUuid);
      if (existing) {
        if (existing.stepId !== step.id) throw new ServiceError("invalid_request");
        created.push(existing);
        continue;
      }
    }

    const reason = rejectReason(file);
    if (reason) {
      failed.push({ name: file.name, code: reason });
      continue;
    }

    const video = isVideo(file);
    try {
      const meta = video
        ? await processVideo(
            file.saveTo ?? (async (destination) => fs.writeFile(destination, await file.read())),
            await file.poster!.read(),
          )
        : await processUpload(await file.read());

      // Make traceable what was read from the file – without this, "no GPS
      // found" leaves you guessing.
      console.log(
        `[upload] ${file.name} (${file.type || "unknown"}, ` +
          `${Math.round(file.size / 1024)} kB): ` +
          `place ${meta.lat !== null ? `${meta.lat.toFixed(5)},${meta.lon?.toFixed(5)}` : "none"}, ` +
          `time ${meta.takenAt ? new Date(meta.takenAt).toISOString() : "none"}`,
      );

      const duration = file.durationMs ?? NaN;
      try {
        created.push(
          await createPhoto(meta, {
            tripId: step.tripId,
            stepId: step.id,
            originalName: file.name,
            takenAt: meta.takenAt,
            lat: meta.lat,
            lon: meta.lon,
            sortOrder: nextOrder++,
            mediaType: video ? "video" : "photo",
            videoMime: video ? file.type || DEFAULT_VIDEO_MIME : null,
            durationMs:
              video && Number.isFinite(duration) && duration > 0
                ? Math.round(duration)
                : null,
            clientUuid: file.clientUuid ?? null,
          }),
        );
      } catch (error) {
        // A parallel retry with the same UUID got in first: its photo is
        // the answer to this request too.
        const winner = file.clientUuid ? await getPhotoByClientUuid(file.clientUuid) : null;
        if (winner?.stepId !== step.id) throw error;
        created.push(winner);
      }
    } catch (error) {
      console.error("[upload] failed", file.name, error);
      failed.push({ name: file.name, code: "media_unprocessable" });
    }
  }

  // Take the step's place and time from the photos as long as nothing is set.
  const withGps = created.find((p) => p.lat !== null && p.lon !== null);
  const patch: Parameters<typeof updateStep>[1] = {};
  if (withGps && step.lat === null) {
    patch.lat = withGps.lat;
    patch.lon = withGps.lon;
    if (!step.placeName) {
      const place = await reverseGeocode(withGps.lat!, withGps.lon!, language);
      if (place.placeName) patch.placeName = place.placeName;
      if (place.countryCode) patch.countryCode = place.countryCode;
    }
  }
  const earliest = created
    .map((p) => p.takenAt)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b)[0];
  if (earliest && !step.published) {
    patch.occurredAt = earliest;
  }

  // As soon as a photo is in, the step becomes visible – otherwise the work
  // would be lost if someone leaves the editor without saving ([E7]).
  if (created.length > 0 && !step.published) {
    patch.published = true;
  }

  // Through `updateStep` like every step write: it logs the change and
  // moves the trip up the list.
  if (Object.keys(patch).length > 0) await updateStep(step.id, patch);
  else if (created.length > 0) await touchTrip(step.tripId);

  return {
    photos: created,
    failed,
    derived: {
      lat: patch.lat ?? null,
      lon: patch.lon ?? null,
      occurredAt: patch.occurredAt ?? null,
      placeName: patch.placeName ?? null,
    },
  };
}

/**
 * Stores a trip's cover image. It isn't attached to any step (step_id stays
 * empty), which is what makes it the one public image of a shared trip.
 */
export async function uploadCover(tripId: number, file: IncomingMedia) {
  const trip = await requireTrip(tripId);
  if (file.size > MAX_IMAGE_BYTES) throw new ServiceError("image_too_large");
  if (file.type && !isAcceptedImage(file.type)) {
    throw new ServiceError("unsupported_format");
  }

  let meta;
  try {
    meta = await processUpload(await file.read());
  } catch (error) {
    console.error("[cover] failed", file.name, error);
    throw new ServiceError("media_unprocessable");
  }

  const photo = await createPhoto(meta, {
    tripId,
    stepId: null,
    originalName: file.name,
    mediaType: "photo",
    sortOrder: -1,
  });
  await switchCover(trip, photo.id);
  return photo;
}

export async function requirePhoto(photoId: number) {
  const photo = Number.isInteger(photoId) ? await getPhoto(photoId) : null;
  if (!photo) throw new ServiceError("photo_not_found");
  return photo;
}

export async function updateCaption(photoId: number, caption: string | null) {
  await requirePhoto(photoId);
  await setPhotoCaption(photoId, normalizeCaption(caption));
  return (await getPhoto(photoId))!;
}

/** Deleting is idempotent: a photo that's already gone isn't an error. */
export async function removePhoto(photoId: number) {
  if (!Number.isInteger(photoId)) throw new ServiceError("invalid_request");
  return deletePhoto(photoId);
}

/**
 * Turns a streamed upload (`parseMultipart`) into an `IncomingMedia`. Only
 * images are read into memory – sharp needs them whole and they're capped
 * (`MAX_IMAGE_BYTES`); a video is moved into place.
 */
export function fromUpload(
  file: UploadedFile,
  extra: { poster?: UploadedFile | null; durationMs?: number | null } = {},
): IncomingMedia {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    read: () => fs.readFile(file.path),
    saveTo: (destination) => fs.rename(file.path, destination),
    poster: extra.poster ? { read: () => fs.readFile(extra.poster!.path) } : null,
    durationMs: extra.durationMs ?? null,
  };
}

/** The limit `parseMultipart` enforces while a file is still arriving. */
export function uploadLimitFor(type: string) {
  return ACCEPTED_VIDEO.test(type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}
