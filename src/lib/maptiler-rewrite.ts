// Kept available here because the map route needs both together.
export { publicOrigin } from "./origin";

const UPSTREAM = "https://api.maptiler.com";
const MAPTILER_URL_RE = /https:\/\/api\.maptiler\.com\/([^"'\s\\]*)/g;

/** Removes the API key from a forwarded URL query. */
function stripKey(query: string) {
  return query
    .split("&")
    .filter((pair) => pair.length > 0 && !pair.startsWith("key="))
    .join("&");
}

/**
 * Points every MapTiler URL in a JSON response (style.json, tiles.json,
 * sprite.json) at our own proxy and strips the API key.
 *
 * The result must be a full address, not a bare path: MapLibre loads the
 * vector tiles in a worker created from a blob. Its `location` is a `blob:`
 * URL and can't serve as a base to resolve `/api/map/…` – the tiles would
 * never arrive.
 *
 * Deliberately text-based: placeholders like {z}/{x}/{y} or {fontstack} must
 * stay untouched, a URL object would encode the braces.
 */
export function rewriteMapTilerJson(text: string, origin: string) {
  return text.replace(MAPTILER_URL_RE, (_full, rest: string) => {
    const [path, query = ""] = rest.split("?");
    const cleaned = stripKey(query);
    return `${origin}/api/map/${path}${cleaned ? `?${cleaned}` : ""}`;
  });
}

export { UPSTREAM };
