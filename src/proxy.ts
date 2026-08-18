import { NextResponse, type NextRequest } from "next/server";

/**
 * Schlankes Zugriffsprotokoll (in Next 16 heißt diese Ebene "Proxy"). Next schreibt in Produktion von sich aus nichts
 * mit; bei der Fehlersuche stand man dadurch vor leeren Logs und wusste nicht
 * einmal, ob eine Anfrage überhaupt ankommt.
 *
 * Bilder und Kartenkacheln bleiben außen vor – sonst geht alles Übrige darin
 * unter. Share-Token werden gekürzt: Sie sind das Passwort einer geteilten
 * Reise und haben in einer Logdatei nichts verloren.
 */
export function proxy(request: NextRequest) {
  const pfad = request.nextUrl.pathname.replace(
    /^\/s\/[^/]+/,
    "/s/<token>",
  );
  console.log(`${request.method} ${pfad}`);
  return NextResponse.next();
}

/**
 * `/api/upload` und `/api/trips` (Titelbild) müssen ausgenommen bleiben:
 * Sobald der Proxy eine Anfrage anfasst, puffert Next deren Rumpf und kappt ihn
 * bei 10 MB – ein Video- oder Bild-Upload scheitert dann mit „Failed to parse
 * body as FormData". Bilder und Kartenkacheln (`api/photos`, `api/share-media`,
 * `api/map`) bleiben außen vor, damit das Protokoll lesbar bleibt und die
 * Bereichsauslieferung der Videos nicht angefasst wird.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/upload|api/trips|api/photos|api/share-media|api/map|favicon.ico|icon-|apple-touch-icon).*)",
  ],
};
