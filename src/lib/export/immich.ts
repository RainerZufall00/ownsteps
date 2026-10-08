import "server-only";

import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { immichAlbums, users, type Photo, type Trip, type User } from "@/db/schema";
import { openSecret, sealSecret } from "@/lib/crypto";
import { appSecret } from "@/lib/env";
import { ServiceError, type ErrorCode } from "@/lib/errors";
import { formatTripRange } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n/locales";
import { fill } from "@/lib/i18n/text";
import { photoDir, variantPath, videoPath } from "@/lib/images";
import { getSteps, type StepWithPhotos } from "@/lib/trips";
import { dayLine, firstDayOf } from "./facts";

/**
 * Sending a trip to Immich as an album. Each user connects their own Immich
 * (address plus API key, the key sealed with the app secret); the export
 * runs in the background on the server, which has the original files, and
 * the web UI and the app follow its progress.
 *
 * Immich keeps one description per photo, so the text goes there (agreed on
 * 2026-10-08): the photo's own caption, then day, place and date on every
 * photo, and the day's text only on its first photo – a step reads like a
 * chapter instead of repeating itself. Photos without position or capture
 * time get the step's, so they land right on Immich's map and timeline.
 */

const KEY_PURPOSE = "immich-api-key";

export type ImmichConnection = { url: string; apiKey: string };

