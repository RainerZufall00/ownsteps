import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { photos, steps, type Photo } from "@/db/schema";
import { ServiceError, type ErrorCode } from "@/lib/errors";
import { reverseGeocode } from "@/lib/geocode";
import { processUpload, processVideo } from "@/lib/images";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/limits";
import { deletePhoto } from "@/lib/photos";
import { updateTrip } from "@/lib/trips";
import { requireStep } from "./steps";
import { requireTrip } from "./trips";

const ACCEPTED_IMAGE = /^image\/(jpeg|png|webp|avif|heic|heif|tiff)$/i;
const ACCEPTED_VIDEO = /^video\//i;

/**
 * An uploaded file as the services see it. The bytes are only read on demand,
 * so an oversized file is rejected before it's pulled into memory.
 */
export type IncomingMedia = {
  name: string;
  type: string;
  size: number;
  read: () => Promise<Buffer>;
  /** Videos only: the poster frame, created by the client. */
  poster?: { read: () => Promise<Buffer> } | null;
  durationMs?: number | null;
};

export type MediaFailure = { name: string; code: ErrorCode };

export type MediaResult = {
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
  if (file.type && !video && !ACCEPTED_IMAGE.test(file.type)) return "unsupported_format";
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
    const reason = rejectReason(file);
    if (reason) {
      failed.push({ name: file.name, code: reason });
      continue;
    }

    const video = isVideo(file);
    try {
      const data = await file.read();
      const meta = video
        ? await processVideo(data, await file.poster!.read())
        : await processUpload(data);

      // Make traceable what was read from the file – without this, "no GPS
      // found" leaves you guessing.
      console.log(
        `[upload] ${file.name} (${file.type || "unknown"}, ` +
          `${Math.round(file.size / 1024)} kB): ` +
          `place ${meta.lat !== null ? `${meta.lat.toFixed(5)},${meta.lon?.toFixed(5)}` : "none"}, ` +
          `time ${meta.takenAt ? new Date(meta.takenAt).toISOString() : "none"}`,
      );

      const duration = file.durationMs ?? NaN;
      const [photo] = await db
        .insert(photos)
        .values({
          tripId: step.tripId,
          stepId: step.id,
          storageKey: meta.storageKey,
          originalName: file.name,
          width: meta.width,
          height: meta.height,
          bytes: meta.bytes,
          takenAt: meta.takenAt,
          lat: meta.lat,
          lon: meta.lon,
          placeholder: meta.placeholder,
          sortOrder: nextOrder++,
          mediaType: video ? "video" : "photo",
          videoMime: video ? file.type || "video/mp4" : null,
          durationMs:
            video && Number.isFinite(duration) && duration > 0
              ? Math.round(duration)
              : null,
        })
        .returning();
      created.push(photo);
    } catch (error) {
      console.error("[upload] failed", file.name, error);
      failed.push({ name: file.name, code: "media_unprocessable" });
    }
  }

  // Take the step's place and time from the photos as long as nothing is set.
  const withGps = created.find((p) => p.lat !== null && p.lon !== null);
  const patch: Partial<typeof steps.$inferInsert> = {};
  if (withGps && step.lat === null) {
    patch.lat = withGps.lat;
    patch.lon = withGps.lon;
    if (!step.placeName) {
      const place = await reverseGeocode(withGps.lat!, withGps.lon!);
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

  if (Object.keys(patch).length > 0) {
    await db
      .update(steps)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(steps.id, step.id));
  }

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
  await requireTrip(tripId);
  if (file.size > MAX_IMAGE_BYTES) throw new ServiceError("image_too_large");
  if (file.type && !ACCEPTED_IMAGE.test(file.type)) {
    throw new ServiceError("unsupported_format");
  }

  let meta;
  try {
    meta = await processUpload(await file.read());
  } catch (error) {
    console.error("[cover] failed", file.name, error);
    throw new ServiceError("media_unprocessable");
  }

  const [photo] = await db
    .insert(photos)
    .values({
      tripId,
      stepId: null,
      storageKey: meta.storageKey,
      originalName: file.name,
      width: meta.width,
      height: meta.height,
      bytes: meta.bytes,
      placeholder: meta.placeholder,
      mediaType: "photo",
      sortOrder: -1,
    })
    .returning();

  await updateTrip(tripId, { coverPhotoId: photo.id });
  return photo;
}

/** Deleting is idempotent: a photo that's already gone isn't an error. */
export async function removePhoto(photoId: number) {
  if (!Number.isInteger(photoId)) throw new ServiceError("invalid_request");
  return deletePhoto(photoId);
}

/** Turns a `File` from a multipart form into an `IncomingMedia`. */
export function fromFormFile(
  file: File,
  extra: { poster?: File | null; durationMs?: number | null } = {},
): IncomingMedia {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    read: async () => Buffer.from(await file.arrayBuffer()),
    poster: extra.poster
      ? { read: async () => Buffer.from(await extra.poster!.arrayBuffer()) }
      : null,
    durationMs: extra.durationMs ?? null,
  };
}
