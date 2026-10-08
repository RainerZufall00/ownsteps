import "server-only";

import sharp, { type OverlayOptions } from "sharp";
import packageJson from "../../../package.json";
import { MAP_STYLE, MAPTILER_KEY } from "@/lib/env";
import { OSM_TILE_ORIGIN } from "@/lib/map-sources";
import { UPSTREAM } from "@/lib/maptiler-rewrite";

/**
 * The trip's route as a still image, for the offline album: map tiles
 * fetched once at export time and stitched together, the route and
 * numbered markers drawn on top. An interactive map would need the
 * internet every time the album is opened; this one is part of the file.
 * Without tiles (server offline, provider down) the route is drawn on a
 * plain background – still the shape of the trip.
 */

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 720;
const TILE = 256;
const PADDING = 44;
const MAX_ZOOM = 13;
/** A single place is shown with some surroundings, not rooftops. */
const SINGLE_POINT_ZOOM = 9;

type Point = { lat: number; lon: number };

/** Web Mercator, in pixels of the whole world at `zoom`. */
function project({ lat, lon }: Point, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((Math.max(Math.min(lat, 85.05), -85.05) * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** The closest zoom at which all points fit inside the padded image. */
function fittingZoom(points: Point[]) {
  if (points.length === 1) return SINGLE_POINT_ZOOM;
  for (let zoom = MAX_ZOOM; zoom > 0; zoom--) {
    const projected = points.map((point) => project(point, zoom));
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    if (
      Math.max(...xs) - Math.min(...xs) <= MAP_WIDTH - 2 * PADDING &&
      Math.max(...ys) - Math.min(...ys) <= MAP_HEIGHT - 2 * PADDING
    ) {
      return zoom;
    }
  }
  return 1;
}

function tileUrl(zoom: number, x: number, y: number) {
  if (!MAPTILER_KEY) return { url: `${OSM_TILE_ORIGIN}/${zoom}/${x}/${y}.png`, credit: "© OpenStreetMap" };
  const ext = /satellite|hybrid/.test(MAP_STYLE) ? "jpg" : "png";
  return {
    url: `${UPSTREAM}/maps/${MAP_STYLE}/256/${zoom}/${x}/${y}.${ext}?key=${encodeURIComponent(MAPTILER_KEY)}`,
    credit: "© MapTiler © OpenStreetMap",
  };
}

async function fetchTile(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      // OpenStreetMap's tile policy asks for an identifying User-Agent.
      headers: { "User-Agent": `OwnSteps/${packageJson.version} (self-hosted travel journal, album export)` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function escapeXml(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * JPEG of the route, or null without any located step. `numbers` labels
 * the markers like the album's steps.
 */
export async function renderRouteMap(
  points: (Point & { number: number })[],
  options: { fetchTiles?: boolean } = {},
): Promise<Buffer | null> {
  if (points.length === 0) return null;
  const zoom = fittingZoom(points);
  const projected = points.map((point) => ({ ...project(point, zoom), number: point.number }));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const left = centerX - MAP_WIDTH / 2;
  const top = centerY - MAP_HEIGHT / 2;

  const tiles: OverlayOptions[] = [];
  let credit = "";
  if (options.fetchTiles ?? true) {
    const count = 2 ** zoom;
    const jobs: { x: number; y: number; left: number; top: number }[] = [];
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + MAP_HEIGHT) / TILE); ty++) {
      if (ty < 0 || ty >= count) continue;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + MAP_WIDTH) / TILE); tx++) {
        jobs.push({
          x: ((tx % count) + count) % count,
          y: ty,
          left: Math.round(tx * TILE - left),
          top: Math.round(ty * TILE - top),
        });
      }
    }
    // A few at a time – a map provider is a neighbor, not a CDN.
    for (let i = 0; i < jobs.length; i += 4) {
      const batch = jobs.slice(i, i + 4);
      const fetched = await Promise.all(
        batch.map(async (job) => {
          const { url, credit: source } = tileUrl(zoom, job.x, job.y);
          credit = source;
          return { job, data: await fetchTile(url) };
        }),
      );
      for (const { job, data } of fetched) {
        if (!data) continue;
        // Tiles at the edges hang over the image; sharp only accepts
        // overlays inside it, so each is cut to the visible part first.
        const cropLeft = Math.max(0, -job.left);
        const cropTop = Math.max(0, -job.top);
        const width = Math.min(TILE - cropLeft, MAP_WIDTH - Math.max(job.left, 0));
        const height = Math.min(TILE - cropTop, MAP_HEIGHT - Math.max(job.top, 0));
        if (width <= 0 || height <= 0) continue;
        try {
          const input = await sharp(data)
            .extract({ left: cropLeft, top: cropTop, width, height })
            .png()
            .toBuffer();
          tiles.push({ input, left: Math.max(job.left, 0), top: Math.max(job.top, 0) });
        } catch {
          // A broken tile leaves a gap, not a failed export.
        }
      }
    }
  }

  const path = projected.map((p) => `${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`).join(" ");
  const markers = projected
    .map((p) => {
      const x = (p.x - left).toFixed(1);
      const y = (p.y - top).toFixed(1);
      return (
        `<circle cx="${x}" cy="${y}" r="15" fill="#e8613c" stroke="#fff" stroke-width="4"/>` +
        `<text x="${x}" y="${y}" dy="5.5" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#fff">${p.number}</text>`
      );
    })
    .join("");
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}">` +
      (projected.length > 1
        ? `<polyline points="${path}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<polyline points="${path}" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : "") +
      markers +
      (tiles.length && credit
        ? `<rect x="${MAP_WIDTH - 230}" y="${MAP_HEIGHT - 24}" width="230" height="24" fill="rgba(255,255,255,0.75)"/>` +
          `<text x="${MAP_WIDTH - 8}" y="${MAP_HEIGHT - 8}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#333">${escapeXml(credit)}</text>`
        : "") +
      `</svg>`,
  );

  return sharp({
    create: { width: MAP_WIDTH, height: MAP_HEIGHT, channels: 3, background: "#dfe5e8" },
  })
    .composite([...tiles, { input: overlay, left: 0, top: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}
