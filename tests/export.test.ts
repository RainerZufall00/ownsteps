import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createUser } from "@/lib/auth";
import { tripAlbum } from "@/lib/export/album";
import {
  connectImmich,
  immichJob,
  photoDescription,
  startImmichExport,
} from "@/lib/export/immich";
import { de } from "@/lib/i18n/de";
import { addMediaToStep, type IncomingMedia, updateCaption } from "@/lib/services/media";
import { createStepFromApp } from "@/lib/services/steps";
import { createTripFor } from "@/lib/services/trips";
import { makeJpeg } from "./helpers/exif";
import { collect, readZip } from "./helpers/zip";

function jpegFile(name: string, data: Buffer): IncomingMedia {
  return { name, type: "image/jpeg", size: data.length, read: async () => data };
}

/** A trip with a located step of two captioned photos and a text-only step. */
async function porto() {
  const user = await createUser({ email: "a@example.com", name: "A", password: "long enough pw" });
  const trip = await createTripFor(user.id, { title: "Portugal Roadtrip", startDate: "2026-05-02" });
  const { step } = await createStepFromApp(trip.id, user.id, {
    body: "Francesinha for lunch.\n\nSunset on the bridge.",
    placeName: "Porto",
    lat: 41.14,
    lon: -8.61,
    occurredAt: "2026-05-09T12:00:00Z",
    publish: true,
  });
  const { photos } = await addMediaToStep(step.id, [
    jpegFile("a.jpg", await makeJpeg(400, 300)),
    jpegFile("b.jpg", await makeJpeg(300, 400)),
  ]);
  await updateCaption(photos[0].id, "Lunch view over the Douro");
  await createStepFromApp(trip.id, user.id, {
    body: "Coffee & <cake>.",
    placeName: "Vienna",
    occurredAt: "2026-05-10T12:00:00Z",
    publish: true,
  });
  const fresh = (await db.select().from(users).where(eq(users.id, user.id)).get())!;
  return { user: fresh, trip, step, photos };
}

describe("photo descriptions for Immich", () => {
  const step = { occurredAt: new Date(2026, 4, 9, 12).getTime(), placeName: "Porto", body: "Francesinha." };
  const firstDay = new Date(2026, 4, 2).getTime();

  it("puts the caption first, then day and place, and the text only on the first photo", () => {
    expect(photoDescription({ caption: "Lunch view" }, step, firstDay, "de", de, true)).toBe(
      "Lunch view\n\nTag 8 · Porto · Samstag, 9. Mai 2026\nFrancesinha.",
    );
    expect(photoDescription({ caption: "Bridge" }, step, firstDay, "de", de, false)).toBe(
      "Bridge\n\nTag 8 · Porto · Samstag, 9. Mai 2026",
    );
    expect(photoDescription({ caption: null }, step, firstDay, "de", de, false)).toBe(
      "Tag 8 · Porto · Samstag, 9. Mai 2026",
    );
  });
});

