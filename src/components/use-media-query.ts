"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches – `null` on the server and during
 * hydration, where the screen is unknown. Layouts that differ by screen size
 * are therefore both rendered and switched by CSS; this hook only decides
 * which of them mounts the expensive parts (map, observers).
 */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

/** From here on the timeline sits beside the map (Tailwind's `xl`). */
export const DESKTOP_QUERY = "(min-width: 1280px)";

export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)") === true;
}
