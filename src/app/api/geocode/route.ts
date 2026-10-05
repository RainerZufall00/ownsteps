import { ServiceError } from "@/lib/errors";
import { reverseGeocode } from "@/lib/geocode";
import { handleWeb } from "@/lib/web-route";

/** Look up the place name when the pin was set by hand in the editor. */
export async function GET(request: Request) {
  return handleWeb(async ({ locale }) => {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new ServiceError("invalid_request");
    }
    return Response.json(await reverseGeocode(lat, lon, locale));
  });
}
