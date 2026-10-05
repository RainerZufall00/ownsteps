"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { destroySession, requireUser } from "@/lib/auth";
import { clientAddress } from "@/lib/rate-limit";
import { addAccount, changePassword } from "@/lib/services/accounts";
import { revokeApiToken } from "@/lib/tokens";
import type { ActionState } from "../actions";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Signs one of your app devices out; its token stops working immediately. */
export async function revokeDeviceAction(formData: FormData) {
  const user = await requireUser();
  const tokenId = String(formData.get("tokenId") ?? "");
  if (!tokenId) return;
  await revokeApiToken(tokenId, user.id);
  revalidatePath("/settings");
}

export async function addUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  try {
    await addAccount({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await changePassword(
      user,
      {
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: String(formData.get("newPassword") ?? ""),
      },
      clientAddress(await headers()),
    );
  } catch (error) {
    return failure(error);
  }
  // The device list shows the signed-out app devices as gone.
  revalidatePath("/settings");
  return { ok: true };
}
