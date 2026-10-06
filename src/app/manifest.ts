import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";

/** Makes the app installable as an icon on phones. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { locale, t } = await getI18n();
  return {
    lang: locale,
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: t.meta.manifestDescription,
    start_url: "/",
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
  };
}
