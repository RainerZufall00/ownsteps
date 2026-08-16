import { getCurrentUser } from "@/lib/auth";
import { reverseGeocode } from "@/lib/geocode";

/** Ortsnamen nachschlagen, wenn der Pin im Editor von Hand gesetzt wurde. */
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
