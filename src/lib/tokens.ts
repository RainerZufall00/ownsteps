import "server-only";

import crypto from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  apiTokens,
  authCodes,
  users,
  viewerDevices,
  type Trip,
  type User,
  type ViewerDevice,
} from "@/db/schema";
import { ServiceError } from "./errors";

/**
 * Bearer tokens for the app. Authors get a device token per signed-in
 * device, readers a viewer token per redeemed trip. The prefix tells them
 * apart without a lookup; the database only ever stores the SHA-256.
 */
const AUTHOR_PREFIX = "osa_";
const VIEWER_PREFIX = "osv_";
const AUTH_CODE_TTL_MS = 2 * 60 * 1000;
/** `last_used_at` doesn't need to be exact; spares a write per request. */
const TOUCH_INTERVAL_MS = 60 * 1000;

function randomToken(prefix: string) {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isAuthorToken(token: string) {
  return token.startsWith(AUTHOR_PREFIX);
}

export function isViewerToken(token: string) {
  return token.startsWith(VIEWER_PREFIX);
}

// ── Author device tokens ────────────────────────────────────────────────

export async function createApiToken(userId: number, deviceName: string) {
  const token = randomToken(AUTHOR_PREFIX);
  const [row] = await db
    .insert(apiTokens)
    .values({ id: hashToken(token), userId, deviceName: deviceName.trim() || "App" })
    .returning();
  return { token, row };
}

export async function resolveApiToken(
  token: string,
): Promise<{ user: User; tokenId: string } | null> {
  const id = hashToken(token);
  const rows = await db
    .select({ user: users, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt > TOUCH_INTERVAL_MS) {
    await db.update(apiTokens).set({ lastUsedAt: Date.now() }).where(eq(apiTokens.id, id));
  }
  return { user: row.user, tokenId: id };
}

export async function listApiTokens(userId: number) {
  return db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
}

/** Only the owner can revoke their device tokens. */
export async function revokeApiToken(tokenId: string, userId: number) {
  await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));
}

// ── One-time codes for the app's OIDC sign-in ───────────────────────────

/** PKCE S256: base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function createAuthCode(input: {
  userId: number;
  codeChallenge: string;
  deviceName: string;
}) {
  const code = crypto.randomBytes(32).toString("base64url");
  await db.delete(authCodes).where(lt(authCodes.expiresAt, Date.now()));
  await db.insert(authCodes).values({
    id: hashToken(code),
    userId: input.userId,
    codeChallenge: input.codeChallenge,
    deviceName: input.deviceName,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
  });
  return code;
}

/**
 * Trades a one-time code plus the app's PKCE verifier for a device token.
 * The code is gone after the first attempt, successful or not.
 */
export async function exchangeAuthCode(code: string, verifier: string) {
  const id = hashToken(code);
  const [row] = await db.delete(authCodes).where(eq(authCodes.id, id)).returning();
  if (!row || row.expiresAt < Date.now()) throw new ServiceError("auth_code_invalid");

  const expected = Buffer.from(row.codeChallenge);
  const actual = Buffer.from(pkceChallenge(verifier));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new ServiceError("auth_code_invalid");
  }
  return createApiToken(row.userId, row.deviceName);
}

// ── Viewer devices ──────────────────────────────────────────────────────

export async function createViewerDevice(input: {
  trip: Trip;
  name: string;
  deviceName?: string | null;
}) {
  const token = randomToken(VIEWER_PREFIX);
  const [device] = await db
    .insert(viewerDevices)
    .values({
      tripId: input.trip.id,
      tokenHash: hashToken(token),
      name: input.name,
      deviceName: input.deviceName ?? null,
    })
    .returning();
  return { token, device };
}

export async function resolveViewerToken(token: string): Promise<ViewerDevice | null> {
  const rows = await db
    .select()
    .from(viewerDevices)
    .where(eq(viewerDevices.tokenHash, hashToken(token)))
    .limit(1);
  const device = rows[0];
  if (!device) return null;
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt > TOUCH_INTERVAL_MS) {
    await db
      .update(viewerDevices)
      .set({ lastSeenAt: Date.now() })
      .where(eq(viewerDevices.id, device.id));
  }
  return device;
}

export async function listViewerDevices(tripId: number) {
  return db
    .select()
    .from(viewerDevices)
    .where(eq(viewerDevices.tripId, tripId))
    .orderBy(desc(viewerDevices.createdAt));
}

export async function getViewerDevice(id: number) {
  const rows = await db.select().from(viewerDevices).where(eq(viewerDevices.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function removeViewerDevice(id: number) {
  await db.delete(viewerDevices).where(eq(viewerDevices.id, id));
}

export async function removeAllViewerDevices(tripId: number) {
  await db.delete(viewerDevices).where(eq(viewerDevices.tripId, tripId));
}
