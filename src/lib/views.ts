import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { stepViews, steps } from "@/db/schema";
import { sha256Hex } from "./crypto";
import { VIEW_BATCH_MAX } from "./limits";

/**
 * Who saw which step – the numbers authors see on their steps. Each reader
 * counts once per step, however often they come back. Authors are never
 * recorded: the callers only pass readers in.
 */

/** A reader device in the app. */
export function deviceViewer(deviceId: number) {
  return `device:${deviceId}`;
}

/** A share-link visitor, known by a random cookie that isn't stored as is. */
export function webViewer(visitorId: string) {
  return `web:${sha256Hex(visitorId).slice(0, 32)}`;
}

/**
 * Records that `viewer` saw these steps. Only published steps of this trip
 * count; anything else in the list is ignored rather than an error, since a
 * step may have been deleted while the reader was looking at it.
 */
export async function recordStepViews(tripId: number, stepIds: number[], viewer: string) {
  const wanted = [...new Set(stepIds.filter(Number.isInteger))].slice(0, VIEW_BATCH_MAX);
  if (wanted.length === 0) return 0;
  const valid = await db
    .select({ id: steps.id })
    .from(steps)
    .where(and(eq(steps.tripId, tripId), eq(steps.published, true), inArray(steps.id, wanted)));
  if (valid.length === 0) return 0;
  const inserted = await db
    .insert(stepViews)
    .values(valid.map(({ id }) => ({ stepId: id, viewer })))
    .onConflictDoNothing()
    .returning({ stepId: stepViews.stepId });
  return inserted.length;
}

/** How many readers saw each step; steps nobody saw are missing. */
export async function countStepViews(stepIds: number[]): Promise<Map<number, number>> {
  if (stepIds.length === 0) return new Map();
  const rows = await db
    .select({ stepId: stepViews.stepId, views: count() })
    .from(stepViews)
    .where(inArray(stepViews.stepId, stepIds))
    .groupBy(stepViews.stepId);
  return new Map(rows.map((row) => [row.stepId, row.views]));
}
