import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { getTripByShareToken, resolveTripAccess } from "@/lib/share";
import { MANIFEST_BASE } from "@/lib/web-manifest";

export const dynamic = "force-dynamic";

/**
 * The share link's own manifest, so a reader who adds the trip to the home
 * screen gets an icon that opens the trip – the global one starts at "/",
 * the authors' sign-in. Public like the share page; the token in the path is
 * the credential, an unknown or disabled one answers 404.
 *
 * The icon is named after the instance (SITE_NAME), like the apps – the
 * reader can rename it while adding it. Browsers fetch manifests without
 * cookies, so behind a password the description stays generic too. The icon
 * still opens the link, which then asks for the password in the home-screen
 * app's own cookie jar.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/s/[token]/manifest.webmanifest">,
) {
  const { token } = await context.params;
  const trip = await getTripByShareToken(token);
  if (!trip) return new Response("Not found", { status: 404 });

  const access = await resolveTripAccess(trip, token);
  if (access.kind === "denied") return new Response("Not found", { status: 404 });

  const { locale, t } = await getI18n();
  const path = `/s/${token}`;
  const manifest: MetadataRoute.Manifest = {
    ...MANIFEST_BASE,
    id: path,
    lang: locale,
    name: SITE_NAME,
    short_name: SITE_NAME,
    description:
      (access.kind !== "locked" && trip.summary) || t.meta.manifestDescription,
    start_url: path,
    scope: path,
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // A renamed trip or a switched-off link should show on the next fetch.
      "Cache-Control": "no-cache",
    },
  });
}
