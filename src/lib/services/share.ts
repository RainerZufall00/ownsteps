import "server-only";

import bcrypt from "bcryptjs";
import { ServiceError } from "@/lib/errors";
import { getTripByShareToken, grantUnlock } from "@/lib/share";

/** Checks the share password and remembers the unlock in a signed cookie. */
export async function unlockShare(token: string, password: string) {
  const trip = await getTripByShareToken(token);
  if (!trip) throw new ServiceError("share_link_invalid");
  if (!trip.sharePasswordHash) return trip;

  if (!(await bcrypt.compare(password, trip.sharePasswordHash))) {
    throw new ServiceError("share_password_wrong");
  }
  await grantUnlock(trip);
  return trip;
}
