import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, lt } from "drizzle-orm";
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

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new ServiceError("email_taken");
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: input.name.trim() || email,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return created;
}

/**
 * Links an OIDC identity to a local account: first via `sub`, then via email
 * (so an existing password account is taken over), otherwise a new account
 * is created.
 */
export async function upsertOidcUser(claims: {
  subject: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}): Promise<User> {
  const email = claims.email.trim().toLowerCase();

  const bySubject = await db
    .select()
    .from(users)
    .where(eq(users.oidcSubject, claims.subject))
    .limit(1);
  if (bySubject[0]) {
    const [updated] = await db
      .update(users)
      .set({
        email,
        name: claims.name?.trim() || bySubject[0].name,
        avatarUrl: claims.picture ?? bySubject[0].avatarUrl,
      })
      .where(eq(users.id, bySubject[0].id))
      .returning();
    return updated;
  }

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
