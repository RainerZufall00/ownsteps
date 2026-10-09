import { NextResponse, type NextRequest } from "next/server";
import { OPENFREEMAP_ORIGIN, usesOpenFreeMap } from "@/lib/map-sources";

/**
 * Lean access log (in Next 16 this layer is called "proxy"). Next logs nothing
 * in production on its own; when debugging you faced empty logs and didn't
 * even know whether a request arrived at all.
 *
 * Images and map tiles are left out – otherwise everything else drowns in
 * them. Share tokens are masked: they are a shared trip's password and have no
 * business in a log file.
 */
export function proxy(request: NextRequest) {
  const logPath = request.nextUrl.pathname.replace(
    /^\/s\/[^/]+/,
    "/s/<token>",
  );
  console.log(`${request.method} ${logPath}`);

  // Next reads the nonce from the request's CSP header and puts it on its
  // own scripts; that's why every page is rendered per request (layout.tsx).
  const csp = contentSecurityPolicy(btoa(crypto.randomUUID()));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * Scripts only with the request's nonce ('strict-dynamic' lets them load
 * their chunks). Styles stay 'unsafe-inline': React renders `style`
 * attributes, which nonces don't cover. MapLibre's worker is a file on our
 * own origin (see TripMap.tsx); its sprite images need blob:, photo
 * placeholders are data: URIs. Map data comes
 * through our own /api/map – only OpenFreeMap, used without a MapTiler key,
 * serves its tiles, fonts and sprites from its own origin.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  // Without a MapTiler key MapLibre loads OpenFreeMap's tiles, fonts and
  // sprites directly (fetched, so connect-src as well as img-src).
  const tiles = usesOpenFreeMap() ? ` ${OPENFREEMAP_ORIGIN}` : "";
  return [
    "default-src 'self'",
    // React's dev tooling evaluates code; production doesn't.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${tiles}`,
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self'${tiles}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Every upload path must stay excluded: `/api/upload`, `/api/trips` (cover)
 * and the API's `/api/v1/steps/…/media` and `/api/v1/trips/…/cover`. As soon
 * as the proxy touches a request, Next buffers its body and caps it at 10 MB –
 * a video or image upload then fails with "Failed to parse body as FormData".
 * Images and map tiles (`api/photos`, `api/v1/photos`, `api/share-media`,
 * `api/map`) are left out so the log stays readable and video range requests
 * aren't touched.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/upload|api/trips|api/photos|api/share-media|api/map|api/v1/steps/[^/]+/media|api/v1/trips/[^/]+/cover|api/v1/photos|favicon.ico|icon-|apple-touch-icon).*)",
  ],
};
