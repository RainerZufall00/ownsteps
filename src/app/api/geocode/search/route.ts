import { getCurrentUser } from "@/lib/auth";
import { searchPlaces } from "@/lib/geocode";

/** Vorschläge für die Ortssuche im Editor. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await searchPlaces(query) });
}
