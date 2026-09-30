"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createUser,
  destroySession,
  hashPassword,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
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

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return { error: "Bitte eine gültige E-Mail angeben." };
  if (password.length < 10) {
    return { error: "Das Passwort braucht mindestens 10 Zeichen." };
  }

  try {
    await createUser({ email, name: name || email, password });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Account konnte nicht angelegt werden.",
    };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");

  if (next.length < 10) {
    return { error: "Das neue Passwort braucht mindestens 10 Zeichen." };
  }
  // Accounts without a password (OIDC only) may set one without knowing the old one.
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) {
    return { error: "Das aktuelle Passwort stimmt nicht." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id));

  return { ok: true };
}
