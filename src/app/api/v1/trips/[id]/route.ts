import { handle, idParam, json, noContent, readJson } from "@/lib/api/http";
import { requireAuthor, requirePrincipal, requireReadableTrip } from "@/lib/api/principal";
import { tripPatchSchema } from "@/lib/api/schemas";
import { tripDetailFor, tripSummaryDto } from "@/lib/api/trips";
import { parseInput } from "@/lib/schemas";
import { patchTrip, removeTrip } from "@/lib/services/trips";

export const dynamic = "force-dynamic";

/** The trip with all published steps, photos and comments, oldest step first. */
export async function GET(request: Request, context: RouteContext<"/api/v1/trips/[id]">) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const trip = await requireReadableTrip(principal, tripId);
    return json(await tripDetailFor(principal, trip, request));
  });
}

export async function PATCH(request: Request, context: RouteContext<"/api/v1/trips/[id]">) {
  return handle(async () => {
    const principal = await requireAuthor(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const patch = parseInput(tripPatchSchema, await readJson(request));
    const trip = await patchTrip(tripId, patch);
    return json(await tripSummaryDto(principal, trip, request));
  });
}

/**
 * Deletes the trip with all steps, photos and comments – for good. The app
 * makes the author type the trip's name first, like the web UI does.
 */
export async function DELETE(request: Request, context: RouteContext<"/api/v1/trips/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    await removeTrip(idParam((await context.params).id, "trip_not_found"));
    return noContent();
  });
}
