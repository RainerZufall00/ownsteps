import "server-only";

import fs from "node:fs/promises";
import type { Photo, Trip } from "@/db/schema";
import { formatDateShort, formatTripRange, fromDateInput, tripDay } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n/locales";
import { fill, plural } from "@/lib/i18n/text";
import { variantPath, videoPath } from "@/lib/images";
import { getPhoto } from "@/lib/photos";
import { getSteps, type StepWithPhotos } from "@/lib/trips";
import { zipStream, type ZipEntry } from "@/lib/zip";
import { dayLine, firstDayOf } from "./facts";
import { MAP_HEIGHT, MAP_WIDTH, renderRouteMap } from "./route-map";

/**
 * The offline album: a ZIP with one folder, an `index.html` and the media
 * next to it. It needs nothing but a browser – no server, no app, no
 * internet – so it still opens in twenty years. Steps run oldest first,
 * like a book; the timeline's newest-first ([E13]) is for following along.
 *
 * Photos go in as their `large` variant (2400 px WebP): plenty for a screen
 * and a fraction of the originals' size. Videos go in as uploaded.
 */

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Blank lines make paragraphs, single line breaks stay. */
function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** File-system friendly folder name from the title. */
export function albumSlug(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "trip";
}

function videoExtension(mime: string | null) {
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "mp4";
}

const STYLE = `
:root { color-scheme: light dark; --paper:#fbf8f3; --ink:#1f1b16; --soft:#6b6259; --line:#e7e0d6; --accent:#e8613c; --card:#fff; }
@media (prefers-color-scheme: dark) { :root { --paper:#16130f; --ink:#f3ede4; --soft:#a89e92; --line:#2f2a24; --card:#201c17; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font:17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.wrap { max-width: 860px; margin: 0 auto; padding: 0 20px 64px; }
.hero { position:relative; min-height:56vh; display:flex; align-items:flex-end; color:#fff; background:#333 center/cover no-repeat; }
.hero::after { content:""; position:absolute; inset:0; background:linear-gradient(transparent 35%, rgba(0,0,0,.72)); }
.hero .wrap { position:relative; z-index:1; width:100%; padding-bottom:36px; }
.hero h1 { font-size: clamp(34px, 6vw, 56px); line-height:1.08; margin:0 0 8px; letter-spacing:-.02em; }
.hero p { margin:0; opacity:.9; font-weight:500; }
.plain { background: var(--accent); }
.summary { font-size:19px; margin:28px 0 0; }
.map { margin:32px 0 8px; }
.map img { width:100%; height:auto; border-radius:18px; display:block; }
.map figcaption { font-size:12px; color:var(--soft); margin-top:6px; text-align:right; }
article { padding:40px 0 8px; border-top:1px solid var(--line); margin-top:32px; break-inside:avoid-page; }
.day { color:var(--soft); font-size:14px; font-weight:600; display:flex; gap:8px; align-items:center; }
.day .num { display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:24px; padding:0 6px; border-radius:12px; background:var(--accent); color:#fff; font-size:13px; }
h2 { font-size:30px; line-height:1.15; margin:6px 0 14px; letter-spacing:-.01em; }
.body p { margin:0 0 14px; }
.photos { columns: 2 300px; column-gap:10px; margin-top:20px; }
.photos.single { columns: 1; }
figure.media { margin:0 0 10px; break-inside:avoid; }
figure.media img, figure.media video { width:100%; height:auto; display:block; border-radius:12px; background:var(--line); }
figure.media figcaption { font-size:14px; color:var(--soft); padding:6px 2px 4px; }
.comments { margin-top:18px; padding:16px 18px; background:var(--card); border:1px solid var(--line); border-radius:16px; font-size:15px; }
.comments h3 { margin:0 0 8px; font-size:15px; }
.comments p { margin:6px 0; }
.comments .who { font-weight:600; }
.comments .when { color:var(--soft); font-size:13px; margin-left:6px; }
footer { margin-top:48px; color:var(--soft); font-size:13px; text-align:center; }
@media print { .hero { min-height: 40vh; } a { color: inherit; text-decoration: none; } }
`;

type MediaFile = { name: string; file: string };

/**
 * Everything the album needs from the database, gathered up front so the
 * stream only reads files.
 */
async function collect(trip: Trip) {
  const steps = await getSteps(trip.id);
  const firstDay = firstDayOf(trip, steps);
  const coverId = trip.coverPhotoId ?? steps.find((s) => s.photos.length)?.photos[0].id ?? null;
  const cover: Photo | null =
    steps.flatMap((s) => s.photos).find((p) => p.id === coverId) ??
    (coverId ? await getPhoto(coverId) : null);
  return { steps, firstDay, cover };
}

