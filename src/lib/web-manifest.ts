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

/** Roughly what fits under an icon on a home screen before it's cut off. */
const SHORT_NAME_LENGTH = 12;

/**
 * A home-screen label from a trip title: whole words as long as they fit,
 * the first word cut with an ellipsis if even that one is too long.
 */
export function shortName(title: string, max = SHORT_NAME_LENGTH) {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (Array.from(trimmed).length <= max) return trimmed;

  let label = "";
  for (const word of trimmed.split(" ")) {
    const next = label ? `${label} ${word}` : word;
    if (Array.from(next).length > max) break;
    label = next;
  }
  if (label) return label.replace(/[\s,.;:–-]+$/, "");
  return `${Array.from(trimmed).slice(0, max - 1).join("")}…`;
}
