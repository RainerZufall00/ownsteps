"use client";

import { createContext, useContext } from "react";

/**
 * Where image and video URLs come from. In the signed-in view that's
 * `/api/photos` (the session authenticates). Through a share link it's
 * `/api/share-media/<token>`, so the secret token is part of the URL and the
 * images can't be reached without it. Components build their URL as
 * `${base}/${photoId}/${variant}`.
 */
const MediaBaseContext = createContext<string>("/api/photos");

export const MediaBaseProvider = MediaBaseContext.Provider;

export function useMediaBase() {
  return useContext(MediaBaseContext);
}
