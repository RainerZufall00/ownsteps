import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, steps } from "@/db/schema";
import { recordChange } from "./changes";
import { COMMENT_MAX_LENGTH, NAME_MAX_LENGTH } from "./limits";

export async function addComment(input: {
  stepId: number;
  tripId: number;
  authorName: string;
  body: string;
}) {
  const [created] = await db
    .insert(comments)
    .values({
      stepId: input.stepId,
      tripId: input.tripId,
      authorName: input.authorName.trim().slice(0, NAME_MAX_LENGTH),
      body: input.body.trim().slice(0, COMMENT_MAX_LENGTH),
    })
    .returning();
  await recordChange(created.tripId, "comment", created.id, "upsert");
  return created;
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
