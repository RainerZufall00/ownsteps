import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, lt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { ServiceError } from "./errors";

const SESSION_COOKIE = "ownsteps_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 days – keeps the phone signed in

/** The DB only stores the token's hash, never the token itself. */
function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string | null) {
  // OIDC-only accounts have no password – compare anyway so the response
  // time doesn't reveal whether the account exists.
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

// bcrypt hash of "ownsteps-dummy", only for the timing equalization above.
const DUMMY_HASH =
  "$2b$12$Y6XjwpokXcHol2kz/kLrJO0JnOer8IHBWyngsw24108QbJUeqz.Rq";

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Clean up expired sessions while we're at it.
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Ends every web session of the account except the one making this request –
 * after a password change, whoever knew the old one must be out.
 */
export async function revokeOtherSessions(userId: number) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await db
    .delete(sessions)
    .where(
      token
        ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(token)))
        : eq(sessions.userId, userId),
    );
}

/** Resolve only once per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
    return null;
  }
  return row.user;
});

/**
 * For Server Actions and Route Handlers. Throws when not signed in – there are
 * deliberately no roles: whoever is signed in may edit every trip.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ServiceError("not_signed_in");
  return user;
}

export async function countUsers() {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

/**
 * `onlyIfFirst` is for the initial setup: the account is only created while
 * no other exists. Check and insert run in one synchronous transaction after
 * the (slow) hashing, so two forms sent at once can't both get in.
 */
export async function createUser(
  input: { email: string; name: string; password: string },
  options: { onlyIfFirst?: boolean } = {},
) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  return db.transaction((tx) => {
    if (options.onlyIfFirst && tx.select({ id: users.id }).from(users).limit(1).get()) {
      throw new ServiceError("account_exists");
    }
    if (tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).get()) {
      throw new ServiceError("email_taken");
    }
    return tx
      .insert(users)
      .values({ email, name: input.name.trim() || email, passwordHash })
      .returning()
      .get();
  });
}

export async function findUserByOidcSubject(subject: string) {
  const rows = await db.select().from(users).where(eq(users.oidcSubject, subject)).limit(1);
  return rows[0] ?? null;
}

/**
 * Links an OIDC identity to a local account: first via `sub`, then via email
 * (so an existing password account is taken over), otherwise a new account
 * is created. `emailTrusted` must only be true for an address the provider
 * verified – the caller refuses everything but a known `sub` otherwise.
 */
export async function upsertOidcUser(claims: {
  subject: string;
  email: string;
  emailTrusted: boolean;
  name?: string | null;
  picture?: string | null;
}): Promise<User> {
  const email = claims.email.trim().toLowerCase();

  const linked = await findUserByOidcSubject(claims.subject);
  if (linked) {
    const [updated] = await db
      .update(users)
      .set({
        // An unverified address must not overwrite the one on record.
        email: claims.emailTrusted ? email : linked.email,
        name: claims.name?.trim() || linked.name,
        avatarUrl: claims.picture ?? linked.avatarUrl,
      })
      .where(eq(users.id, linked.id))
      .returning();
    return updated;
  }
  if (!claims.emailTrusted) throw new Error("Unverified email for an unknown subject.");

  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    const [linked] = await db
      .update(users)
      .set({
        oidcSubject: claims.subject,
        name: claims.name?.trim() || byEmail.name,
        avatarUrl: claims.picture ?? byEmail.avatarUrl,
      })
      .where(eq(users.id, byEmail.id))
      .returning();
    return linked;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: claims.name?.trim() || email.split("@")[0],
      passwordHash: null,
      oidcSubject: claims.subject,
      avatarUrl: claims.picture ?? null,
    })
    .returning();
  return created;
}

export async function getUserById(userId: number) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * On the very first start, creates the account from ADMIN_EMAIL/ADMIN_PASSWORD.
 * Without these variables the setup page handles the initial setup.
 */
export async function seedAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if ((await countUsers()) > 0) return;

  await createUser({
    email,
    name: process.env.ADMIN_NAME?.trim() || email.split("@")[0],
    password,
  });
  console.log(`[auth] Admin account created: ${email}`);
}
