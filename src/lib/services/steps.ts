import "server-only";

import { ServiceError } from "@/lib/errors";
import { reverseGeocode } from "@/lib/geocode";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { withDate } from "@/lib/format";
import { setPhotoCaption } from "@/lib/photos";
import { parseInput, stepInput } from "@/lib/schemas";
import {
  createStep,
  deleteStep,
  getStep,
  getStepByClientUuid,
  updateStep,
} from "@/lib/trips";
import { requireTrip } from "./trips";

export async function requireStep(stepId: number) {
  const step = Number.isInteger(stepId) ? await getStep(stepId) : null;
  if (!step) throw new ServiceError("step_not_found");
  return step;
}

/** Creates an empty draft; it becomes visible with its first photo or on save ([E7]). */
export async function startStep(tripId: number, userId: number) {
  await requireTrip(tripId);
  return createStep({ tripId, userId, published: false });
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

/**
 * Creates a step with content right away – the app's way, often written
 * offline. A repeated request with the same `clientUuid` returns the step
 * created the first time instead of a duplicate ([D19]).
 */
export async function createStepFromApp(
  tripId: number,
  userId: number,
  input: {
    clientUuid?: string;
    body: string;
    placeName?: string | null;
    lat?: number | null;
    lon?: number | null;
    occurredAt?: string;
    publish: boolean;
  },
  /** Language of a place name looked up from the coordinates. */
  language: Locale = DEFAULT_LOCALE,
) {
  await requireTrip(tripId);
  if (input.clientUuid) {
    const existing = await getStepByClientUuid(input.clientUuid);
    if (existing) {
      if (existing.tripId !== tripId) throw new ServiceError("invalid_request");
      return { step: (await getStep(existing.id))!, created: false };
    }
  }

  const body = input.body.trim();
  let placeName = input.placeName?.trim() || null;
  let countryCode: string | null = null;
  // A position without a name (the device couldn't look it up, e.g.
  // offline): named here, the same way as photos' positions are.
  if (!placeName && input.lat != null && input.lon != null) {
    ({ placeName, countryCode } = await reverseGeocode(input.lat, input.lon, language));
  }
  if (input.publish && !body && !placeName) throw new ServiceError("step_empty");

  const step = await createStep({
    tripId,
    userId,
    published: input.publish,
    clientUuid: input.clientUuid ?? null,
    body,
    placeName,
    countryCode,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    occurredAt: input.occurredAt ? Date.parse(input.occurredAt) : undefined,
  });
  return { step: (await getStep(step.id))!, created: true };
}

/** Partial update: fields that aren't sent keep their value. */
export async function patchStep(
  stepId: number,
  patch: {
    body?: string;
    placeName?: string | null;
    lat?: number | null;
    lon?: number | null;
    occurredDate?: string;
  },
) {
  const step = await requireStep(stepId);
  await saveStep(stepId, {
    body: patch.body ?? step.body,
    placeName: patch.placeName === undefined ? step.placeName : patch.placeName,
    lat: patch.lat === undefined ? step.lat : patch.lat,
    lon: patch.lon === undefined ? step.lon : patch.lon,
    occurredDate: patch.occurredDate ?? null,
  });
  return (await getStep(stepId))!;
}

export async function removeStep(stepId: number) {
  const step = await requireStep(stepId);
  await deleteStep(stepId);
  return step;
}
