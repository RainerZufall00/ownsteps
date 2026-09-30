import { NextResponse, type NextRequest } from "next/server";

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
  return NextResponse.next();
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
