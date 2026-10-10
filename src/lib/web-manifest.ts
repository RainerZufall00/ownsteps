import "server-only";

import type { MetadataRoute } from "next";

/**
 * What every web app manifest shares – the global one (`app/manifest.ts`)
 * and the one per share link (`app/s/[token]/manifest.webmanifest`).
 */
export const MANIFEST_BASE = {
  display: "standalone",
  background_color: "#fbf9f6",
  theme_color: "#fbf9f6",
  orientation: "portrait",
  icons: [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
} satisfies MetadataRoute.Manifest;
