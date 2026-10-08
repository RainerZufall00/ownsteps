import { handle, idParam, json } from "@/lib/api/http";
import { requireAuthor, requireReadableTrip } from "@/lib/api/principal";
import { immichStatus, startImmichExport } from "@/lib/export/immich";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

async function context(request: Request, params: Promise<{ id: string }>) {
  const principal = await requireAuthor(request);
  const trip = await requireReadableTrip(principal, idParam((await params).id, "trip_not_found"));
  return { user: principal.user, trip, ...(await getI18n()) };
}

/**
 * Sending the trip to the author's Immich (connected in the web settings):
 * GET is the progress, POST starts it.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/trips/[id]/immich">) {
  return handle(async () => {
    const { user, trip, locale, t } = await context(request, ctx.params);
    return json(immichStatus(user, trip.id, locale, t));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/v1/trips/[id]/immich">) {
  return handle(async () => {
    const { user, trip, locale, t } = await context(request, ctx.params);
    startImmichExport(user, trip, locale, t);
    return json(immichStatus(user, trip.id, locale, t), 202);
  });
}
