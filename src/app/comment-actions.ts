"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { failure } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { formId, formString, formText } from "@/lib/form-data";
import { clientAddress } from "@/lib/rate-limit";
import { postComment, removeComment } from "@/lib/services/comments";
import { resolveTripAccess } from "@/lib/share";
import { toViewComment, type ViewComment } from "@/lib/view-types";

export type CommentState = {
  error?: string;
  comment?: ViewComment;
};

export async function addCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  try {
    const { trip, comment } = await postComment({
      tripId: Number(formData.get("tripId")),
      stepId: Number(formData.get("stepId")),
      raw: {
        authorName: formString(formData, "authorName"),
        body: formString(formData, "body"),
      },
      clientKey: clientAddress(await headers()),
      // Guests prove access with the link's token, like their media URLs.
      resolveAccess: (trip) => resolveTripAccess(trip, formText(formData, "shareToken")),
    });

    revalidatePath(`/trips/${trip.id}`);
    revalidatePath(`/s/${trip.shareToken}`);

    return { comment: toViewComment(comment) };
  } catch (error) {
    return failure(error);
  }
}

/** Deleting is reserved for signed-in authors. */
export async function deleteCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const commentId = formId(formData, "commentId");
  const tripId = formId(formData, "tripId");
  if (commentId === null) return;

  try {
    await removeComment(commentId);
  } catch (error) {
    // Already gone – nothing to do.
    if (!(error instanceof ServiceError)) throw error;
  }
  if (tripId !== null) revalidatePath(`/trips/${tripId}`);
}
