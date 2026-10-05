import { searchPlaces } from "@/lib/geocode";
import { handleWeb } from "@/lib/web-route";

/** Suggestions for the place search in the editor. */
export async function GET(request: Request) {
  return handleWeb(async ({ locale }) => {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ hits: await searchPlaces(query, locale) });
  });
}
