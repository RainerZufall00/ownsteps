"use server";

import { failure } from "@/lib/action-result";
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
    );
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}
