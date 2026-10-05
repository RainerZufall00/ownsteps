import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { createSession, createUser } from "@/lib/auth";
import {
  getTripByShareToken,
  grantUnlock,
  hasUnlock,
  resolveTripAccess,
} from "@/lib/share";
import { createTrip, getTrip, updateTrip } from "@/lib/trips";
import { jar } from "./helpers/cookie-jar";

async function setup(options: { shared?: boolean; password?: string } = {}) {
  const user = await createUser({
    email: "author@example.com",
    name: "Author",
    password: "correct horse battery",
  });
  const created = await createTrip({ title: "Norway", userId: user.id });
  await updateTrip(created.id, {
    shareEnabled: options.shared ?? false,
    sharePasswordHash: options.password
      ? await bcrypt.hash(options.password, 4)
      : null,
  });
  const trip = (await getTrip(created.id))!;
  return { user, trip };
}

describe("resolveTripAccess", () => {
  it("grants owner access to a signed-in user, even for unshared trips", async () => {
    const { user, trip } = await setup({ shared: false });
    await createSession(user.id);
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "owner" });
  });

  it("denies anonymous visitors when sharing is off", async () => {
    const { trip } = await setup({ shared: false });
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "denied" });
  });

  it("lets anonymous visitors read a shared trip without password", async () => {
    const { trip } = await setup({ shared: true });
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "guest" });
  });

  it("denies anonymous visitors without the link's token", async () => {
    const { trip } = await setup({ shared: true });
    expect(await resolveTripAccess(trip, null)).toEqual({ kind: "denied" });
    expect(await resolveTripAccess(trip, "wrong-token")).toEqual({ kind: "denied" });
  });

  it("denies the old token after the link was rotated", async () => {
    const { trip } = await setup({ shared: true });
    await updateTrip(trip.id, { shareToken: "fresh-token-value" });
    const rotated = (await getTrip(trip.id))!;
    expect(await resolveTripAccess(rotated, trip.shareToken)).toEqual({ kind: "denied" });
    expect(await resolveTripAccess(rotated, "fresh-token-value")).toEqual({ kind: "guest" });
  });

  it("locks a password-protected trip until it is unlocked", async () => {
    const { trip } = await setup({ shared: true, password: "fjord" });
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "locked" });

    await grantUnlock(trip);
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "guest" });
  });

  it("rejects a forged unlock cookie", async () => {
    const { trip } = await setup({ shared: true, password: "fjord" });
    jar.set(`ownsteps_unlock_${trip.id}`, "forged-signature");
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "locked" });
  });

  it("does not accept one trip's unlock cookie for another trip", async () => {
    const { user, trip } = await setup({ shared: true, password: "fjord" });
    const other = await createTrip({ title: "Iceland", userId: user.id });
    await updateTrip(other.id, {
      shareEnabled: true,
      sharePasswordHash: trip.sharePasswordHash,
    });
    await grantUnlock(trip);
    // Copy the valid cookie of the first trip onto the second one's name.
    jar.set(`ownsteps_unlock_${other.id}`, jar.get(`ownsteps_unlock_${trip.id}`)!);
    expect(await resolveTripAccess((await getTrip(other.id))!, other.shareToken)).toEqual({
      kind: "locked",
    });
  });

  it("invalidates existing unlocks when the password changes", async () => {
    const { trip } = await setup({ shared: true, password: "fjord" });
    await grantUnlock(trip);
    await updateTrip(trip.id, { sharePasswordHash: await bcrypt.hash("glacier", 4) });
    const changed = (await getTrip(trip.id))!;
    expect(await hasUnlock(changed)).toBe(false);
    expect(await resolveTripAccess(changed, trip.shareToken)).toEqual({ kind: "locked" });
  });

  it("denies even unlocked visitors once sharing is switched off", async () => {
    const { trip } = await setup({ shared: true, password: "fjord" });
    await grantUnlock(trip);
    await updateTrip(trip.id, { shareEnabled: false });
    expect(await resolveTripAccess((await getTrip(trip.id))!, trip.shareToken)).toEqual({
      kind: "denied",
    });
  });

  it("treats an expired session as anonymous", async () => {
    const { user, trip } = await setup({ shared: false });
    await createSession(user.id);
    await db.update(sessions).set({ expiresAt: Date.now() - 1000 });
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "denied" });
  });

  it("treats an unknown session token as anonymous", async () => {
    const { trip } = await setup({ shared: true, password: "fjord" });
    jar.set("ownsteps_session", "not-a-real-session");
    expect(await resolveTripAccess(trip, trip.shareToken)).toEqual({ kind: "locked" });
  });
});

describe("getTripByShareToken", () => {
  it("finds shared trips by token only", async () => {
    const { trip } = await setup({ shared: true });
    expect((await getTripByShareToken(trip.shareToken))?.id).toBe(trip.id);
    expect(await getTripByShareToken("wrong-token")).toBeNull();
  });

  it("hides trips whose sharing is switched off", async () => {
    const { trip } = await setup({ shared: false });
    expect(await getTripByShareToken(trip.shareToken)).toBeNull();
  });

  it("stops resolving the old token after rotation", async () => {
    const { trip } = await setup({ shared: true });
    await updateTrip(trip.id, { shareToken: "fresh-token-value" });
    expect(await getTripByShareToken(trip.shareToken)).toBeNull();
    expect((await getTripByShareToken("fresh-token-value"))?.id).toBe(trip.id);
  });
});

describe("share tokens", () => {
  it("are unique per trip and long enough to be unguessable", async () => {
    const { user, trip } = await setup();
    const other = await createTrip({ title: "Iceland", userId: user.id });
    expect(trip.shareToken).not.toBe(other.shareToken);
    // 24 random bytes → 32 base64url characters.
    expect(trip.shareToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