function stepHtml(
  step: StepWithPhotos,
  marker: number | null,
  firstDay: number | null,
  locale: Locale,
  t: Dictionary,
  media: (photo: Photo) => { src: string; poster?: string },
) {
  const day = escapeHtml(dayLine(step, firstDay, locale, t));
  const figures = step.photos
    .map((photo) => {
      const { src, poster } = media(photo);
      const caption = photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : "";
      const ratio = `width="${photo.width}" height="${photo.height}"`;
      const visual =
        photo.mediaType === "video"
          ? `<video controls preload="none" playsinline ${ratio} poster="${poster}" src="${src}"></video>`
          : `<a href="${src}"><img loading="lazy" ${ratio} src="${src}" alt="${escapeHtml(photo.caption ?? "")}"></a>`;
      return `<figure class="media">${visual}${caption}</figure>`;
    })
    .join("");
  const comments = step.comments.length
    ? `<section class="comments"><h3>${escapeHtml(t.album.comments)}</h3>${step.comments
        .map(
          (c) =>
            `<p><span class="who">${escapeHtml(c.authorName)}</span><span class="when">${escapeHtml(
              formatDateShort(c.createdAt, locale),
            )}</span><br>${escapeHtml(c.body)}</p>`,
        )
        .join("")}</section>`
    : "";
  return (
    `<article id="step-${step.id}">` +
    `<div class="day">${marker ? `<span class="num">${marker}</span>` : ""}<span>${day}</span></div>` +
    (step.placeName ? `<h2>${escapeHtml(step.placeName)}</h2>` : "") +
    (step.body ? `<div class="body">${paragraphs(step.body)}</div>` : "") +
    (figures ? `<div class="photos${step.photos.length === 1 ? " single" : ""}">${figures}</div>` : "") +
    comments +
    `</article>`
  );
}

/**
 * The album as a ZIP stream plus its file name. Map tiles are fetched while
 * the archive is being written, after the HTML – so the download starts
 * right away.
 */
export async function tripAlbum(trip: Trip, locale: Locale, t: Dictionary) {
  const { steps, firstDay, cover } = await collect(trip);
  const folder = albumSlug(trip.title);
  const files: MediaFile[] = [];
  const mediaFor = (photo: Photo) => {
    const image = `media/${photo.id}.webp`;
    files.push({ name: image, file: variantPath(photo.storageKey, "large") });
    if (photo.mediaType !== "video") return { src: image };
    const video = `media/${photo.id}.${videoExtension(photo.videoMime)}`;
    files.push({ name: video, file: videoPath(photo.storageKey) });
    return { src: video, poster: image };
  };

  // Markers count the located steps, like the map does.
  const located = steps.filter((s) => s.lat !== null && s.lon !== null);
  const markerOf = new Map(located.map((s, index) => [s.id, index + 1]));

  const range = formatTripRange(
    trip,
    steps[0]?.occurredAt ?? null,
    steps.at(-1)?.occurredAt ?? null,
    locale,
  );
  const start = fromDateInput(trip.startDate) ?? steps[0]?.occurredAt;
  const end = fromDateInput(trip.endDate) ?? steps.at(-1)?.occurredAt;
  const dayCount = start && end ? tripDay(start, end) : null;
  const photoCount = steps.reduce((sum, s) => sum + s.photos.length, 0);
  const facts = [
    range,
    dayCount ? plural(t.album.days, dayCount) : null,
    plural(t.counts.steps, steps.length),
    plural(t.counts.photos, photoCount),
  ].filter(Boolean);

  let coverName: string | null = null;
  if (cover) {
    coverName = `media/cover-${cover.id}.webp`;
    files.push({ name: coverName, file: variantPath(cover.storageKey, "large") });
  }

  const body = steps.length
    ? steps.map((step) => stepHtml(step, markerOf.get(step.id) ?? null, firstDay, locale, t, mediaFor)).join("")
    : `<p>${escapeHtml(t.album.noSteps)}</p>`;

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(trip.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="hero${coverName ? "" : " plain"}"${coverName ? ` style="background-image:url('${coverName}')"` : ""}>
<div class="wrap"><h1>${escapeHtml(trip.title)}</h1><p>${escapeHtml(facts.join(" · "))}</p></div>
</header>
<div class="wrap">
${trip.summary ? `<div class="summary">${paragraphs(trip.summary)}</div>` : ""}
${located.length ? `<figure class="map"><img src="map.jpg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" alt=""><figcaption>${escapeHtml(t.album.mapCredit)}</figcaption></figure>` : ""}
${body}
<footer>${escapeHtml(fill(t.album.exportedOn, { date: formatDateShort(Date.now(), locale) }))}</footer>
</div>
</body>
</html>
`;

  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: `${folder}/index.html`, data: html };
    if (located.length) {
      const map = await renderRouteMap(
        located.map((s) => ({ lat: s.lat!, lon: s.lon!, number: markerOf.get(s.id)! })),
      );
      if (map) yield { name: `${folder}/map.jpg`, data: map };
    }
    for (const media of files) {
      // A file lost on disk leaves a hole in the album, not a broken download.
      try {
        await fs.access(media.file);
      } catch {
        continue;
      }
      yield { name: `${folder}/${media.name}`, file: media.file };
    }
  }

  return { fileName: `${folder}.zip`, stream: zipStream(entries()) };
}

/** The download response for `tripAlbum`. */
export function albumResponse(album: { fileName: string; stream: ReadableStream<Uint8Array> }) {
  return new Response(album.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${album.fileName}"; filename*=UTF-8''${encodeURIComponent(album.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
