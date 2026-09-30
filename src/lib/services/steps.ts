import "server-only";

import { ServiceError } from "@/lib/errors";
import { withDate } from "@/lib/format";
import { setPhotoCaption } from "@/lib/photos";
import { parseInput, stepInput } from "@/lib/schemas";
import { createDraftStep, deleteStep, getStep, updateStep } from "@/lib/trips";
import { requireTrip } from "./trips";

export async function requireStep(stepId: number) {
  const step = Number.isInteger(stepId) ? await getStep(stepId) : null;
  if (!step) throw new ServiceError("step_not_found");
  return step;
}

/** Creates an empty draft; it becomes visible with its first photo or on save ([E7]). */
export async function startStep(tripId: number, userId: number) {
  await requireTrip(tripId);
  return createDraftStep(tripId, userId);
}

export async function saveStep(stepId: number, raw: unknown) {
  const step = await requireStep(stepId);
  const input = parseInput(stepInput, raw);

  if (!input.body && !input.placeName && step.photos.length === 0) {
    throw new ServiceError("step_empty");
  }

  await updateStep(stepId, {
    body: input.body,
    // Only the date is adjustable; the time of day from the EXIF data is kept
    // and orders several steps on the same day.
    occurredAt: input.occurredDate
      ? withDate(step.occurredAt, input.occurredDate)
      : step.occurredAt,
    lat: input.lat,
    lon: input.lon,
    placeName: input.placeName,
    published: true,
  });

  for (const photo of step.photos) {
    const caption = input.captions[String(photo.id)];
    if (caption === undefined) continue;
    if ((photo.caption ?? "") !== caption) {
      await setPhotoCaption(photo.id, caption || null);
    }
  }

  return step;
}

export async function removeStep(stepId: number) {
  const step = await requireStep(stepId);
  await deleteStep(stepId);
  return step;
}
