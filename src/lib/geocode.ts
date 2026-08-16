import "server-only";

import { MAPTILER_KEY } from "./env";

export type PlaceInfo = { placeName: string | null; countryCode: string | null };

type GeocodeFeature = {
  text?: string;
  place_type?: string[];
  properties?: { country_code?: string };
  context?: { id: string; text: string }[];
};

/**
 * Wandelt die GPS-Koordinaten aus den Fotos in einen lesbaren Ort um
 * ("Lissabon, Portugal"). Ohne MapTiler-Key bleibt das Feld leer und kann
 * im Editor von Hand gefüllt werden.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<PlaceInfo> {
  if (!MAPTILER_KEY) return { placeName: null, countryCode: null };

  try {
    const url = new URL(
      `https://api.maptiler.com/geocoding/${lon},${lat}.json`,
    );
    url.searchParams.set("key", MAPTILER_KEY);
    url.searchParams.set("language", "de");
    url.searchParams.set("types", "place,region,country");

    const response = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) return { placeName: null, countryCode: null };

    const data = (await response.json()) as { features?: GeocodeFeature[] };
    const features = data.features ?? [];
    if (features.length === 0) return { placeName: null, countryCode: null };

    const place =
      features.find((f) => f.place_type?.includes("place")) ?? features[0];
    const country =
      features.find((f) => f.place_type?.includes("country")) ??
      place.context?.find((c) => c.id.startsWith("country"));

    const countryName =
      country && "text" in country ? (country.text ?? null) : null;
    const placeName = [place.text, countryName]
      .filter((part) => part && part.trim().length > 0)
      .join(", ");

    return {
      placeName: placeName || null,
      countryCode:
        place.properties?.country_code?.toUpperCase() ??
        (country as GeocodeFeature | undefined)?.properties?.country_code?.toUpperCase() ??
        null,
    };
  } catch {
    // Ein fehlender Ortsname ist kein Grund, den Upload scheitern zu lassen.
    return { placeName: null, countryCode: null };
  }
}
