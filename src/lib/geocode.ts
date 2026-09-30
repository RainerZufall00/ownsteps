import "server-only";

import { MAPTILER_KEY } from "./env";

export type PlaceInfo = { placeName: string | null; countryCode: string | null };

export type PlaceHit = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

/**
 * Place search for the editor. Returns suggestions with coordinates so a
 * place can be set even when the photo carries no position.
 */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const term = query.trim();
  if (!MAPTILER_KEY || term.length < 2) return [];

  try {
    const url = new URL(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(term)}.json`,
    );
    url.searchParams.set("key", MAPTILER_KEY);
    url.searchParams.set("language", "de");
    url.searchParams.set("limit", "6");
    url.searchParams.set("autocomplete", "true");

    const response = await fetch(url, { next: { revalidate: 60 * 60 } });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      features?: {
        id?: string;
        place_name?: string;
        text?: string;
        center?: [number, number];
      }[];
    };

    return (data.features ?? [])
      .filter((f) => Array.isArray(f.center) && f.center.length === 2)
      .map((f, index) => ({
        id: f.id ?? `${index}`,
        name: f.place_name ?? f.text ?? "Unbekannter Ort",
        lon: f.center![0],
        lat: f.center![1],
      }));
  } catch {
    return [];
  }
}

type GeocodeFeature = {
  text?: string;
  place_type?: string[];
  properties?: { country_code?: string };
  context?: { id: string; text: string }[];
};

/**
 * Turns the GPS coordinates from the photos into a readable place
 * ("Lissabon, Portugal"). Without a MapTiler key the field stays empty and
 * can be filled by hand in the editor.
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
    // A missing place name is no reason to fail the upload.
    return { placeName: null, countryCode: null };
  }
}
