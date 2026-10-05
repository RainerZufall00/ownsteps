"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { failure } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { clientAddress } from "@/lib/rate-limit";
import { postComment, removeComment } from "@/lib/services/comments";
import { resolveTripAccess } from "@/lib/share";
import type { ViewComment } from "@/lib/view-types";

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
        authorName: String(formData.get("authorName") ?? ""),
        body: String(formData.get("body") ?? ""),
      },
      clientKey: clientAddress(await headers()),
      // Guests prove access with the link's token, like their media URLs.
      resolveAccess: (trip) => {
        const token = formData.get("shareToken");
        return resolveTripAccess(trip, typeof token === "string" ? token : null);
      },
    });

    revalidatePath(`/trips/${trip.id}`);
    revalidatePath(`/s/${trip.shareToken}`);

    return {
      comment: {
        id: comment.id,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/** Deleting is reserved for signed-in authors. */
export async function deleteCommentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const commentId = Number(formData.get("commentId"));
  const tripId = Number(formData.get("tripId"));
  if (!Number.isInteger(commentId)) return;

  await removeComment(commentId);
  if (Number.isInteger(tripId)) revalidatePath(`/trips/${tripId}`);
}
