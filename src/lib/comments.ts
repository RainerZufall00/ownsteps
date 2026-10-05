import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, steps } from "@/db/schema";
import { recordChange } from "./changes";
import { COMMENT_MAX_LENGTH, NAME_MAX_LENGTH } from "./limits";

export { COMMENT_MAX_LENGTH, NAME_MAX_LENGTH };

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

export async function getComment(commentId: number) {
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteComment(commentId: number) {
  const [deleted] = await db
    .delete(comments)
    .where(eq(comments.id, commentId))
    .returning({ tripId: comments.tripId });
  if (deleted) await recordChange(deleted.tripId, "comment", commentId, "delete");
}

/** Checks that the step really belongs to this trip. */
export async function stepBelongsToTrip(stepId: number, tripId: number) {
  const rows = await db
    .select({ id: steps.id })
    .from(steps)
    .where(and(eq(steps.id, stepId), eq(steps.tripId, tripId)))
    .limit(1);
  return rows.length > 0;
}
