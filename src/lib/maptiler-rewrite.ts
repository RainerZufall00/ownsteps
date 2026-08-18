// Bleibt hier greifbar, weil die Kartenroute beides zusammen braucht.
export { publicOrigin } from "./origin";

const UPSTREAM = "https://api.maptiler.com";
const MAPTILER_URL_RE = /https:\/\/api\.maptiler\.com\/([^"'\s\\]*)/g;

/** Entfernt den API-Key aus einer weitergereichten URL-Query. */
function stripKey(query: string) {
  return query
    .split("&")
    .filter((pair) => pair.length > 0 && !pair.startsWith("key="))
    .join("&");
}

/**
 * Biegt alle MapTiler-URLs in einer JSON-Antwort (style.json, tiles.json,
 * sprite.json) auf den eigenen Proxy um und wirft den API-Key heraus.
 *
 * Das Ergebnis muss eine vollständige Adresse sein, kein bloßer Pfad:
 * MapLibre lädt die Vektorkacheln in einem Worker, der aus einem Blob
 * erzeugt wird. Dessen `location` ist eine `blob:`-URL und eignet sich nicht
 * als Basis, um `/api/map/…` aufzulösen – die Kacheln kämen nie an.
 *
 * Bewusst rein textbasiert: Platzhalter wie {z}/{x}/{y} oder {fontstack}
 * müssen unverändert bleiben, ein URL-Objekt würde die Klammern kodieren.
 */
export function rewriteMapTilerJson(text: string, origin: string) {
  return text.replace(MAPTILER_URL_RE, (_full, rest: string) => {
    const [path, query = ""] = rest.split("?");
    const cleaned = stripKey(query);
    return `${origin}/api/map/${path}${cleaned ? `?${cleaned}` : ""}`;
  });
}

export { UPSTREAM };
