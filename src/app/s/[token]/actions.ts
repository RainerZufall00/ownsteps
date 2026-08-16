"use server";

import bcrypt from "bcryptjs";
import { getTripByShareToken, grantUnlock } from "@/lib/share";

export type UnlockState = { error?: string; ok?: boolean };

export async function unlockAction(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  const trip = await getTripByShareToken(token);
  if (!trip) return { error: "Dieser Link ist nicht mehr gültig." };
  if (!trip.sharePasswordHash) return { ok: true };

  if (!(await bcrypt.compare(password, trip.sharePasswordHash))) {
    return { error: "Das Passwort stimmt nicht." };
  }

  await grantUnlock(trip);
  return { ok: true };
}
