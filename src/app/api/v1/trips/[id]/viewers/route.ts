import { handle, idParam, json, noContent } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { viewerDto } from "@/lib/api/serialize";
import { removeAllViewers, viewersOf } from "@/lib/services/viewers";

export const dynamic = "force-dynamic";

/** The readers who follow this trip in the app ([D17]). */
export async function GET(request: Request, context: RouteContext<"/api/v1/trips/[id]/viewers">) {
  return handle(async () => {
    await requireAuthor(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const viewers = await viewersOf(tripId);
    return json({ items: viewers.map(viewerDto), nextCursor: null });
  });
}

/** Removes every reader's device at once. */
export async function DELETE(request: Request, context: RouteContext<"/api/v1/trips/[id]/viewers">) {
  return handle(async () => {
    await requireAuthor(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    await removeAllViewers(tripId);
    return noContent();
  });
}
