import type { StyleSpecification } from "maplibre-gl";
import { MAP_STYLE, MAPTILER_KEY } from "./env";

/**
 * Notfall-Karte, damit die App auch ohne MapTiler-Key etwas Sinnvolles zeigt.
 * Für dauerhaften Betrieb ist ein Key deutlich schöner und sauberer lizenziert.
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

/** Wird serverseitig aufgelöst und an die Karten-Komponente gereicht. */
export function getMapStyle(): MapStyleConfig {
  if (!MAPTILER_KEY) return OSM_FALLBACK;
  return `/api/map/maps/${MAP_STYLE}/style.json`;
}
