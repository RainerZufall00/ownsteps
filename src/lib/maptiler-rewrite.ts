export const UPSTREAM = "https://api.maptiler.com";
const MAPTILER_URL_RE = /https:\/\/api\.maptiler\.com\/([^"'\s\\]*)/g;

/**
 * What a MapTiler style loads: the style itself and its sprites (`maps/`),
 * tile sets (`tiles/`), glyphs (`fonts/`) and images (`resources/`). The
 * proxy is public because share links need the map, so everything else –
 * geocoding, static maps, the data API – must not ride on our key.
 */
const MAP_ASSET_RE = /^(maps|tiles|fonts|resources)\//;

export function isMapAsset(path: string) {
  let decoded: string;
  try {
    // Upstream decodes too: `st%61tic` must count as `static`.
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return MAP_ASSET_RE.test(decoded) && !decoded.toLowerCase().split("/").includes("static");
}

/**
 * What may be fetched from OpenFreeMap through the proxy: a style
 * (`styles/liberty`) or a tile set's TileJSON (`planet`). Everything else
 * MapLibre loads from there directly.
 */
const OFM_JSON_RE = /^(styles\/[a-z0-9_-]+|[a-z0-9_-]+)$/;

export function isOpenFreeMapJson(path: string) {
  return OFM_JSON_RE.test(path);
}

/**
 * Points the TileJSON references in an OpenFreeMap style (`"url":
 * "https://tiles.openfreemap.org/planet"`) at our proxy, so their
 * attributions get cleaned too. Tile, font and sprite URLs (with
 * placeholders or paths) stay direct.
 */
export function rewriteOpenFreeMapJson(text: string, origin: string, ofmOrigin: string) {
  const escaped = ofmOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`("url"\\s*:\\s*")${escaped}/([a-z0-9_-]+)"`, "g"),
    (_full, prefix: string, tileset: string) => `${prefix}${origin}/api/map/ofm/${tileset}"`,
  );
}

/** Removes the API key from a forwarded URL query. */
function stripKey(query: string) {
  return query
    .split("&")
    .filter((pair) => pair.length > 0 && !pair.startsWith("key="))
    .join("&");
}

/**
 * Points every MapTiler URL in a JSON response (style.json, tiles.json,
 * sprite.json) at our own proxy and strips the API key.
 *
 * The result must be a full address, not a bare path: MapLibre loads the
 * vector tiles in a worker created from a blob. Its `location` is a `blob:`
 * URL and can't serve as a base to resolve `/api/map/…` – the tiles would
 * never arrive.
 *
 * Deliberately text-based: placeholders like {z}/{x}/{y} or {fontstack} must
 * stay untouched, a URL object would encode the braces.
 */
export function rewriteMapTilerJson(text: string, origin: string) {
  return text.replace(MAPTILER_URL_RE, (_full, rest: string) => {
    const [path, query = ""] = rest.split("?");
    const cleaned = stripKey(query);
    return `${origin}/api/map/${path}${cleaned ? `?${cleaned}` : ""}`;
  });
}

/**
 * maplibre-gl v5 renders source attributions as HTML through a sanitizer
 * that can be tricked (GHSA-jrc7-96c5-q579, fixed only in v6, which we can't
 * use – see AGENTS.md). So every `attribution` in a proxied style or
 * TileJSON is reduced here to plain text and plain `https` links before
 * MapLibre sees it – the workaround the advisory names. The CSP would block
 * the inline handlers such a payload relies on anyway; this is the second
 * line.
 */
export function sanitizeAttributions(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return text;
  }
  let changed = false;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (key === "attribution" && typeof entry === "string") {
          const clean = sanitizeAttribution(entry);
          if (clean !== entry) {
            (value as Record<string, unknown>)[key] = clean;
            changed = true;
          }
        } else visit(entry);
      }
    }
  };
  visit(json);
  return changed ? JSON.stringify(json) : text;
}

const LINK_RE = /<a\b[^>]*?\bhref\s*=\s*(["'])(https?:\/\/[^"'<>\s]+)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

/** Only text and `<a href="https://…">` survive; everything else is inert. */
export function sanitizeAttribution(html: string) {
  let out = "";
  let last = 0;
  for (const match of html.matchAll(LINK_RE)) {
    out += plainText(html.slice(last, match.index));
    out += `<a href="${escapeAmpersands(match[2])}" target="_blank" rel="noopener">${plainText(match[3])}</a>`;
    last = match.index + match[0].length;
  }
  return out + plainText(html.slice(last));
}

/** Entities like `&copy;` stay, a bare `&` is escaped. */
function escapeAmpersands(text: string) {
  return text.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;");
}

function plainText(html: string) {
  // Drop every tag (an unclosed one at the end too), then escape what's
  // left, so nothing can form a tag again.
  return escapeAmpersands(html.replace(/<[^>]*>?/g, ""))
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

