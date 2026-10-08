"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { destroySession, requireUser } from "@/lib/auth";
import { connectImmich, disconnectImmich } from "@/lib/export/immich";
import { accountFields, formString } from "@/lib/form-data";
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
  const tokenId = formString(formData, "tokenId");
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
    await addAccount(accountFields(formData));
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
        currentPassword: formString(formData, "currentPassword"),
        newPassword: formString(formData, "newPassword"),
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

/** Checks the Immich address and key against Immich and stores them. */
export async function connectImmichAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await connectImmich(user, { url: formString(formData, "url"), apiKey: formString(formData, "apiKey") });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectImmichAction() {
  const user = await requireUser();
  await disconnectImmich(user);
  revalidatePath("/settings");
}
