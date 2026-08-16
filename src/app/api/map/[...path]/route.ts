import { getCurrentUser } from "@/lib/auth";
import { MAPTILER_KEY, PUBLIC_URL } from "@/lib/env";
import {
  publicOrigin,
  rewriteMapTilerJson,
  UPSTREAM,
} from "@/lib/maptiler-rewrite";

/**
 * Reicht Kartenanfragen an MapTiler weiter und hängt den API-Key serverseitig an.
 * Dadurch taucht der Key weder im Style noch in den Tile-URLs auf – öffentlich
 * geteilte Reisen würden ihn sonst jedem Besucher offenlegen.
 */
export async function GET(request: Request) {
  if (!MAPTILER_KEY) {
    return new Response("Keine Kartenquelle konfiguriert", { status: 503 });
  }

  // Fremde Seiten sollen den Proxy nicht als kostenlosen Tile-Server missbrauchen.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    const user = await getCurrentUser();
    if (!user) return new Response("Kein Zugriff", { status: 403 });
  }

  const incoming = new URL(request.url);
  // Den rohen Pfad verwenden, damit die Kodierung exakt so bleibt,
  // wie MapLibre sie erzeugt hat (z.B. Leerzeichen in Font-Namen).
  const rawPath = incoming.pathname.slice("/api/map/".length);
  const target = new URL(`${UPSTREAM}/${rawPath}`);
  if (target.origin !== UPSTREAM) {
    return new Response("Ungültiges Ziel", { status: 400 });
  }
  incoming.searchParams.forEach((value, key) => {
    if (key !== "key") target.searchParams.set(key, value);
  });
  target.searchParams.set("key", MAPTILER_KEY);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: request.headers.get("accept") ?? "*/*" },
      // Kartendaten ändern sich selten.
      next: { revalidate: 60 * 60 * 24 },
    });
  } catch {
    return new Response("Kartenquelle nicht erreichbar", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Kartenquelle antwortete mit ${upstream.status}`, {
      status: upstream.status === 403 ? 502 : upstream.status,
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const cacheControl = "public, max-age=86400, stale-while-revalidate=604800";

  // In JSON-Antworten (style.json, tiles.json, sprite.json) stecken weitere
  // MapTiler-URLs samt Key – die müssen ebenfalls über den Proxy laufen.
  if (contentType.includes("json")) {
    const text = await upstream.text();
    const rewritten = rewriteMapTilerJson(
      text,
      publicOrigin(request, PUBLIC_URL),
    );
    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
      },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": cacheControl,
    },
  });
}
