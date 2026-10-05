import "server-only";

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
import { pkceChallenge, randomToken, safeEqual, sha256Hex } from "./crypto";
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

function prefixedToken(prefix: string) {
  return `${prefix}${randomToken()}`;
}

export function isAuthorToken(token: string) {
  return token.startsWith(AUTHOR_PREFIX);
}

export function isViewerToken(token: string) {
  return token.startsWith(VIEWER_PREFIX);
}

// ── Author device tokens ────────────────────────────────────────────────

export async function createApiToken(userId: number, deviceName: string) {
  const token = prefixedToken(AUTHOR_PREFIX);
  const [row] = await db
    .insert(apiTokens)
    .values({ id: sha256Hex(token), userId, deviceName: deviceName.trim() || "App" })
    .returning();
  return { token, row };
}

export async function resolveApiToken(
  token: string,
): Promise<{ user: User; tokenId: string } | null> {
  const id = sha256Hex(token);
  const row = await db
    .select({ user: users, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.id, id))
    .get();
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

/** After a password change: every app device must sign in again. */
export async function revokeAllApiTokens(userId: number) {
  await db.delete(apiTokens).where(eq(apiTokens.userId, userId));
}

// ── One-time codes for the app's OIDC sign-in ───────────────────────────

export async function createAuthCode(input: {
  userId: number;
  codeChallenge: string;
  deviceName: string;
}) {
  const code = randomToken();
  await db.delete(authCodes).where(lt(authCodes.expiresAt, Date.now()));
  await db.insert(authCodes).values({
    id: sha256Hex(code),
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
  const id = sha256Hex(code);
  const [row] = await db.delete(authCodes).where(eq(authCodes.id, id)).returning();
  if (!row || row.expiresAt < Date.now()) throw new ServiceError("auth_code_invalid");

  if (!safeEqual(pkceChallenge(verifier), row.codeChallenge)) {
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
  const token = prefixedToken(VIEWER_PREFIX);
  const [device] = await db
    .insert(viewerDevices)
    .values({
      tripId: input.trip.id,
      tokenHash: sha256Hex(token),
      name: input.name,
      deviceName: input.deviceName ?? null,
    })
    .returning();
  return { token, device };
}

export async function resolveViewerToken(token: string): Promise<ViewerDevice | null> {
  const device = await db
    .select()
    .from(viewerDevices)
    .where(eq(viewerDevices.tokenHash, sha256Hex(token)))
    .get();
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
  return (await db.select().from(viewerDevices).where(eq(viewerDevices.id, id)).get()) ?? null;
}

export async function removeViewerDevice(id: number) {
  await db.delete(viewerDevices).where(eq(viewerDevices.id, id));
}

export async function removeAllViewerDevices(tripId: number) {
  await db.delete(viewerDevices).where(eq(viewerDevices.tripId, tripId));
}
