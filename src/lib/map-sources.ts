/**
 * Where the fallback map's tiles come from when no MapTiler key is set.
 * Shared by the style (map.ts) and the CSP (proxy.ts), which must allow
 * exactly this origin – and only when the fallback is in use. Deliberately
 * free of `server-only` and of the database: the proxy imports it.
 */
export const OSM_TILE_ORIGIN = "https://tile.openstreetmap.org";

/** Whether the map falls back to OpenStreetMap. */
export function usesOsmFallback() {
  return !process.env.MAPTILER_KEY?.trim();
}
