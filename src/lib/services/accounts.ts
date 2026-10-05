import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import {
  countUsers,
  createUser,
  findUserByEmail,
  hashPassword,
  revokeOtherSessions,
  verifyPassword,
} from "@/lib/auth";
import { PASSWORD_LOGIN } from "@/lib/env";
import { revokeAllApiTokens } from "@/lib/tokens";
import { ServiceError } from "@/lib/errors";
import { createRateLimit } from "@/lib/rate-limit";
import {
  credentialsInput,
  newAccountInput,
  parseInput,
  passwordChangeInput,
} from "@/lib/schemas";

/** Every signed-in account may add further accounts ([E2]). */
export async function addAccount(raw: unknown, options: { onlyIfFirst?: boolean } = {}) {
  const input = parseInput(newAccountInput, raw);
  return createUser(
    { email: input.email, name: input.name || input.email, password: input.password },
    options,
  );
}

/** Initial setup is only open as long as not a single account exists. */
export async function createFirstAccount(raw: unknown) {
  // Early answer without hashing; createUser checks again atomically.
  if ((await countUsers()) > 0) throw new ServiceError("account_exists");
  return addAccount(raw, { onlyIfFirst: true });
}

/** Every attempt from one address – web form and app alike. */
const loginsPerClient = createRateLimit("login-client", { windowMs: 60_000, max: 10 });
/**
 * Failed attempts per account, whichever address they come from – an
 * attacker rotating addresses still only gets a handful per quarter hour.
 */
const failuresPerAccount = createRateLimit("login-account", { windowMs: 15 * 60_000, max: 10 });

/**
 * Checking the current password is a password check like a login – it
 * draws on the same brakes, so a stolen session can't be used to guess it.
 * Afterwards every other web session and every app device of the account is
 * signed out: whoever knew the old password must be out everywhere. The app
 * keeps steps it hadn't sent yet and sends them after the next sign-in.
 */
export async function changePassword(user: User, raw: unknown, clientKey: string) {
  const input = parseInput(passwordChangeInput, raw);
  // Accounts without a password (OIDC only) may set one without knowing the old one.
  if (user.passwordHash) {
    if (!loginsPerClient.allow(clientKey) || failuresPerAccount.blocked(user.email)) {
      throw new ServiceError("too_many_attempts");
    }
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      failuresPerAccount.record(user.email);
      throw new ServiceError("current_password_wrong");
    }
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, user.id));
  await revokeOtherSessions(user.id);
  await revokeAllApiTokens(user.id);
}

/**
 * Deliberately no hint as to which part was wrong. `clientKey` identifies
 * the sender for the brake (see `clientAddress`).
 */
export async function authenticate(raw: unknown, clientKey: string) {
  if (!PASSWORD_LOGIN) throw new ServiceError("password_login_disabled");
  const { email, password } = parseInput(credentialsInput, raw);
  const account = email.trim().toLowerCase();
  if (!loginsPerClient.allow(clientKey) || failuresPerAccount.blocked(account)) {
    throw new ServiceError("too_many_attempts");
  }
  const user = await findUserByEmail(account);
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    failuresPerAccount.record(account);
    throw new ServiceError("credentials_invalid");
  }
  return user;
}
