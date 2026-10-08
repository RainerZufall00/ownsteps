import "server-only";

import packageJson from "../../package.json";
import { MAPTILER_KEY, PUBLIC_URL } from "./env";
import { DICTIONARIES } from "./i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "./i18n/locales";

import type { PlaceHit, PlaceInfo } from "./view-types";

/**
 * Place names for steps, and the place search in the editor. With a
 * MapTiler key MapTiler answers both; without one, OpenStreetMap's free
 * services do ([D24]): Photon for the search (made for search-as-you-type)
 * and Nominatim for names from coordinates. Both ask for an identifying
 * User-Agent and moderate use, so requests go out at most one per second
 * per service. `GEOCODING=off` keeps every lookup on the server.
 */

const NO_PLACE: PlaceInfo = { placeName: null, countryCode: null };

const PHOTON = "https://photon.komoot.io";
const NOMINATIM = "https://nominatim.openstreetmap.org";
/** Languages Photon answers in; others get its default (local names). */
const PHOTON_LANGUAGES = new Set(["de", "en", "fr", "it"]);

const USER_AGENT =
  `OwnSteps/${packageJson.version} (self-hosted travel journal; ` +
  `https://github.com/RainerZufall00/ownsteps${PUBLIC_URL ? `; ${PUBLIC_URL}` : ""})`;

function provider() {
  // Read per call: tests switch it.
  if (process.env.GEOCODING?.trim().toLowerCase() === "off") return "off" as const;
  return MAPTILER_KEY ? ("maptiler" as const) : ("osm" as const);
}

const globalForGeocode = globalThis as unknown as { __ownstepsGeocodeQueue?: Map<string, Promise<void>> };
const queues = (globalForGeocode.__ownstepsGeocodeQueue ??= new Map());

/**
 * Runs `request` no sooner than a second after the previous one to the same
 * service – their usage policies ask for at most one request per second.
 */
async function throttled<T>(service: string, request: () => Promise<T>, gap = 1000): Promise<T> {
  const previous = queues.get(service) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => (release = resolve));
  queues.set(service, previous.then(() => next));
  await previous;
  try {
    return await request();
  } finally {
    setTimeout(release, gap);
  }
}

async function fetchJson<T>(url: URL, revalidate: number): Promise<T | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate },
  });
  return response.ok ? ((await response.json()) as T) : null;
}

