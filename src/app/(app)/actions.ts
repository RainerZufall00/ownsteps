"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { removePhoto } from "@/lib/services/media";
import { removeStep, saveStep, startStep } from "@/lib/services/steps";
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

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function tripFields(formData: FormData) {
  return {
    title: text(formData, "title") ?? "",
    summary: text(formData, "summary"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
  };
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
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  try {
    await deleteTripConfirmed(
      Number(formData.get("tripId")),
      text(formData, "confirmTitle") ?? "",
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  redirect("/");
}

/** Creates an empty step and jumps straight into the editor. */
export async function startStepAction(formData: FormData) {
  const user = await requireUser();
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(tripId)) return;

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
      body: text(formData, "body") ?? "",
      placeName: text(formData, "placeName"),
      occurredDate: text(formData, "occurredDate"),
      lat: text(formData, "lat"),
      lon: text(formData, "lon"),
      captions,
    });
    tripId = step.tripId;
  } catch (error) {
    return failure(error);
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
  redirect(`/trips/${tripId}#step-${stepId}`);
}

export async function deleteStepAction(formData: FormData) {
  await requireUser();
  const stepId = Number(formData.get("stepId"));
  if (!Number.isInteger(stepId)) return;

  let step;
  try {
    step = await removeStep(stepId);
  } catch (error) {
    // Already gone – nothing to do.
    if (error instanceof ServiceError) return;
    throw error;
  }
  revalidatePath(`/trips/${step.tripId}`);
  revalidatePath("/");
  redirect(`/trips/${step.tripId}`);
}

export async function deletePhotoAction(formData: FormData) {
  await requireUser();
  const photoId = Number(formData.get("photoId"));
  if (!Number.isInteger(photoId)) return;

  const photo = await removePhoto(photoId);
  if (photo?.stepId) {
    revalidatePath(`/trips/${photo.tripId}/steps/${photo.stepId}`);
  }
}

export async function setCoverPhotoAction(formData: FormData) {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  const photoId = Number(formData.get("photoId"));
  if (!Number.isInteger(tripId) || !Number.isInteger(photoId)) return;

  await setCoverPhoto(tripId, photoId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
}

export async function updateShareAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  try {
    await updateSharing(tripId, {
      enabled: formData.get("shareEnabled") === "on",
      password: text(formData, "sharePassword") ?? "",
      removePassword: formData.get("removePassword") === "on",
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath("/");
  return { ok: true };
}

/** Creates a new link – the old one stops working afterwards. */
export async function rotateShareTokenAction(formData: FormData) {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(tripId)) return;

  await rotateShareToken(tripId);
  revalidatePath(`/trips/${tripId}/settings`);
}
