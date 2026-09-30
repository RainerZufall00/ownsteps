"use server";

import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { createSession } from "@/lib/auth";
import { authenticate, createFirstAccount } from "@/lib/services/accounts";

export type FormState = { error?: string };

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let userId: number;
  try {
    const user = await authenticate({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    userId = user.id;
  } catch (error) {
    return failure(error);
  }
  await createSession(userId);
  redirect("/");
}

export async function setupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let userId: number;
  try {
    const user = await createFirstAccount({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    userId = user.id;
  } catch (error) {
    return failure(error);
  }
  await createSession(userId);
  redirect("/");
}
