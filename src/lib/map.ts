import type { StyleSpecification } from "maplibre-gl";
import { MAP_STYLE, MAPTILER_KEY } from "./env";

/**
 * Fallback map so the app shows something useful even without a MapTiler key.
 * For permanent use a key looks much nicer and is licensed more cleanly.
 */
const OSM_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export type MapStyleConfig = string | StyleSpecification;

/** Resolved on the server and handed to the map component. */
export function getMapStyle(): MapStyleConfig {
  if (!MAPTILER_KEY) return OSM_FALLBACK;
  return `/api/map/maps/${MAP_STYLE}/style.json`;
}
