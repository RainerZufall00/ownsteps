import "server-only";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { trips, type Trip } from "@/db/schema";
import { getCurrentUser } from "./auth";
import { APP_SECRET } from "./env";

export function newShareToken() {
  // 32 Byte Zufall – nicht erratbar, auch wenn der Link öffentlich kursiert.
  return crypto.randomBytes(24).toString("base64url");
}

function unlockCookieName(tripId: number) {
  return `ownsteps_unlock_${tripId}`;
}

/** Signatur, mit der ein entsperrter Browser sich wieder ausweist. */
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
 * Entscheidet, ob der aktuelle Request eine Reise sehen darf – entweder als
 * angemeldeter Nutzer oder über einen freigeschalteten Share-Link.
 */
export async function resolveTripAccess(trip: Trip): Promise<TripAccess> {
  if (await getCurrentUser()) return { kind: "owner" };
  if (!trip.shareEnabled) return { kind: "denied" };
  return (await hasUnlock(trip)) ? { kind: "guest" } : { kind: "locked" };
}
