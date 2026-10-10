import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { MANIFEST_BASE } from "@/lib/web-manifest";

/**
 * Makes the app installable as an icon on phones. Share links bring their
 * own (`s/[token]/manifest.webmanifest`), so a reader's icon opens the trip.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { locale, t } = await getI18n();
  return {
    ...MANIFEST_BASE,
    lang: locale,
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: t.meta.manifestDescription,
    start_url: "/",
  };
}
