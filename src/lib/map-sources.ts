/**
 * Where the map comes from. With a MapTiler key everything goes through
 * our own `/api/map` proxy (the key stays on the server). Without one the
 * map comes from OpenFreeMap – free, without a key or an account ([D24]):
 * its style and TileJSON go through the proxy too (to clean their
 * attributions, see `sanitizeAttributions`), tiles, fonts and sprites come
 * straight from its origin, which the CSP (proxy.ts) then allows.
 *
 * Deliberately free of `server-only` and of the database: the proxy imports it.
 */
export const OPENFREEMAP_ORIGIN = "https://tiles.openfreemap.org";

/** Raster tiles for still images (the album's route map) without a key. */
export const OSM_TILE_ORIGIN = "https://tile.openstreetmap.org";

/** OpenFreeMap's styles; any other `MAP_STYLE` falls back to the first. */
export const OPENFREEMAP_STYLES = ["liberty", "bright", "positron"] as const;

/** Whether the map comes from OpenFreeMap. */
export function usesOpenFreeMap() {
  return !process.env.MAPTILER_KEY?.trim();
}

/** The OpenFreeMap style for `MAP_STYLE` – MapTiler names like `hybrid` don't exist there. */
export function openFreeMapStyle(style = process.env.MAP_STYLE?.trim() ?? "") {
  return (OPENFREEMAP_STYLES as readonly string[]).includes(style) ? style : OPENFREEMAP_STYLES[0];
}
