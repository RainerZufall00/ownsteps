import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, steps } from "@/db/schema";
import { recordChange } from "./changes";
import { COMMENT_MAX_LENGTH, NAME_MAX_LENGTH } from "./limits";

/** Who wrote a comment, beyond the name: lets the apps tell their own from others'. */
export type CommentSender = { userId: number } | { viewerDeviceId: number };

export async function addComment(input: {
  stepId: number;
  tripId: number;
  authorName: string;
  body: string;
  /** None for guests on the web. */
  sender?: CommentSender;
  /** The comment being answered, see `threadRoot`. */
  parentId?: number | null;
}) {
  const [created] = await db
    .insert(comments)
    .values({
      stepId: input.stepId,
      tripId: input.tripId,
      authorName: input.authorName.trim().slice(0, NAME_MAX_LENGTH),
      body: input.body.trim().slice(0, COMMENT_MAX_LENGTH),
      parentId: input.parentId ?? null,
      ...input.sender,
    })
    .returning();
  await recordChange(created.tripId, "comment", created.id, "upsert");
  return created;
}

/**
 * A comment keeps the name it was written under, so a new account name has
 * to reach the old ones too – otherwise the name someone just got rid of
 * stays on every trip.
 */
export async function renameCommentAuthor(userId: number, name: string) {
  const renamed = await db
    .update(comments)
    .set({ authorName: name })
    .where(eq(comments.userId, userId))
    .returning({ id: comments.id, tripId: comments.tripId });
  for (const comment of renamed) {
    await recordChange(comment.tripId, "comment", comment.id, "upsert");
  }
}

/**
 * Threads are one level deep: answering an answer joins the same thread.
 * Undefined when the comment isn't on this step.
 */
export async function threadRoot(commentId: number, stepId: number) {
  const parent = await db
    .select({ id: comments.id, parentId: comments.parentId })
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.stepId, stepId)))
    .get();
  return parent && (parent.parentId ?? parent.id);
}

/** Returns whether there was a comment to delete. */
export async function deleteComment(commentId: number) {
  const [deleted] = await db
    .delete(comments)
    .where(eq(comments.id, commentId))
    .returning({ tripId: comments.tripId });
  if (deleted) await recordChange(deleted.tripId, "comment", commentId, "delete");
  return Boolean(deleted);
}

/**
 * Whether the step belongs to this trip and is published – drafts don't show
 * in the timeline, so there's nothing to comment on.
 */
export async function isCommentableStep(stepId: number, tripId: number) {
  const step = await db
    .select({ id: steps.id })
    .from(steps)
    .where(and(eq(steps.id, stepId), eq(steps.tripId, tripId), eq(steps.published, true)))
    .get();
  return step !== undefined;
}
