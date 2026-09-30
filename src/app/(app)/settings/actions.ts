"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { destroySession, requireUser } from "@/lib/auth";
import { addAccount, changePassword } from "@/lib/services/accounts";
import type { ActionState } from "../actions";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
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
    await changePassword(user, {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    });
  } catch (error) {
    return failure(error);
  }
  return { ok: true };
}
