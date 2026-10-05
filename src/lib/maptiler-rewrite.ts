// Kept available here because the map route needs both together.
export { publicOrigin } from "./origin";

const UPSTREAM = "https://api.maptiler.com";
const MAPTILER_URL_RE = /https:\/\/api\.maptiler\.com\/([^"'\s\\]*)/g;

/**
 * What a MapTiler style loads: the style itself and its sprites (`maps/`),
 * tile sets (`tiles/`), glyphs (`fonts/`) and images (`resources/`). The
 * proxy is public because share links need the map, so everything else –
 * geocoding, static maps, the data API – must not ride on our key.
 */
const MAP_ASSET_RE = /^(maps|tiles|fonts|resources)\//;

export function isMapAsset(path: string) {
  let decoded: string;
  try {
    // Upstream decodes too: `st%61tic` must count as `static`.
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return MAP_ASSET_RE.test(decoded) && !decoded.toLowerCase().split("/").includes("static");
}

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
