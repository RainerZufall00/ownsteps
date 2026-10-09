import { MAPTILER_KEY, PUBLIC_URL } from "@/lib/env";
import { OPENFREEMAP_ORIGIN } from "@/lib/map-sources";
import {
  isMapAsset,
  isOpenFreeMapJson,
  rewriteMapTilerJson,
  rewriteOpenFreeMapJson,
  sanitizeAttributions,
  UPSTREAM,
} from "@/lib/maptiler-rewrite";
import { publicOrigin } from "@/lib/origin";

/**
 * Forwards map requests to MapTiler and appends the API key on the server.
 * That way the key shows up neither in the style nor in the tile URLs –
 * publicly shared trips would otherwise expose it to every visitor.
 */
export async function GET(request: Request) {
  if (!MAPTILER_KEY) return openFreeMap(request);

  // There used to be a block against "Sec-Fetch-Site: cross-site" here. It
  // achieved nothing – anyone omitting the header got through anyway – but it
  // could block requests MapLibre makes from its worker. The proxy is
  // deliberately as open as the instance itself.

  const incoming = new URL(request.url);
  // Use the raw path so the encoding stays exactly as MapLibre produced it
  // (e.g. spaces in font names).
  const rawPath = incoming.pathname.slice("/api/map/".length);
  const target = new URL(`${UPSTREAM}/${rawPath}`);
  // Checked on the resolved path, so `maps/../geocoding/…` can't slip through.
  if (target.origin !== UPSTREAM || !isMapAsset(target.pathname.slice(1))) {
    return new Response("Invalid target", { status: 400 });
  }
  incoming.searchParams.forEach((value, key) => {
    if (key !== "key") target.searchParams.set(key, value);
  });
  target.searchParams.set("key", MAPTILER_KEY);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: request.headers.get("accept") ?? "*/*" },
      // Map data rarely changes.
      next: { revalidate: 60 * 60 * 24 },
    });
  } catch {
    return new Response("Map source unreachable", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Map source responded with ${upstream.status}`, {
      status: upstream.status === 403 ? 502 : upstream.status,
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const cacheControl = "public, max-age=86400, stale-while-revalidate=604800";

  // JSON responses (style.json, tiles.json, sprite.json) contain further
  // MapTiler URLs including the key – those must go through the proxy too.
  // Their attributions are reduced to text and links (see sanitizeAttributions).
  if (contentType.includes("json")) {
    const text = await upstream.text();
    const rewritten = sanitizeAttributions(
      rewriteMapTilerJson(text, publicOrigin(request, PUBLIC_URL)),
    );
    return new Response(rewritten, {
      headers: {
        "Content-Type": "application/json",
        // Deliberately short-lived: these responses contain the rewritten
        // addresses, which depend on PUBLIC_URL and the proxy headers. With a
        // long lifetime the browser would cling to dead URLs for days after a
        // move or config change – the map would stay empty although the
        // server has long been delivering the right thing.
        "Cache-Control": "no-cache",
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

/**
 * Without a key: OpenFreeMap's style and TileJSON, with their attributions
 * cleaned and the TileJSON references pointed back here. Tiles, fonts and
 * sprites MapLibre fetches from OpenFreeMap directly.
 */
async function openFreeMap(request: Request) {
  const incoming = new URL(request.url);
  const path = incoming.pathname.slice("/api/map/ofm/".length);
  if (!incoming.pathname.startsWith("/api/map/ofm/") || !isOpenFreeMapJson(path)) {
    return new Response("Invalid target", { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${OPENFREEMAP_ORIGIN}/${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 },
    });
  } catch {
    return new Response("Map source unreachable", { status: 502 });
  }
  if (!upstream.ok) {
    return new Response(`Map source responded with ${upstream.status}`, { status: 502 });
  }
  const text = sanitizeAttributions(
    rewriteOpenFreeMapJson(await upstream.text(), publicOrigin(request, PUBLIC_URL), OPENFREEMAP_ORIGIN),
  );
  // Short-lived: TileJSON names the current tile build, which changes.
  return new Response(text, {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
  });
}

