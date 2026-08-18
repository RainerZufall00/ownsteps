"use client";

import { createContext, useContext } from "react";

/**
 * Woher die Bild- und Video-URLs kommen. In der angemeldeten Ansicht ist das
 * `/api/photos` (die Sitzung weist aus). Über einen Share-Link steht hier
 * `/api/share-media/<token>`, damit der geheime Token in der URL steckt und die
 * Bilder nicht ohne ihn erreichbar sind. Bausteine bauen ihre URL als
 * `${base}/${photoId}/${variante}`.
 */
const MediaBaseContext = createContext<string>("/api/photos");

export const MediaBaseProvider = MediaBaseContext.Provider;

export function useMediaBase() {
  return useContext(MediaBaseContext);
}