/** "photos.example.com/" or ".../api" → "https://photos.example.com". */
export function normalizeImmichUrl(input: string) {
  let value = input.trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (value && !/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError("immich_url_invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ServiceError("immich_url_invalid");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Calls Immich's API; transport problems and refusals become service errors. */
async function immich(connection: ImmichConnection, path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${connection.url}/api${path}`, {
      ...init,
      headers: { Accept: "application/json", "x-api-key": connection.apiKey, ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ServiceError("immich_unreachable");
  }
  if (response.status === 401 || response.status === 403) throw new ServiceError("immich_key_invalid");
  if (!response.ok) throw new ServiceError("immich_failed", { status: String(response.status) });
  return response;
}

async function immichJson<T>(connection: ImmichConnection, path: string, init: RequestInit = {}) {
  return (await (await immich(connection, path, init)).json()) as T;
}

function sendJson(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// MARK: Connection

export function immichConnection(user: Pick<User, "immichUrl" | "immichApiKey">): ImmichConnection | null {
  if (!user.immichUrl || !user.immichApiKey) return null;
  const apiKey = openSecret(appSecret(), KEY_PURPOSE, user.immichApiKey);
  return apiKey ? { url: user.immichUrl, apiKey } : null;
}

/** Checks address and key against Immich, then stores them. */
export async function connectImmich(user: User, input: { url: string; apiKey: string }) {
  const connection = { url: normalizeImmichUrl(input.url), apiKey: input.apiKey.trim() };
  if (!connection.apiKey) throw new ServiceError("immich_key_invalid");
  const me = await immichJson<{ name?: string; email?: string }>(connection, "/users/me");
  await db
    .update(users)
    .set({ immichUrl: connection.url, immichApiKey: sealSecret(appSecret(), KEY_PURPOSE, connection.apiKey) })
    .where(eq(users.id, user.id));
  return { name: me.name || me.email || "" };
}

export async function disconnectImmich(user: User) {
  await db.update(users).set({ immichUrl: null, immichApiKey: null }).where(eq(users.id, user.id));
  await db.delete(immichAlbums).where(eq(immichAlbums.userId, user.id));
}

/** Who the stored key belongs to – for the settings page. */
export async function immichAccount(user: User) {
  const connection = immichConnection(user);
  if (!connection) return null;
  try {
    const me = await immichJson<{ name?: string; email?: string }>(connection, "/users/me", {
      signal: AbortSignal.timeout(5000),
    });
    return { url: connection.url, name: me.name || me.email || "", problem: null as ErrorCode | null };
  } catch (error) {
    return {
      url: connection.url,
      name: "",
      problem: error instanceof ServiceError ? error.code : ("immich_unreachable" as ErrorCode),
    };
  }
}

// MARK: Descriptions

/**
 * A photo's Immich description. `withText` for the step's first photo,
 * which also carries the step's text.
 */
export function photoDescription(
  photo: Pick<Photo, "caption">,
  step: Pick<StepWithPhotos, "occurredAt" | "placeName" | "body">,
  firstDay: number | null,
  locale: Locale,
  t: Dictionary,
  withText: boolean,
) {
  const day = dayLine(step, firstDay, locale, t, { place: true });
  const context = withText && step.body.trim() ? `${day}\n${step.body.trim()}` : day;
  const caption = photo.caption?.trim();
  return caption ? `${caption}\n\n${context}` : context;
}

function albumDescription(trip: Trip, steps: StepWithPhotos[], locale: Locale) {
  const range = formatTripRange(trip, steps[0]?.occurredAt ?? null, steps.at(-1)?.occurredAt ?? null, locale);
  return [range, trip.summary?.trim()].filter(Boolean).join("\n\n");
}

// MARK: Export job

export type ImmichJob = {
  state: "running" | "done" | "failed";
  done: number;
  total: number;
  albumUrl: string | null;
  error: { code: ErrorCode; params: Record<string, string> } | null;
};

const globalForJobs = globalThis as unknown as { __ownstepsImmichJobs?: Map<string, ImmichJob> };
const jobs = (globalForJobs.__ownstepsImmichJobs ??= new Map());
const jobKey = (userId: number, tripId: number) => `${userId}:${tripId}`;

/** The last export of this trip by this user, while the server runs. */
export function immichJob(userId: number, tripId: number): ImmichJob | null {
  return jobs.get(jobKey(userId, tripId)) ?? null;
}

/**
 * Starts sending the trip, unless it's already on its way. Returns at once;
 * the progress is in `immichJob`.
 */
export function startImmichExport(user: User, trip: Trip, locale: Locale, t: Dictionary) {
  const connection = immichConnection(user);
  if (!connection) throw new ServiceError("immich_not_connected");
  const key = jobKey(user.id, trip.id);
  const running = jobs.get(key);
  if (running?.state === "running") return running;
  const job: ImmichJob = { state: "running", done: 0, total: 0, albumUrl: null, error: null };
  jobs.set(key, job);
  void runExport(job, connection, user, trip, locale, t).catch((error: unknown) => {
    job.state = "failed";
    job.error =
      error instanceof ServiceError
        ? { code: error.code, params: error.params }
        : { code: "immich_failed", params: { status: String((error as Error)?.message ?? error) } };
    console.error("[immich] export failed:", error);
  });
  return job;
}

/** The file to send: the original if kept, else the largest variant. */
function sourceFile(photo: Photo) {
  if (photo.mediaType === "video") return { path: videoPath(photo.storageKey), type: photo.videoMime || "video/mp4" };
  const original = `${photoDir(photo.storageKey)}/original`;
  if (fs.existsSync(original)) return { path: original, type: "application/octet-stream" };
  return { path: variantPath(photo.storageKey, "large"), type: "image/webp" };
}

function fileName(photo: Photo) {
  if (photo.originalName) return photo.originalName;
  return photo.mediaType === "video" ? `ownsteps-${photo.id}.mp4` : `ownsteps-${photo.id}.jpg`;
}

async function upload(connection: ImmichConnection, photo: Photo, takenAt: number) {
  const source = sourceFile(photo);
  const form = new FormData();
  const when = new Date(takenAt).toISOString();
  // Stable per file, so sending again finds the photo instead of a copy.
  form.set("deviceAssetId", `ownsteps-${photo.storageKey}`);
  form.set("deviceId", "OwnSteps");
  form.set("fileCreatedAt", when);
  form.set("fileModifiedAt", when);
  form.set("filename", fileName(photo));
  form.set("assetData", await fs.openAsBlob(source.path, { type: source.type }), fileName(photo));
  const result = await immichJson<{ id: string }>(connection, "/assets", { method: "POST", body: form });
  return result.id;
}

async function runExport(
  job: ImmichJob,
  connection: ImmichConnection,
  user: User,
  trip: Trip,
  locale: Locale,
  t: Dictionary,
) {
  const steps = await getSteps(trip.id);
  const firstDay = firstDayOf(trip, steps);
  job.total = steps.reduce((sum, step) => sum + step.photos.length, 0);

  const assetIds: string[] = [];
  for (const step of steps) {
    for (const [index, photo] of step.photos.entries()) {
      const takenAt = photo.takenAt ?? step.occurredAt;
      const id = await upload(connection, photo, takenAt);
      const lat = photo.lat ?? step.lat;
      const lon = photo.lon ?? step.lon;
      await immich(
        connection,
        `/assets/${id}`,
        sendJson("PUT", {
          description: photoDescription(photo, step, firstDay, locale, t, index === 0),
          ...(lat !== null && lon !== null ? { latitude: lat, longitude: lon } : {}),
          ...(photo.takenAt === null ? { dateTimeOriginal: new Date(step.occurredAt).toISOString() } : {}),
        }),
      );
      assetIds.push(id);
      job.done += 1;
    }
  }

  const albumId = await ensureAlbum(connection, user, trip, albumDescription(trip, steps, locale));
  if (assetIds.length) {
    await immich(connection, `/albums/${albumId}/assets`, sendJson("PUT", { ids: assetIds }));
  }
  job.albumUrl = `${connection.url}/albums/${albumId}`;
  job.state = "done";
}

/** The album from last time if it still exists, otherwise a new one. */
async function ensureAlbum(connection: ImmichConnection, user: User, trip: Trip, description: string) {
  const known = await db
    .select()
    .from(immichAlbums)
    .where(and(eq(immichAlbums.tripId, trip.id), eq(immichAlbums.userId, user.id)))
    .get();
  if (known) {
    try {
      await immich(connection, `/albums/${known.albumId}`, sendJson("PATCH", { albumName: trip.title, description }));
      return known.albumId;
    } catch (error) {
      // Deleted in Immich (it answers 400 or 404) – make a new one; anything
      // else is a real problem.
      const gone =
        error instanceof ServiceError &&
        error.code === "immich_failed" &&
        ["400", "404"].includes(error.params.status);
      if (!gone) throw error;
    }
  }
  const album = await immichJson<{ id: string }>(
    connection,
    "/albums",
    sendJson("POST", { albumName: trip.title, description }),
  );
  await db
    .insert(immichAlbums)
    .values({ tripId: trip.id, userId: user.id, albumId: album.id })
    .onConflictDoUpdate({ target: [immichAlbums.tripId, immichAlbums.userId], set: { albumId: album.id } });
  return album.id;
}

/** What web UI and app show about sending a trip to Immich. */
export function immichStatus(user: User, tripId: number, locale: Locale, t: Dictionary) {
  const job = immichJob(user.id, tripId);
  return {
    connected: immichConnection(user) !== null,
    state: job?.state ?? ("idle" as const),
    done: job?.done ?? 0,
    total: job?.total ?? 0,
    albumUrl: job?.albumUrl ?? null,
    error: job?.error ? fill(t.errors[job.error.code], job.error.params) : null,
  };
}

/** The connection as web settings and app show it. */
export async function immichConnectionInfo(user: User, locale: Locale, t: Dictionary) {
  const account = await immichAccount(user);
  return {
    connected: account !== null,
    url: account?.url ?? null,
    name: account?.name || null,
    problem: account?.problem ? fill(t.errors[account.problem]) : null,
  };
}

