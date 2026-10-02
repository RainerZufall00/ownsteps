"use server";

import { headers } from "next/headers";
import { failure } from "@/lib/action-result";
import { clientAddress } from "@/lib/rate-limit";
import { unlockShare } from "@/lib/services/share";

export type UnlockState = { error?: string; ok?: boolean };

export async function unlockAction(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  try {
    await unlockShare(
      String(formData.get("token") ?? ""),
      String(formData.get("password") ?? ""),
      clientAddress(await headers()),
    );
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}
