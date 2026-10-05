"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { failure } from "@/lib/action-result";
import { createSession } from "@/lib/auth";
import { accountFields, formString } from "@/lib/form-data";
import { clientAddress } from "@/lib/rate-limit";
import { authenticate, createFirstAccount } from "@/lib/services/accounts";

export type FormState = { error?: string };

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let userId: number;
  try {
    const user = await authenticate(
      { email: formString(formData, "email"), password: formString(formData, "password") },
      clientAddress(await headers()),
    );
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
    const user = await createFirstAccount(accountFields(formData));
    userId = user.id;
  } catch (error) {
    return failure(error);
  }
  await createSession(userId);
  redirect("/");
}
