import { handle, json, readJson } from "@/lib/api/http";
import { requireAuthor, requirePrincipal } from "@/lib/api/principal";
import { tripCreateSchema } from "@/lib/api/schemas";
import { summaryDto, tripSummaryDto } from "@/lib/api/trips";
import { parseInput } from "@/lib/schemas";
import { createTripFor } from "@/lib/services/trips";
import { listTrips } from "@/lib/trips";

export const dynamic = "force-dynamic";

/** Authors get every trip, a viewer token just its one trip while it's shared. */
export async function GET(request: Request) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    const trips =
      principal.kind === "author"
        ? await listTrips()
        : (await listTrips({ ids: [principal.device.tripId] })).filter((trip) => trip.shareEnabled);
    return json({
      items: trips.map((trip) => summaryDto(principal, trip, request)),
      nextCursor: null,
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const principal = await requireAuthor(request);
    const input = parseInput(tripCreateSchema, await readJson(request));
    const trip = await createTripFor(principal.user.id, input);
    return json(await tripSummaryDto(principal, trip, request), 201);
  });
}
