import "server-only";

import bcrypt from "bcryptjs";
import type { Trip } from "@/db/schema";
import { ServiceError } from "@/lib/errors";
import { createRateLimit } from "@/lib/rate-limit";
import { getTripByShareToken, grantUnlock } from "@/lib/share";

/** Every password attempt from one address – web unlock and app redeem alike. */
const attemptsPerClient = createRateLimit("share-password-client", { windowMs: 60_000, max: 10 });
/**
 * Wrong passwords per trip, whichever address they come from. With 8+
 * characters that leaves guessing hopeless, at the price that someone trying
 * hard can make a trip's readers wait a quarter hour.
 */
const failuresPerTrip = createRateLimit("share-password-trip", { windowMs: 15 * 60_000, max: 20 });

/**
 * Checks a share password against the brakes. Trips without a password
 * pass straight through.
 */
export async function checkSharePassword(trip: Trip, password: string, clientKey: string) {
  if (!trip.sharePasswordHash) return;
  const tripKey = String(trip.id);
  if (!attemptsPerClient.allow(clientKey) || failuresPerTrip.blocked(tripKey)) {
    throw new ServiceError("too_many_attempts");
  }
  if (!(await bcrypt.compare(password, trip.sharePasswordHash))) {
    // The app first tries without a password to learn whether one is
    // needed; that can't hit anything and shouldn't eat the trip's budget.
    if (password !== "") failuresPerTrip.record(tripKey);
    throw new ServiceError("share_password_wrong");
  }
}

/** Checks the share password and remembers the unlock in a signed cookie. */
export async function unlockShare(token: string, password: string, clientKey: string) {
  const trip = await getTripByShareToken(token);
  if (!trip) throw new ServiceError("share_link_invalid");
  if (!trip.sharePasswordHash) return trip;

  await checkSharePassword(trip, password, clientKey);
  await grantUnlock(trip);
  return trip;
}
