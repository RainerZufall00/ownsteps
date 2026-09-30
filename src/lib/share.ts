import "server-only";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { trips, type Trip } from "@/db/schema";
import { getCurrentUser } from "./auth";
import { APP_SECRET } from "./env";

export function newShareToken() {
  // 24 random bytes – unguessable, even if the link circulates publicly.
  return crypto.randomBytes(24).toString("base64url");
}

function unlockCookieName(tripId: number) {
  return `ownsteps_unlock_${tripId}`;
}

/** Signature an unlocked browser uses to identify itself again. */
function unlockSignature(tripId: number, passwordHash: string) {
  return crypto
    .createHmac("sha256", APP_SECRET)
    .update(`${tripId}:${passwordHash}`)
    .digest("base64url");
}

export async function grantUnlock(trip: Trip) {
  if (!trip.sharePasswordHash) return;
  const store = await cookies();
  store.set(
    unlockCookieName(trip.id),
    unlockSignature(trip.id, trip.sharePasswordHash),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );
}

export async function hasUnlock(trip: Trip) {
  if (!trip.sharePasswordHash) return true;
  const store = await cookies();
  const value = store.get(unlockCookieName(trip.id))?.value;
  if (!value) return false;
  const expected = unlockSignature(trip.id, trip.sharePasswordHash);
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function getTripByShareToken(token: string) {
  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.shareToken, token))
    .limit(1);
  const trip = rows[0];
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
 * user or through an enabled share link.
 */
export async function resolveTripAccess(trip: Trip): Promise<TripAccess> {
  if (await getCurrentUser()) return { kind: "owner" };
  if (!trip.shareEnabled) return { kind: "denied" };
  return (await hasUnlock(trip)) ? { kind: "guest" } : { kind: "locked" };
}
