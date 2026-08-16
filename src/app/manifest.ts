import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/env";

/** Macht die App auf dem Handy als Symbol installierbar. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: "Reisetagebuch mit Karte, Timeline und Fotos.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf9f6",
    theme_color: "#fbf9f6",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
