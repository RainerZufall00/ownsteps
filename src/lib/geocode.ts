import "server-only";

import { MAPTILER_KEY } from "./env";
import { DICTIONARIES } from "./i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "./i18n/locales";

import type { PlaceHit, PlaceInfo } from "./view-types";

const NO_PLACE: PlaceInfo = { placeName: null, countryCode: null };

/** A MapTiler geocoding request for `query` (a search term or "lon,lat"). */
function geocodingUrl(query: string, language: Locale, params: Record<string, string>) {
  const url = new URL(`https://api.maptiler.com/geocoding/${query}.json`);
  url.searchParams.set("key", MAPTILER_KEY);
  url.searchParams.set("language", language);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

/**
 * Place search for the editor. Returns suggestions with coordinates so a
 * place can be set even when the photo carries no position. Names come in
 * the author's UI language.
 */
export async function searchPlaces(
  query: string,
  language: Locale = DEFAULT_LOCALE,
): Promise<PlaceHit[]> {
  const term = query.trim();
  if (!MAPTILER_KEY || term.length < 2) return [];

  try {
    const url = geocodingUrl(encodeURIComponent(term), language, {
      limit: "6",
      autocomplete: "true",
    });

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
        name: f.place_name ?? f.text ?? DICTIONARIES[language].place.unknown,
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
 * ("Lisbon, Portugal"), in the author's UI language – the name is stored with
 * the step, so readers see it as the author wrote it. Without a MapTiler key
 * the field stays empty and can be filled by hand in the editor.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  language: Locale = DEFAULT_LOCALE,
): Promise<PlaceInfo> {
  if (!MAPTILER_KEY) return NO_PLACE;

  try {
    const url = geocodingUrl(`${lon},${lat}`, language, { types: "place,region,country" });

    const response = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) return NO_PLACE;

    const data = (await response.json()) as { features?: GeocodeFeature[] };
    const features = data.features ?? [];
    if (features.length === 0) return NO_PLACE;

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
    return NO_PLACE;
  }
}
