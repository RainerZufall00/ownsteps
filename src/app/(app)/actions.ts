"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { formChecked, formId, formString, formText } from "@/lib/form-data";
import { removePhoto } from "@/lib/services/media";
import { removeStep, saveStep, startStep } from "@/lib/services/steps";
import { removeAllViewers, removeViewer } from "@/lib/services/viewers";
import {
  createTripFor,
  deleteTripConfirmed,
  rotateShareToken,
  setCoverPhoto,
  updateSharing,
  updateTripDetails,
} from "@/lib/services/trips";

/**
 * Thin wrappers: read the form, call the service, refresh the affected
 * pages. The logic lives in `src/lib/services/`, where the REST API uses it
 * too.
 */

export type ActionState = { error?: string; ok?: boolean; tripId?: number };

function tripFields(formData: FormData) {
  return {
    title: formString(formData, "title"),
    summary: formText(formData, "summary"),
    startDate: formText(formData, "startDate"),
    endDate: formText(formData, "endDate"),
  };
}

/** A trip's page and the overview, which shows its counts and cover. */
function refreshTrip(tripId: number) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
}

/** Already gone – e.g. deleted in another tab – means there's nothing to do. */
async function ignoringMissing<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ServiceError) return null;
    throw error;
  }
}

export async function createTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    const trip = await createTripFor(user.id, tripFields(formData));
    revalidatePath("/");
    // No redirect: the form still uploads the optional cover via
    // `/api/trips/[id]/cover` afterwards and only then jumps into the trip.
    return { ok: true, tripId: trip.id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  try {
    await updateTripDetails(tripId, tripFields(formData));
  } catch (error) {
    return failure(error);
  }
  refreshTrip(tripId);
  return { ok: true };
}

export async function deleteTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  try {
    await deleteTripConfirmed(Number(formData.get("tripId")), formString(formData, "confirmTitle"));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  redirect("/");
}

/** Creates an empty step and jumps straight into the editor. */
export async function startStepAction(formData: FormData) {
  const user = await requireUser();
  const tripId = formId(formData, "tripId");
  if (tripId === null) return;

  const step = await startStep(tripId, user.id);
  redirect(`/trips/${tripId}/steps/${step.id}`);
}

export async function saveStepAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const stepId = Number(formData.get("stepId"));

  // Captions travel along in the same form, one field per photo.
  const captions: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("caption_") && typeof value === "string") {
      captions[name.slice("caption_".length)] = value;
    }
  }

  let tripId: number;
  try {
    const step = await saveStep(stepId, {
      body: formString(formData, "body"),
      placeName: formText(formData, "placeName"),
      occurredDate: formText(formData, "occurredDate"),
      lat: formText(formData, "lat"),
      lon: formText(formData, "lon"),
      captions,
    });
    tripId = step.tripId;
  } catch (error) {
    return failure(error);
  }

  refreshTrip(tripId);
  redirect(`/trips/${tripId}#step-${stepId}`);
}

export async function deleteStepAction(formData: FormData) {
  await requireUser();
  const stepId = formId(formData, "stepId");
  if (stepId === null) return;

  const step = await ignoringMissing(removeStep(stepId));
  if (!step) return;
  refreshTrip(step.tripId);
  redirect(`/trips/${step.tripId}`);
}

export async function deletePhotoAction(formData: FormData) {
  await requireUser();
  const photoId = formId(formData, "photoId");
  if (photoId === null) return;

  const photo = await removePhoto(photoId);
  if (photo?.stepId) {
    revalidatePath(`/trips/${photo.tripId}/steps/${photo.stepId}`);
  }
}

export async function setCoverPhotoAction(formData: FormData) {
  await requireUser();
  const tripId = formId(formData, "tripId");
  const photoId = formId(formData, "photoId");
  if (tripId === null || photoId === null) return;

  await setCoverPhoto(tripId, photoId);
  refreshTrip(tripId);
}

export async function updateShareAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  try {
    await updateSharing(tripId, {
      enabled: formChecked(formData, "shareEnabled"),
      password: formString(formData, "sharePassword"),
      removePassword: formChecked(formData, "removePassword"),
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath("/");
  return { ok: true };
}

/** Removes one reader's device; the app then loses access to the trip. */
export async function removeViewerAction(formData: FormData) {
  await requireUser();
  const viewerId = formId(formData, "viewerId");
  if (viewerId === null) return;

  const device = await ignoringMissing(removeViewer(viewerId));
  if (device) revalidatePath(`/trips/${device.tripId}/settings`);
}

export async function removeAllViewersAction(formData: FormData) {
  await requireUser();
  const tripId = formId(formData, "tripId");
  if (tripId === null) return;

  await removeAllViewers(tripId);
  revalidatePath(`/trips/${tripId}/settings`);
}

/** Creates a new link – the old one stops working afterwards. */
export async function rotateShareTokenAction(formData: FormData) {
  await requireUser();
  const tripId = formId(formData, "tripId");
  if (tripId === null) return;

  await rotateShareToken(tripId);
  revalidatePath(`/trips/${tripId}/settings`);
}