// MARK: Search

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
  if (term.length < 2) return [];
  try {
    switch (provider()) {
      case "maptiler":
        return await searchMapTiler(term, language);
      case "osm":
        return await throttled("photon", () => searchPhoton(term, language));
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/** A MapTiler geocoding request for `query` (a search term or "lon,lat"). */
function mapTilerUrl(query: string, language: Locale, params: Record<string, string>) {
  const url = new URL(`https://api.maptiler.com/geocoding/${query}.json`);
  url.searchParams.set("key", MAPTILER_KEY);
  url.searchParams.set("language", language);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function searchMapTiler(term: string, language: Locale): Promise<PlaceHit[]> {
  const data = await fetchJson<{
    features?: { id?: string; place_name?: string; text?: string; center?: [number, number] }[];
  }>(mapTilerUrl(encodeURIComponent(term), language, { limit: "6", autocomplete: "true" }), 60 * 60);
  return (data?.features ?? [])
    .filter((f) => Array.isArray(f.center) && f.center.length === 2)
    .map((f, index) => ({
      id: f.id ?? `${index}`,
      name: f.place_name ?? f.text ?? DICTIONARIES[language].place.unknown,
      lon: f.center![0],
      lat: f.center![1],
    }));
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

/** "Nazaré, Portugal" – the name, then what tells places of that name apart. */
export function photonName(properties: NonNullable<PhotonFeature["properties"]>) {
  const parts: string[] = [];
  for (const part of [properties.name, properties.city, properties.state, properties.country]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  return parts.join(", ");
}

async function searchPhoton(term: string, language: Locale): Promise<PlaceHit[]> {
  const url = new URL(`${PHOTON}/api`);
  url.searchParams.set("q", term);
  url.searchParams.set("limit", "6");
  if (PHOTON_LANGUAGES.has(language)) url.searchParams.set("lang", language);
  const data = await fetchJson<{ features?: PhotonFeature[] }>(url, 60 * 60);
  return (data?.features ?? [])
    .filter((f) => f.geometry?.coordinates?.length === 2 && f.properties)
    .map((f, index) => ({
      id: f.properties!.osm_id ? `${f.properties!.osm_type}${f.properties!.osm_id}` : `${index}`,
      name: photonName(f.properties!) || DICTIONARIES[language].place.unknown,
      lon: f.geometry!.coordinates![0],
      lat: f.geometry!.coordinates![1],
    }));
}

// MARK: Reverse

/**
 * Turns the GPS coordinates from the photos into a readable place
 * ("Lisbon, Portugal"), in the author's UI language – the name is stored with
 * the step, so readers see it as the author wrote it. If no service answers,
 * the field stays empty and can be filled by hand in the editor.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  language: Locale = DEFAULT_LOCALE,
): Promise<PlaceInfo> {
  try {
    switch (provider()) {
      case "maptiler":
        return await reverseMapTiler(lat, lon, language);
      case "osm":
        return await throttled("nominatim", () => reverseNominatim(lat, lon, language));
      default:
        return NO_PLACE;
    }
  } catch {
    // A missing place name is no reason to fail the upload.
    return NO_PLACE;
  }
}

type MapTilerFeature = {
  text?: string;
  place_type?: string[];
  properties?: { country_code?: string };
  context?: { id: string; text: string }[];
};

async function reverseMapTiler(lat: number, lon: number, language: Locale): Promise<PlaceInfo> {
  const data = await fetchJson<{ features?: MapTilerFeature[] }>(
    mapTilerUrl(`${lon},${lat}`, language, { types: "place,region,country" }),
    60 * 60 * 24 * 30,
  );
  const features = data?.features ?? [];
  if (features.length === 0) return NO_PLACE;

  const place = features.find((f) => f.place_type?.includes("place")) ?? features[0];
  const country =
    features.find((f) => f.place_type?.includes("country")) ??
    place.context?.find((c) => c.id.startsWith("country"));

  const countryName = country && "text" in country ? (country.text ?? null) : null;
  const placeName = [place.text, countryName]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");

  return {
    placeName: placeName || null,
    countryCode:
      place.properties?.country_code?.toUpperCase() ??
      (country as MapTilerFeature | undefined)?.properties?.country_code?.toUpperCase() ??
      null,
  };
}

type NominatimAddress = Record<string, string | undefined>;

/**
 * "Porto, Portugal" from Nominatim's address: the town, not the district
 * Nominatim names first in cities ("Cedofeita, Santo Ildefonso …").
 */
export function nominatimPlace(address: NominatimAddress): PlaceInfo {
  const locality = ["city", "town", "village", "municipality", "hamlet", "suburb", "county", "state"]
    .map((key) => address[key])
    .find(Boolean);
  const placeName = [locality, address.country].filter(Boolean).join(", ");
  return {
    placeName: placeName || null,
    countryCode: address.country_code?.toUpperCase() ?? null,
  };
}

async function reverseNominatim(lat: number, lon: number, language: Locale): Promise<PlaceInfo> {
  const url = new URL(`${NOMINATIM}/reverse`);
  url.searchParams.set("lat", lat.toFixed(5));
  url.searchParams.set("lon", lon.toFixed(5));
  url.searchParams.set("format", "jsonv2");
  // Town level – a step is a place, not a street address.
  url.searchParams.set("zoom", "10");
  url.searchParams.set("accept-language", language);
  const data = await fetchJson<{ address?: NominatimAddress }>(url, 60 * 60 * 24 * 30);
  return data?.address ? nominatimPlace(data.address) : NO_PLACE;
}
