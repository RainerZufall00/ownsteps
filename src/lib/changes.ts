import "server-only";

import { and, asc, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { changes, type Change } from "@/db/schema";

type ChangeEntity = Change["entity"];

/**
 * Appends to the change log. Called from the data-access functions that
 * write, so every path – web UI, API, cleanup jobs – ends up in the feed.
 */
export async function recordChange(
  tripId: number,
  entity: ChangeEntity,
  entityId: number,
  op: Change["op"],
) {
  await db.insert(changes).values({ tripId, entity, entityId, op });
}

/**
 * Changes after `since`, optionally limited to some trips. Returns at most
 * `limit` entries; `hasMore` tells the client to ask again right away.
 */
export async function changesSince(
  since: number,
  options: { tripIds?: number[]; limit?: number } = {},
) {
  const limit = options.limit ?? 500;
  if (options.tripIds && options.tripIds.length === 0) {
    return { entries: [] as Change[], cursor: since, hasMore: false };
  }
  const where = options.tripIds
    ? and(gt(changes.seq, since), inArray(changes.tripId, options.tripIds))
    : gt(changes.seq, since);

  const rows = await db
    .select()
    .from(changes)
    .where(where)
    .orderBy(asc(changes.seq))
    .limit(limit + 1);

  const entries = rows.slice(0, limit);
  return {
    entries,
    cursor: entries.at(-1)?.seq ?? since,
    hasMore: rows.length > limit,
  };
}

/** The newest cursor, so a fresh client can start from "now". */
export async function latestCursor() {
  const [row] = await db
    .select({ seq: sql<number | null>`max(${changes.seq})` })
    .from(changes);
  return row?.seq ?? 0;
}
