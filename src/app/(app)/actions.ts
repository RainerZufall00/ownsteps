"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withDate } from "@/lib/format";
import { deletePhoto, setPhotoCaption } from "@/lib/photos";
import { newShareToken } from "@/lib/share";
import {
  createDraftStep,
  createTrip,
  deleteStep,
  deleteTrip,
  getStep,
  updateStep,
  updateTrip,
} from "@/lib/trips";

export type ActionState = { error?: string; ok?: boolean };

export async function createTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Die Reise braucht einen Namen." };

  const trip = await createTrip({
    title,
    summary: String(formData.get("summary") ?? ""),
    startDate: String(formData.get("startDate") ?? "") || null,
    userId: user.id,
  });

  revalidatePath("/");
  redirect(`/trips/${trip.id}`);
}

export async function updateTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  const title = String(formData.get("title") ?? "").trim();
  if (!Number.isInteger(tripId)) return { error: "Reise nicht gefunden." };
  if (!title) return { error: "Die Reise braucht einen Namen." };

  await updateTrip(tripId, {
    title,
    summary: String(formData.get("summary") ?? "").trim() || null,
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTripAction(formData: FormData) {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(tripId)) return;

  await deleteTrip(tripId);
  revalidatePath("/");
  redirect("/");
}

/** Legt einen leeren Beitrag an und springt direkt in den Editor. */
export async function startStepAction(formData: FormData) {
  const user = await requireUser();
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(tripId)) return;

  const step = await createDraftStep(tripId, user.id);
  redirect(`/trips/${tripId}/steps/${step.id}`);
}

export async function saveStepAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const stepId = Number(formData.get("stepId"));
  if (!Number.isInteger(stepId)) return { error: "Beitrag nicht gefunden." };

  const step = await getStep(stepId);
  if (!step) return { error: "Beitrag nicht gefunden." };

  const body = String(formData.get("body") ?? "").trim();
  const placeName = String(formData.get("placeName") ?? "").trim();
  if (!body && !placeName && step.photos.length === 0) {
    return { error: "Bitte einen Ort, Text oder ein Foto hinzufügen." };
  }

  // Nur das Datum ist einstellbar; die Uhrzeit aus den EXIF-Daten bleibt
  // erhalten und sortiert mehrere Beiträge desselben Tages.
  const occurredRaw = String(formData.get("occurredDate") ?? "");
  const occurredAt = occurredRaw
    ? withDate(step.occurredAt, occurredRaw)
    : step.occurredAt;

  const latRaw = String(formData.get("lat") ?? "");
  const lonRaw = String(formData.get("lon") ?? "");
  const lat = latRaw ? Number(latRaw) : null;
  const lon = lonRaw ? Number(lonRaw) : null;

  await updateStep(stepId, {
    body,
    occurredAt,
    lat: lat !== null && Number.isFinite(lat) ? lat : null,
    lon: lon !== null && Number.isFinite(lon) ? lon : null,
    placeName: placeName || null,
    published: true,
  });

  // Bildunterschriften reisen im selben Formular mit.
  for (const photo of step.photos) {
    const feld = formData.get(`caption_${photo.id}`);
    if (feld === null) continue;
    const caption = String(feld).trim().slice(0, 500);
    if ((photo.caption ?? "") !== caption) {
      await setPhotoCaption(photo.id, caption || null);
    }
  }

  revalidatePath(`/trips/${step.tripId}`);
  revalidatePath("/");
  redirect(`/trips/${step.tripId}#step-${stepId}`);
}

export async function deleteStepAction(formData: FormData) {
  await requireUser();
  const stepId = Number(formData.get("stepId"));
  if (!Number.isInteger(stepId)) return;

  const step = await getStep(stepId);
  if (!step) return;

  await deleteStep(stepId);
  revalidatePath(`/trips/${step.tripId}`);
  revalidatePath("/");
  redirect(`/trips/${step.tripId}`);
}

export async function deletePhotoAction(formData: FormData) {
  await requireUser();
  const photoId = Number(formData.get("photoId"));
  const stepId = Number(formData.get("stepId"));
  if (!Number.isInteger(photoId)) return;

  await deletePhoto(photoId);
  if (Number.isInteger(stepId)) {
    const step = await getStep(stepId);
    if (step) revalidatePath(`/trips/${step.tripId}/steps/${stepId}`);
  }
}

export async function setCoverPhotoAction(formData: FormData) {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  const photoId = Number(formData.get("photoId"));
  if (!Number.isInteger(tripId) || !Number.isInteger(photoId)) return;

  await updateTrip(tripId, { coverPhotoId: photoId });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
}

export async function updateShareAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(tripId)) return { error: "Reise nicht gefunden." };

  const enabled = formData.get("shareEnabled") === "on";
  const password = String(formData.get("sharePassword") ?? "");
  const removePassword = formData.get("removePassword") === "on";

  const patch: Parameters<typeof updateTrip>[1] = { shareEnabled: enabled };
  if (removePassword) {
    patch.sharePasswordHash = null;
  } else if (password) {
    if (password.length < 4) {
      return { error: "Das Passwort braucht mindestens 4 Zeichen." };
    }
    patch.sharePasswordHash = await bcrypt.hash(password, 12);
  }

  await updateTrip(tripId, patch);
  revalidatePath(`/trips/${tripId}/share`);
  revalidatePath("/");
  return { ok: true };
}

/** Erzeugt einen neuen Link – der alte funktioniert danach nicht mehr. */
export async function rotateShareTokenAction(formData: FormData) {
  await requireUser();
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(tripId)) return;

  await updateTrip(tripId, { shareToken: newShareToken() });
  revalidatePath(`/trips/${tripId}/share`);
}
