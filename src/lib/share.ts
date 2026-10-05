import "server-only";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { trips, type Trip } from "@/db/schema";
import { getCurrentUser } from "./auth";
import { cookieOptions } from "./cookies";
import { hmac, randomToken, safeEqual } from "./crypto";
import { appSecret, PUBLIC_URL } from "./env";
import { originFromHeaders } from "./origin";

const UNLOCK_TTL_S = 60 * 60 * 24 * 30;

export function newShareToken() {
  // 24 random bytes – unguessable, even if the link circulates publicly.
  return randomToken(24);
}

/** The public address of a trip's share link. */
export function shareUrl(origin: string, shareToken: string) {
  return `${origin}/s/${shareToken}`;
}

/**
 * This instance's public address while rendering a page: `PUBLIC_URL`, then
 * the proxy's headers (see `originFromHeaders`). Route handlers have the
 * request and use `publicOrigin` instead.
 */
export async function pageOrigin() {
  return originFromHeaders(await headers(), PUBLIC_URL, "http://localhost:2555");
}

function unlockCookieName(tripId: number) {
  return `ownsteps_unlock_${tripId}`;
}

/** Signature an unlocked browser uses to identify itself again. */
function unlockSignature(tripId: number, passwordHash: string) {
  return hmac(appSecret(), `${tripId}:${passwordHash}`);
}

export async function grantUnlock(trip: Trip) {
  if (!trip.sharePasswordHash) return;
  const store = await cookies();
  store.set(
    unlockCookieName(trip.id),
    unlockSignature(trip.id, trip.sharePasswordHash),
    cookieOptions(UNLOCK_TTL_S),
  );
}

export async function hasUnlock(trip: Trip) {
  if (!trip.sharePasswordHash) return true;
  const store = await cookies();
  const value = store.get(unlockCookieName(trip.id))?.value;
  if (!value) return false;
  return safeEqual(value, unlockSignature(trip.id, trip.sharePasswordHash));
}

export async function getTripByShareToken(token: string) {
  const trip = await db.select().from(trips).where(eq(trips.shareToken, token)).get();
  if (!trip || !trip.shareEnabled) return null;
  return trip;
}

export type TripAccess =
  | { kind: "owner" }
  | { kind: "guest" }
  | { kind: "locked" }
  | { kind: "denied" };

/**
 * Decides whether the current request may see a trip – either as a signed-in
 * user or through an enabled share link. Guests must present the link's
 * token: that a trip is shared at all is not enough, otherwise anyone could
 * reach every shared trip via its sequential ID, and a rotated link wouldn't
 * shut anybody out.
 */
export async function resolveTripAccess(
  trip: Trip,
  shareToken: string | null,
): Promise<TripAccess> {
  if (await getCurrentUser()) return { kind: "owner" };
  if (!trip.shareEnabled) return { kind: "denied" };
  if (!shareToken || !safeEqual(shareToken, trip.shareToken)) return { kind: "denied" };
  return (await hasUnlock(trip)) ? { kind: "guest" } : { kind: "locked" };
}
