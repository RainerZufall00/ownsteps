import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { createUser } from "@/lib/auth";
import { grantUnlock } from "@/lib/share";
import { createTrip, getTrip, updateTrip } from "@/lib/trips";

async function setup(
  options: { shared?: boolean; password?: string; title?: string } = {},
) {
  const user = await createUser({
    email: "author@example.com",
    name: "Author",
    password: "correct horse battery",
  });
  const created = await createTrip({ title: options.title ?? "Norway", userId: user.id });
  await updateTrip(created.id, {
    shareEnabled: options.shared ?? true,
    sharePasswordHash: options.password ? await bcrypt.hash(options.password, 4) : null,
  });
  return (await getTrip(created.id))!;
}

async function fetchManifest(token: string) {
  const { GET } = await import("@/app/s/[token]/manifest.webmanifest/route");
  return GET(new Request(`http://localhost/s/${token}/manifest.webmanifest`), {
    params: Promise.resolve({ token }),
  });
}

describe("share-link manifest", () => {
  it("starts at the share link and is named after the trip", async () => {
    const trip = await setup({ title: "Norway in winter" });
    const response = await fetchManifest(trip.shareToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");

    const manifest = await response.json();
    expect(manifest.start_url).toBe(`/s/${trip.shareToken}`);
    expect(manifest.scope).toBe(`/s/${trip.shareToken}`);
    expect(manifest.id).toBe(`/s/${trip.shareToken}`);
    // Named after the instance, like the apps.
    expect(manifest.name).toBe("OwnSteps");
    expect(manifest.short_name).toBe("OwnSteps");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("answers 404 for an unknown token", async () => {
    await setup();
    expect((await fetchManifest("no-such-token")).status).toBe(404);
  });

  it("answers 404 once sharing is switched off", async () => {
    const trip = await setup({ shared: false });
    expect((await fetchManifest(trip.shareToken)).status).toBe(404);
  });

  it("doesn't need the unlock cookie and tells nothing about a protected trip", async () => {
    const trip = await setup({ title: "Secret fjords", password: "fjord-password" });
    const response = await fetchManifest(trip.shareToken);
    expect(response.status).toBe(200);
    const manifest = await response.json();
    expect(manifest.start_url).toBe(`/s/${trip.shareToken}`);
    expect(manifest.name).toBe("OwnSteps");
    expect(JSON.stringify(manifest)).not.toContain("Secret fjords");
  });

});

describe("share page metadata", () => {
  async function metadata(token: string) {
    const { generateMetadata } = await import("@/app/s/[token]/page");
    return generateMetadata({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({}),
    } as PageProps<"/s/[token]">);
  }

  it("links the share link's own manifest and names the home-screen app", async () => {
    const trip = await setup({ title: "Norway in winter" });
    const meta = await metadata(trip.shareToken);
    expect(meta.manifest).toBe(`/s/${trip.shareToken}/manifest.webmanifest`);
    expect(meta.appleWebApp).toMatchObject({ capable: true, title: "OwnSteps" });
    expect(meta.openGraph?.title).toBe("Norway in winter");
  });

  it("names a locked page's home-screen app after the instance too", async () => {
    const trip = await setup({ title: "Secret fjords", password: "fjord-password" });
    const meta = await metadata(trip.shareToken);
    expect(meta.manifest).toBe(`/s/${trip.shareToken}/manifest.webmanifest`);
    expect(meta.appleWebApp).toMatchObject({ title: "OwnSteps" });
  });
});
