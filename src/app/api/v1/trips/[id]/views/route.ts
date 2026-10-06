import { handle, idParam, noContent, readJson } from "@/lib/api/http";
import { requirePrincipal, requireReadableTrip } from "@/lib/api/principal";
import { stepViewsSchema } from "@/lib/api/schemas";
import { parseInput } from "@/lib/schemas";
import { deviceViewer, recordStepViews } from "@/lib/views";

export const dynamic = "force-dynamic";

/**
 * A reader's app reports the steps it has shown. Authors may call it too –
 * their views just aren't counted, so the app doesn't need to know who it is.
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/trips/[id]/views">) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const trip = await requireReadableTrip(principal, tripId);
    const { stepIds } = parseInput(stepViewsSchema, await readJson(request));
    if (principal.kind === "viewer") {
      await recordStepViews(trip.id, stepIds, deviceViewer(principal.device.id));
    }
    return noContent();
  });
}