describe("offline album", () => {
  beforeEach(() => {
    // No map tiles in tests – the route is drawn on a plain background.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("holds a page with text and captions, the photos and the map", async () => {
    const { trip, photos } = await porto();
    const album = await tripAlbum(trip, "de", de);
    expect(album.fileName).toBe("portugal-roadtrip.zip");
    const files = readZip(await collect(album.stream));

    const html = files.get("portugal-roadtrip/index.html")!.toString("utf8");
    expect(html).toContain("<h1>Portugal Roadtrip</h1>");
    expect(html).toContain("Tag 8 · Samstag, 9. Mai 2026");
    expect(html).toContain("<p>Francesinha for lunch.</p><p>Sunset on the bridge.</p>");
    expect(html).toContain("<figcaption>Lunch view over the Douro</figcaption>");
    // Text is escaped, not markup.
    expect(html).toContain("Coffee &amp; &lt;cake&gt;.");
    // Oldest step first, like a book.
    expect(html.indexOf("Porto")).toBeLessThan(html.indexOf("Vienna"));

    for (const photo of photos) {
      expect(files.get(`portugal-roadtrip/media/${photo.id}.webp`)?.length).toBeGreaterThan(0);
    }
    expect(files.get("portugal-roadtrip/map.jpg")?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });
});

describe("Immich export", () => {
  type Call = { method: string; path: string; body: unknown; apiKey: string | null };
  let calls: Call[];
  let validKey: string;

  beforeEach(() => {
    calls = [];
    validKey = "secret-key";
    let assets = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init: RequestInit = {}) => {
        const url = new URL(String(input));
        const headers = new Headers(init.headers);
        const method = init.method ?? "GET";
        const body =
          init.body instanceof FormData
            ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "<file>"]))
            : init.body
              ? JSON.parse(String(init.body))
              : null;
        calls.push({ method, path: url.pathname, body, apiKey: headers.get("x-api-key") });
        if (url.hostname !== "photos.example.com") return new Response(null, { status: 503 });
        if (headers.get("x-api-key") !== validKey) return Response.json({}, { status: 401 });
        const route = `${method} ${url.pathname}`;
        if (route === "GET /api/users/me") return Response.json({ name: "Mia", email: "mia@example.com" });
        if (route === "POST /api/assets") return Response.json({ id: `asset-${++assets}`, status: "created" }, { status: 201 });
        if (route.startsWith("PUT /api/assets/")) return Response.json({});
        if (route === "POST /api/albums") return Response.json({ id: "album-1" }, { status: 201 });
        if (route === "PATCH /api/albums/album-1") return Response.json({ id: "album-1" });
        if (route === "PUT /api/albums/album-1/assets") return Response.json([]);
        return Response.json({ message: "not found" }, { status: 404 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function finished(userId: number, tripId: number) {
    await vi.waitFor(() => expect(immichJob(userId, tripId)?.state).not.toBe("running"), { timeout: 10_000 });
    return immichJob(userId, tripId)!;
  }

  it("refuses a key Immich doesn't accept and stores a good one sealed", async () => {
    const { user } = await porto();
    await expect(
      connectImmich(user, { url: "photos.example.com", apiKey: "wrong" }),
    ).rejects.toMatchObject({ code: "immich_key_invalid" });

    const account = await connectImmich(user, { url: "photos.example.com/api/", apiKey: validKey });
    expect(account.name).toBe("Mia");
    const stored = (await db.select().from(users).where(eq(users.id, user.id)).get())!;
    expect(stored.immichUrl).toBe("https://photos.example.com");
    expect(stored.immichApiKey).not.toContain(validKey);
  });

  it("uploads every photo with its description and puts them in one album", async () => {
    const { user, trip, photos } = await porto();
    await connectImmich(user, { url: "https://photos.example.com", apiKey: validKey });
    const connected = (await db.select().from(users).where(eq(users.id, user.id)).get())!;

    startImmichExport(connected, trip, "de", de);
    const job = await finished(user.id, trip.id);
    expect(job).toMatchObject({ state: "done", done: 2, total: 2, albumUrl: "https://photos.example.com/albums/album-1" });

    const uploads = calls.filter((c) => c.method === "POST" && c.path === "/api/assets");
    expect(uploads).toHaveLength(2);
    expect(uploads[0].body).toMatchObject({ assetData: "<file>", deviceId: "OwnSteps" });

    const updates = calls.filter((c) => c.method === "PUT" && c.path.startsWith("/api/assets/"));
    expect(updates.map((c) => (c.body as { description: string }).description)).toEqual([
      "Lunch view over the Douro\n\nTag 8 · Porto · Samstag, 9. Mai 2026\nFrancesinha for lunch.\n\nSunset on the bridge.",
      "Tag 8 · Porto · Samstag, 9. Mai 2026",
    ]);
    // The photos have no GPS of their own; they take the step's position.
    expect(updates[0].body).toMatchObject({ latitude: 41.14, longitude: -8.61 });

    expect(calls.find((c) => c.path === "/api/albums")?.body).toMatchObject({ albumName: "Portugal Roadtrip" });
    expect(calls.find((c) => c.path === "/api/albums/album-1/assets")?.body).toEqual({
      ids: ["asset-1", "asset-2"],
    });
    expect(photos).toHaveLength(2);
  });

  it("updates the same album when sent again", async () => {
    const { user, trip } = await porto();
    await connectImmich(user, { url: "https://photos.example.com", apiKey: validKey });
    const connected = (await db.select().from(users).where(eq(users.id, user.id)).get())!;

    startImmichExport(connected, trip, "de", de);
    await finished(user.id, trip.id);
    calls = [];
    startImmichExport(connected, trip, "de", de);
    expect((await finished(user.id, trip.id)).state).toBe("done");

    expect(calls.some((c) => c.method === "POST" && c.path === "/api/albums")).toBe(false);
    expect(calls.some((c) => c.method === "PATCH" && c.path === "/api/albums/album-1")).toBe(true);
  });

  it("reports an Immich that has gone away", async () => {
    const { user, trip } = await porto();
    await connectImmich(user, { url: "https://photos.example.com", apiKey: validKey });
    const connected = (await db.select().from(users).where(eq(users.id, user.id)).get())!;
    validKey = "rotated";

    startImmichExport(connected, trip, "de", de);
    const job = await finished(user.id, trip.id);
    expect(job.state).toBe("failed");
    expect(job.error?.code).toBe("immich_key_invalid");
  });
});
