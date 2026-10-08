import { albumResponse, tripAlbum } from "@/lib/export/album";
import { handle, idParam } from "@/lib/api/http";
import { requireAuthor, requireReadableTrip } from "@/lib/api/principal";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** The trip as an offline album (ZIP), for authors. */
export async function GET(request: Request, context: RouteContext<"/api/v1/trips/[id]/export">) {
  return handle(async () => {
    const principal = await requireAuthor(request);
    const trip = await requireReadableTrip(principal, idParam((await context.params).id, "trip_not_found"));
    const { locale, t } = await getI18n();
    return albumResponse(await tripAlbum(trip, locale, t));
  });
}
