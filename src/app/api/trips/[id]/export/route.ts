import { ServiceError } from "@/lib/errors";
import { albumResponse, tripAlbum } from "@/lib/export/album";
import { getI18n } from "@/lib/i18n/server";
import { getTrip } from "@/lib/trips";
import { handleWeb } from "@/lib/web-route";

export const dynamic = "force-dynamic";

/** The trip as an offline album (ZIP) – see `export/album.ts`. */
export async function GET(_request: Request, context: RouteContext<"/api/trips/[id]/export">) {
  return handleWeb(async () => {
    const trip = await getTrip(Number((await context.params).id));
    if (!trip) throw new ServiceError("trip_not_found");
    const { locale, t } = await getI18n();
    return albumResponse(await tripAlbum(trip, locale, t));
  });
}
