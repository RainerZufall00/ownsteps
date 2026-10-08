import { ServiceError } from "@/lib/errors";
import { immichStatus, startImmichExport } from "@/lib/export/immich";
import { getI18n } from "@/lib/i18n/server";
import { getTrip } from "@/lib/trips";
import { handleWeb } from "@/lib/web-route";

export const dynamic = "force-dynamic";

async function tripFrom(context: RouteContext<"/api/trips/[id]/immich">) {
  const trip = await getTrip(Number((await context.params).id));
  if (!trip) throw new ServiceError("trip_not_found");
  return trip;
}

/** How sending the trip to Immich is going. */
export async function GET(_request: Request, context: RouteContext<"/api/trips/[id]/immich">) {
  return handleWeb(async ({ user }) => {
    const trip = await tripFrom(context);
    const { locale, t } = await getI18n();
    return Response.json(immichStatus(user, trip.id, locale, t));
  });
}

/** Starts sending the trip to the user's Immich; answers with the status. */
export async function POST(_request: Request, context: RouteContext<"/api/trips/[id]/immich">) {
  return handleWeb(async ({ user }) => {
    const trip = await tripFrom(context);
    const { locale, t } = await getI18n();
    startImmichExport(user, trip, locale, t);
    return Response.json(immichStatus(user, trip.id, locale, t), { status: 202 });
  });
}
