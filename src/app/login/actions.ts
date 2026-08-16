"use server";

import { redirect } from "next/navigation";
import {
  countUsers,
  createSession,
  createUser,
  findUserByEmail,
  verifyPassword,
} from "@/lib/auth";

export type FormState = { error?: string };

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Bitte E-Mail und Passwort eingeben." };
  }

  const user = await findUserByEmail(email);
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    // Bewusst keine Auskunft darüber, welcher Teil falsch war.
    return { error: "E-Mail oder Passwort stimmt nicht." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function setupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Die Ersteinrichtung steht nur offen, solange es keinen einzigen Account gibt.
  if ((await countUsers()) > 0) {
    return { error: "Es existiert bereits ein Account." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return { error: "Bitte eine gültige E-Mail angeben." };
  if (password.length < 10) {
    return { error: "Das Passwort braucht mindestens 10 Zeichen." };
  }

  const user = await createUser({ email, name: name || email, password });
  await createSession(user.id);
  redirect("/");
}
