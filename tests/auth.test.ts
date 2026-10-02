import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  countUsers,
  createSession,
  createUser,
  destroySession,
  getCurrentUser,
  upsertOidcUser,
  verifyPassword,
} from "@/lib/auth";
import { jar } from "./helpers/cookie-jar";

const PASSWORD = "correct horse battery";

function newUser(email = "author@example.com") {
  return createUser({ email, name: "Author", password: PASSWORD });
}

describe("sessions", () => {
  it("stores only the token's hash, never the token itself", async () => {
    const user = await newUser();
    await createSession(user.id);

    const token = jar.get("ownsteps_session")!;
    expect(token).toBeTruthy();
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves the signed-in user from the cookie", async () => {
    const user = await newUser();
    await createSession(user.id);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("removes expired sessions when they are used", async () => {
    const user = await newUser();
    await createSession(user.id);
    await db.update(sessions).set({ expiresAt: Date.now() - 1 });

    expect(await getCurrentUser()).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("deletes the session and the cookie on sign-out", async () => {
    const user = await newUser();
    await createSession(user.id);
    await destroySession();

    expect(jar.has("ownsteps_session")).toBe(false);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await getCurrentUser()).toBeNull();
  });

  it("dies with the user", async () => {
    const user = await newUser();
    await createSession(user.id);
    await db.delete(users).where(eq(users.id, user.id));
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("passwords", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const user = await newUser();
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong password", user.passwordHash)).toBe(false);
  });

  it("rejects any password for OIDC-only accounts", async () => {
    expect(await verifyPassword("", null)).toBe(false);
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
  });
});

describe("accounts", () => {
  it("normalizes email addresses and refuses duplicates", async () => {
    const user = await newUser("  Author@Example.COM ");
    expect(user.email).toBe("author@example.com");
    await expect(newUser("author@example.com")).rejects.toThrow();
    expect(await countUsers()).toBe(1);
  });

  it("links an OIDC identity to an existing account by email", async () => {
    const user = await newUser();
    const linked = await upsertOidcUser({
      subject: "sub-123",
      email: "AUTHOR@example.com",
      emailTrusted: true,
      name: "Author Via OIDC",
    });
    expect(linked.id).toBe(user.id);
    expect(linked.oidcSubject).toBe("sub-123");
    // The password stays usable as a fallback.
    expect(linked.passwordHash).toBe(user.passwordHash);
  });

  it("finds a linked account by subject even after an email change", async () => {
    const first = await upsertOidcUser({ subject: "sub-123", email: "old@example.com", emailTrusted: true });
    const again = await upsertOidcUser({ subject: "sub-123", email: "new@example.com", emailTrusted: true });
    expect(again.id).toBe(first.id);
    expect(again.email).toBe("new@example.com");
  });

  it("never matches or overwrites an account by an unverified address", async () => {
    const user = await newUser();
    // Registered at the provider with someone else's address, unverified.
    await expect(
      upsertOidcUser({ subject: "intruder", email: "author@example.com", emailTrusted: false }),
    ).rejects.toThrow();

    // A known identity still signs in, but keeps the address on record.
    const linked = await upsertOidcUser({ subject: "sub-1", email: "author@example.com", emailTrusted: true });
    const again = await upsertOidcUser({ subject: "sub-1", email: "other@example.com", emailTrusted: false });
    expect(again.id).toBe(user.id);
    expect(again.email).toBe(linked.email);
  });

  it("creates a password-less account for new OIDC identities", async () => {
    const created = await upsertOidcUser({
      subject: "sub-456",
      email: "traveler@example.com",
      emailTrusted: true,
    });
    expect(created.passwordHash).toBeNull();
    expect(created.name).toBe("traveler");
  });
});
