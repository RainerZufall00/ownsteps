import { getCurrentUser } from "@/lib/auth";
import { reverseGeocode } from "@/lib/geocode";

/** Look up the place name when the pin was set by hand in the editor. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "Ungültige Koordinaten" }, { status: 400 });
  }

  return Response.json(await reverseGeocode(lat, lon));
}
