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
 * `/api/upload` muss ausgenommen bleiben: Sobald der Proxy eine Anfrage
 * anfasst, puffert Next deren Rumpf und kappt ihn bei 10 MB – ein Video-Upload
 * scheitert dann mit „Failed to parse body as FormData". Bilder und
 * Kartenkacheln bleiben außen vor, damit das Protokoll lesbar bleibt.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/upload|api/photos|api/map|favicon.ico|icon-|apple-touch-icon).*)",
  ],
};
