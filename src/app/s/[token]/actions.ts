"use server";

import { headers } from "next/headers";
import { failure } from "@/lib/action-result";
import { formString } from "@/lib/form-data";
import { clientAddress } from "@/lib/rate-limit";
import { unlockShare } from "@/lib/services/share";

export type UnlockState = { error?: string; ok?: boolean };

export async function unlockAction(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  try {
    await unlockShare(
      formString(formData, "token"),
      formString(formData, "password"),
      clientAddress(await headers()),
    );
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}
