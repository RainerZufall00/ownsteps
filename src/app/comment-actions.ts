"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  addComment,
  COMMENT_MAX_LENGTH,
  mayComment,
  deleteComment,
  NAME_MAX_LENGTH,
  stepBelongsToTrip,
} from "@/lib/comments";
import { resolveTripAccess } from "@/lib/share";
import { getTrip } from "@/lib/trips";
import type { ViewComment } from "@/lib/view-types";

export type CommentState = {
  error?: string;
  comment?: ViewComment;
};

async function clientKey() {
  const store = await headers();
  return (
    store.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    store.get("x-real-ip") ||
    "unknown"
  );
}

export async function addCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const tripId = Number(formData.get("tripId"));
  const stepId = Number(formData.get("stepId"));
  const authorName = String(formData.get("authorName") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!Number.isInteger(tripId) || !Number.isInteger(stepId)) {
    return { error: "Beitrag nicht gefunden." };
  }
  if (authorName.length < 2) return { error: "Bitte einen Namen angeben." };
  if (authorName.length > NAME_MAX_LENGTH) {
    return { error: "Der Name ist zu lang." };
  }
  if (body.length < 1) return { error: "Der Kommentar ist leer." };
  if (body.length > COMMENT_MAX_LENGTH) {
    return { error: "Der Kommentar ist zu lang." };
  }

  // Whoever may see the trip may comment on it.
  const trip = await getTrip(tripId);
  if (!trip) return { error: "Reise nicht gefunden." };
  const access = await resolveTripAccess(trip);
  if (access.kind !== "owner" && access.kind !== "guest") {
    return { error: "Diese Reise ist nicht freigegeben." };
  }
  if (!(await stepBelongsToTrip(stepId, tripId))) {
    return { error: "Beitrag nicht gefunden." };
  }

  if (!mayComment(await clientKey())) {
    return { error: "Bitte einen Moment warten und dann erneut senden." };
  }

  const created = await addComment({ stepId, tripId, authorName, body });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/s/${trip.shareToken}`);

  return {
    comment: {
      id: created.id,
      authorName: created.authorName,
      body: created.body,
      createdAt: created.createdAt,
    },
  };
}

/** Deleting is reserved for signed-in authors. */
export async function deleteCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const commentId = Number(formData.get("commentId"));
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(commentId)) return;

  await deleteComment(commentId);
  if (Number.isInteger(tripId)) revalidatePath(`/trips/${tripId}`);
}
