import { handle, json } from "@/lib/api/http";
import { requirePrincipal, requireReadableTrip } from "@/lib/api/principal";
import { changeDto } from "@/lib/api/serialize";
import { changesSince, latestCursor } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * What changed since `since` (a cursor from an earlier call) – the basis of
 * background refresh and local notifications in the app ([D16], O3).
 * Without `since`, returns no entries but the current cursor to start from.
 * A viewer only sees its trip; if sharing is off, it gets 403.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    const raw = new URL(request.url).searchParams.get("since");

    let tripIds: number[] | undefined;
    if (principal.kind === "viewer") {
      await requireReadableTrip(principal, principal.device.tripId);
      tripIds = [principal.device.tripId];
    }

    if (raw === null) {
      return json({ cursor: await latestCursor(), hasMore: false, changes: [] });
    }
    const since = Number(raw);
    const feed = await changesSince(Number.isInteger(since) && since >= 0 ? since : 0, {
      tripIds,
    });
    return json({
      cursor: feed.cursor,
      hasMore: feed.hasMore,
      changes: feed.entries.map(changeDto),
    });
  });
}
