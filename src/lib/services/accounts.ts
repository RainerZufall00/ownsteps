import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import {
  countUsers,
  createUser,
  findUserByEmail,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { PASSWORD_LOGIN } from "@/lib/env";
import { ServiceError } from "@/lib/errors";
import {
  credentialsInput,
  newAccountInput,
  parseInput,
  passwordChangeInput,
} from "@/lib/schemas";

/** Every signed-in account may add further accounts ([E2]). */
export async function addAccount(raw: unknown) {
  const input = parseInput(newAccountInput, raw);
  return createUser({
    email: input.email,
    name: input.name || input.email,
    password: input.password,
  });
}

/** Initial setup is only open as long as not a single account exists. */
export async function createFirstAccount(raw: unknown) {
  if ((await countUsers()) > 0) throw new ServiceError("account_exists");
  return addAccount(raw);
}

export async function changePassword(user: User, raw: unknown) {
  const input = parseInput(passwordChangeInput, raw);
  // Accounts without a password (OIDC only) may set one without knowing the old one.
  if (
    user.passwordHash &&
    !(await verifyPassword(input.currentPassword, user.passwordHash))
  ) {
    throw new ServiceError("current_password_wrong");
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, user.id));
}

/** Deliberately no hint as to which part was wrong. */
export async function authenticate(raw: unknown) {
  if (!PASSWORD_LOGIN) throw new ServiceError("password_login_disabled");
  const { email, password } = parseInput(credentialsInput, raw);
  const user = await findUserByEmail(email);
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) throw new ServiceError("credentials_invalid");
  return user;
}
