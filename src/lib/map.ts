import { MAP_STYLE } from "./env";
import { openFreeMapStyle, usesOpenFreeMap } from "./map-sources";

export type MapStyleConfig = string;

/**
 * The style URL, resolved on the server and handed to the map component.
 * Both providers go through our proxy (`/api/map`).
 */
export function getMapStyle(): MapStyleConfig {
  if (usesOpenFreeMap()) return `/api/map/ofm/styles/${openFreeMapStyle()}`;
  return `/api/map/maps/${MAP_STYLE}/style.json`;
}
