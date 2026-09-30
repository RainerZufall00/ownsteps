import "server-only";

import bcrypt from "bcryptjs";
import { ServiceError } from "@/lib/errors";
import { getPhoto } from "@/lib/photos";
import { parseInput, shareInput, tripInput } from "@/lib/schemas";
import { newShareToken } from "@/lib/share";
import { createTrip, deleteTrip, getTrip, updateTrip } from "@/lib/trips";

/**
 * Trip use cases, shared by Server Actions and the REST API. Callers have
 * already established that the request is signed in – there are no roles
 * beyond that ([E2]).
 */

export async function requireTrip(tripId: number) {
  const trip = Number.isInteger(tripId) ? await getTrip(tripId) : null;
  if (!trip) throw new ServiceError("trip_not_found");
  return trip;
}

export async function createTripFor(userId: number, raw: unknown) {
  const input = parseInput(tripInput, raw);
  return createTrip({ ...input, userId });
}

export async function updateTripDetails(tripId: number, raw: unknown) {
  await requireTrip(tripId);
  const input = parseInput(tripInput, raw);
  await updateTrip(tripId, input);
}

/**
 * Deletes the trip including its photos – but only when the title was typed
 * in as confirmation. A single misclick must not be able to wipe out a trip.
 */
export async function deleteTripConfirmed(tripId: number, confirmTitle: string) {
  const trip = await requireTrip(tripId);
  if (confirmTitle.trim() !== trip.title.trim()) {
    throw new ServiceError("trip_delete_confirmation", { title: trip.title });
  }
  await deleteTrip(tripId);
}

/** Only photos of the same trip can become its cover. */
export async function setCoverPhoto(tripId: number, photoId: number) {
  await requireTrip(tripId);
  const photo = Number.isInteger(photoId) ? await getPhoto(photoId) : null;
  if (!photo || photo.tripId !== tripId) throw new ServiceError("photo_not_found");
  await updateTrip(tripId, { coverPhotoId: photoId });
}

export async function updateSharing(tripId: number, raw: unknown) {
  await requireTrip(tripId);
  const input = parseInput(shareInput, raw);

  const patch: Parameters<typeof updateTrip>[1] = { shareEnabled: input.enabled };
  if (input.removePassword) {
    patch.sharePasswordHash = null;
  } else if (input.password) {
    patch.sharePasswordHash = await bcrypt.hash(input.password, 12);
  }
  await updateTrip(tripId, patch);
}

/**
 * Partial update for the API: fields that aren't sent keep their value. The
 * share password isn't part of it – that stays in the web UI ([D21]).
 */
export async function patchTrip(
  tripId: number,
  patch: {
    title?: string;
    summary?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    shareEnabled?: boolean;
  },
) {
  const trip = await requireTrip(tripId);
  await updateTripDetails(tripId, {
    title: patch.title ?? trip.title,
    summary: patch.summary === undefined ? trip.summary : patch.summary,
    startDate: patch.startDate === undefined ? trip.startDate : patch.startDate,
    endDate: patch.endDate === undefined ? trip.endDate : patch.endDate,
  });
  if (patch.shareEnabled !== undefined && patch.shareEnabled !== trip.shareEnabled) {
    await updateTrip(tripId, { shareEnabled: patch.shareEnabled });
  }
  return requireTrip(tripId);
}

/** Creates a new link – the old one stops working afterwards. */
export async function rotateShareToken(tripId: number) {
  await requireTrip(tripId);
  const shareToken = newShareToken();
  await updateTrip(tripId, { shareToken });
  return shareToken;
}
