import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, steps } from "@/db/schema";

export const COMMENT_MAX_LENGTH = 1500;
export const NAME_MAX_LENGTH = 60;

/**
 * Simple brake against accidental double clicks and blunt spamming.
 * Deliberately in memory: for an instance serving two families a table would
 * be overkill, and after a restart it may just as well start from zero.
 */
const recentEntries = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

export function mayComment(key: string) {
  const now = Date.now();
  const recent = (recentEntries.get(key) ?? []).filter(
    (time) => now - time < WINDOW_MS,
  );
  if (recent.length >= MAX_PER_WINDOW) {
    recentEntries.set(key, recent);
    return false;
  }
  recent.push(now);
  recentEntries.set(key, recent);

  // Memory must not grow without bound.
  if (recentEntries.size > 500) {
    for (const [entryKey, times] of recentEntries) {
      if (times.every((time) => now - time >= WINDOW_MS)) {
        recentEntries.delete(entryKey);
      }
    }
  }
  return true;
}

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
  return created;
}

export async function deleteComment(commentId: number) {
  await db.delete(comments).where(eq(comments.id, commentId));
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
