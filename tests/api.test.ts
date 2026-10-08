import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/db";
import { MAX_IMAGE_BYTES } from "@/lib/limits";
import { getPhoto } from "@/lib/photos";
import { TMP_DIR } from "@/lib/multipart";
import { pkceChallenge } from "@/lib/crypto";
import { createAuthCode } from "@/lib/tokens";
import { makeJpeg } from "./helpers/exif";

/**
 * Calls the route handlers of `/api/v1` directly with real `Request`s – no
 * server needed, but the same code path as in production.
 */

const API_DIR = path.resolve(import.meta.dirname, "../src/app/api/v1");
const BASE = "http://localhost:2555";
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

function routeFiles(dir = API_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** `trips/[id]/steps` → `/api/v1/trips/{id}/steps` */
function routePath(file: string) {
  const relative = path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/");
  return `/api/v1/${relative}`.replace(/\[(\w+)\]/g, "{$1}");
}

async function load(route: string): Promise<Record<string, Handler>> {
  const folder = route.replace(/^\/api\/v1\//, "").replace(/\{(\w+)\}/g, "[$1]");
  const file = path.join(API_DIR, folder, "route.ts");
  return import(pathToFileURL(file).href);
}

async function call(
  method: (typeof METHODS)[number],
  route: string,
  options: {
    params?: Record<string, string | number>;
    token?: string;
    body?: unknown;
    form?: FormData;
    query?: string;
  } = {},
) {
  const params = Object.fromEntries(
    Object.entries(options.params ?? {}).map(([key, value]) => [key, String(value)]),
  );
  const url =
    BASE + route.replace(/\{(\w+)\}/g, (_, key: string) => params[key]) + (options.query ?? "");
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  const handler = (await load(route))[method];
  const response = await handler(new Request(url, { method, headers, body }), {
    params: Promise.resolve(params),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, headers: response.headers };
}

async function signIn() {
  await createUser({ email: "author@example.com", name: "Author", password: "long enough pw" });
  const { status, json } = await call("POST", "/api/v1/auth/token", {
    body: { email: "author@example.com", password: "long enough pw", deviceName: "Test iPhone" },
  });
  expect(status).toBe(201);
  return json.token as string;
}

/** A signed-in author with a shared trip, as the author sees it. */
async function sharedTrip(password?: string) {
  const token = await signIn();
  const trip = await call("POST", "/api/v1/trips", { token, body: { title: "Norway" } });
  await call("PATCH", "/api/v1/trips/{id}", {
    token,
    params: { id: trip.json.id },
    body: { shareEnabled: true },
  });
  if (password) {
    const { updateSharing } = await import("@/lib/services/trips");
    await updateSharing(trip.json.id, { enabled: true, password });
  }
  const detail = await call("GET", "/api/v1/trips/{id}", { token, params: { id: trip.json.id } });
  return { token, trip: detail.json };
}

/** Routes anyone may call; everything else needs a token. */
const PUBLIC = new Set([
  "GET /api/v1/info",
  "GET /api/v1/openapi.json",
  "POST /api/v1/auth/token",
  "GET /api/v1/auth/oidc/start",
  "POST /api/v1/auth/oidc/exchange",
  "POST /api/v1/viewers/redeem",
]);

describe("guard", () => {
  it("answers 401 on every protected route without a token", async () => {
    const checked: string[] = [];
    for (const file of routeFiles()) {
      const route = routePath(file);
      const module = await load(route);
      for (const method of METHODS) {
        if (!module[method] || PUBLIC.has(`${method} ${route}`)) continue;
        const { status, json } = await call(method, route, {
          params: { id: 1, variant: "thumb" },
          body: method === "GET" ? undefined : {},
        });
        expect(status, `${method} ${route}`).toBe(401);
        expect(json?.type, `${method} ${route}`).toBe("urn:ownsteps:problem:not_signed_in");
        checked.push(`${method} ${route}`);
      }
    }
    // Guards against the walk silently finding nothing.
    expect(checked.length).toBeGreaterThan(15);
  });

  it("answers 401 for unknown and malformed tokens", async () => {
    for (const token of ["osa_nope", "osv_nope", "garbage"]) {
      const { status } = await call("GET", "/api/v1/trips", { token });
      expect(status).toBe(401);
    }
  });

  it("documents every route in the OpenAPI document and nothing else", async () => {
    const { json } = await call("GET", "/api/v1/openapi.json");
    const documented = new Set(
      Object.entries(json.paths as Record<string, object>).flatMap(([route, ops]) =>
        Object.keys(ops).map((method) => `${method.toUpperCase()} ${route}`),
      ),
    );
    const implemented = new Set<string>();
    for (const file of routeFiles()) {
      const route = routePath(file);
      if (route === "/api/v1/openapi.json") continue;
      const module = await load(route);
      for (const method of METHODS) {
        if (module[method]) implemented.add(`${method} ${route}`);
      }
    }
    // Path parameter names differ ({id} vs {tripId}), so compare the shape.
    const shape = (entry: string) => entry.replace(/\{\w+\}/g, "{}");
    expect([...documented].map(shape).sort()).toEqual([...implemented].map(shape).sort());
  });

  it("matches the copy the iOS client is generated from", async () => {
    const { json } = await call("GET", "/api/v1/openapi.json");
    const exported = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, "../ios/Packages/OwnStepsKit/Sources/OwnStepsAPI/openapi.json"),
        "utf8",
      ),
    );
    // On failure: npm run openapi:export
    expect(exported).toEqual(json);
  });
});

describe("info", () => {
  it("tells the app what the server can do", async () => {
    const before = await call("GET", "/api/v1/info");
    expect(before.json).toMatchObject({ apiVersion: 1, setupComplete: false });
    await createUser({ email: "a@example.com", name: "A", password: "long enough pw" });
    const after = await call("GET", "/api/v1/info");
    expect(after.json).toMatchObject({
      setupComplete: true,
      auth: { password: true, oidc: false },
    });
    expect(after.json.features).toContain("changes");
  });
});

describe("authors", () => {
  it("rejects wrong passwords without saying which part was wrong", async () => {
    await createUser({ email: "author@example.com", name: "A", password: "long enough pw" });
    const { status, json } = await call("POST", "/api/v1/auth/token", {
      body: { email: "author@example.com", password: "wrong", deviceName: "x" },
    });
    expect(status).toBe(401);
    expect(json.code).toBe("credentials_invalid");
  });

  it("creates trips and steps, idempotent via clientUuid", async () => {
    const token = await signIn();

    const me = await call("GET", "/api/v1/me", { token });
    expect(me.json).toMatchObject({ kind: "author", user: { email: "author@example.com" } });

    const trip = await call("POST", "/api/v1/trips", {
      token,
      body: { title: "Norway", startDate: "2026-07-01" },
    });
    expect(trip.status).toBe(201);
    expect(trip.json).toMatchObject({ title: "Norway", share: { enabled: false } });

    const clientUuid = "0b6e6f2c-5d0e-4a8e-9a3f-3f1f7c2b9d11";
    const first = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: { clientUuid, body: "Written offline", occurredAt: "2026-07-02T08:30:00Z" },
    });
    expect(first.status).toBe(201);
    const retry = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: { clientUuid, body: "Written offline" },
    });
    expect(retry.status).toBe(200);
    expect(retry.json.id).toBe(first.json.id);
    expect(first.json.occurredAt).toBe("2026-07-02T08:30:00.000Z");

    const empty = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: {},
    });
    expect(empty.json.code).toBe("step_empty");

    const detail = await call("GET", "/api/v1/trips/{id}", {
      token,
      params: { id: trip.json.id },
    });
    expect(detail.json.steps).toHaveLength(1);
  });

  it("uploads media once per clientUuid and serves the files", async () => {
    const token = await signIn();
    const trip = await call("POST", "/api/v1/trips", { token, body: { title: "Norway" } });
    const step = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: { publish: false },
    });

    const jpeg = await makeJpeg(640, 480, { lat: 60.39, lon: 5.32 });
    const upload = () => {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(jpeg)], "bergen.jpg", { type: "image/jpeg" }));
      form.set("clientUuid", "photo-uuid-1");
      form.set("caption", "  The harbour at dawn  ");
      return call("POST", "/api/v1/steps/{id}/media", {
        token,
        params: { id: step.json.id },
        form,
      });
    };

    const first = await upload();
    expect(first.status).toBe(201);
    expect(first.json.step.lat).toBeCloseTo(60.39, 2);
    expect(first.json.photo.caption).toBe("The harbour at dawn");
    const second = await upload();
    expect(second.json.photo.id).toBe(first.json.photo.id);

    const detail = await call("GET", "/api/v1/trips/{id}", { token, params: { id: trip.json.id } });
    expect(detail.json.steps[0].photos).toHaveLength(1);

    const file = await call("GET", "/api/v1/photos/{id}/{variant}", {
      token,
      params: { id: first.json.photo.id, variant: "thumb" },
    });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/webp");

    const noFile = await call("POST", "/api/v1/steps/{id}/media", {
      token,
      params: { id: step.json.id },
      form: new FormData(),
    });
    expect(noFile.json.code).toBe("no_file");
  });

  it("deletes a trip with its steps and photo files", async () => {
    const token = await signIn();
    const trip = await call("POST", "/api/v1/trips", { token, body: { title: "Norway" } });
    const step = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: { publish: false },
    });
    const form = new FormData();
    form.set("file", new File([new Uint8Array(await makeJpeg(100, 100))], "a.jpg", { type: "image/jpeg" }));
    const upload = await call("POST", "/api/v1/steps/{id}/media", { token, params: { id: step.json.id }, form });
    const photo = (await getPhoto(upload.json.photo.id))!;
    expect(fs.existsSync(path.join(UPLOAD_DIR, photo.storageKey))).toBe(true);

    const deleted = await call("DELETE", "/api/v1/trips/{id}", { token, params: { id: trip.json.id } });
    expect(deleted.status).toBe(204);
    expect((await call("GET", "/api/v1/trips/{id}", { token, params: { id: trip.json.id } })).status).toBe(404);
    // ON DELETE CASCADE only removes rows – the files must go too.
    expect(fs.existsSync(path.join(UPLOAD_DIR, photo.storageKey))).toBe(false);
    const again = await call("DELETE", "/api/v1/trips/{id}", { token, params: { id: trip.json.id } });
    expect(again.status).toBe(404);
  });

  it("names a step from its coordinates when the app couldn't", async () => {
    const token = await signIn();
    const trip = await call("POST", "/api/v1/trips", { token, body: { title: "Norway" } });
    const { json } = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: { body: "Fjords", lat: 60.39, lon: 5.32 },
    });
    // Without a MapTiler key there's nobody to ask: the step stays nameless
    // but keeps its position.
    expect(json.lat).toBeCloseTo(60.39, 2);
    expect(json.placeName).toBeNull();
  });

  it("moves an uploaded video into place and refuses oversized files", async () => {
    const token = await signIn();
    const trip = await call("POST", "/api/v1/trips", { token, body: { title: "Norway" } });
    const step = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.json.id },
      body: { publish: false },
    });
    const video = Buffer.from("fake mp4 payload");

    const form = new FormData();
    form.set("file", new File([new Uint8Array(video)], "fjord.mp4", { type: "video/mp4" }));
    form.set("poster", new File([new Uint8Array(await makeJpeg(640, 360))], "poster.jpg", { type: "image/jpeg" }));
    form.set("durationMs", "4200");
    const uploaded = await call("POST", "/api/v1/steps/{id}/media", {
      token,
      params: { id: step.json.id },
      form,
    });
    expect(uploaded.status).toBe(201);
    expect(uploaded.json.photo).toMatchObject({ mediaType: "video", durationMs: 4200 });

    const served = await call("GET", "/api/v1/photos/{id}/{variant}", {
      token,
      params: { id: uploaded.json.photo.id, variant: "video" },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-length")).toBe(String(video.length));

    // One byte over the image limit: rejected, and nothing stays in tmp/.
    const tooBig = new FormData();
    tooBig.set(
      "file",
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.jpg", { type: "image/jpeg" }),
    );
    const rejected = await call("POST", "/api/v1/steps/{id}/media", {
      token,
      params: { id: step.json.id },
      form: tooBig,
    });
    expect(rejected.json.code).toBe("image_too_large");
    expect(fs.readdirSync(TMP_DIR)).toEqual([]);
  });

  it("signs a device out", async () => {
    const token = await signIn();
    expect((await call("DELETE", "/api/v1/auth/token", { token })).status).toBe(204);
    expect((await call("GET", "/api/v1/me", { token })).status).toBe(401);
  });
});

describe("viewers", () => {
  it("redeems a share link, asking for the password once", async () => {
    const { trip } = await sharedTrip("fjordland");

    const wrong = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: trip.share.url, password: "nope", name: "Grandma" },
    });
    expect(wrong.json.code).toBe("share_password_wrong");

    const redeemed = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: trip.share.url, password: "fjordland", name: "Grandma", deviceName: "iPad" },
    });
    expect(redeemed.status).toBe(201);
    expect(redeemed.json.token).toMatch(/^osv_/);
    // Readers never see the share settings.
    expect(redeemed.json.trip.share).toBeUndefined();

    const viewerToken = redeemed.json.token;
    const detail = await call("GET", "/api/v1/trips/{id}", {
      token: viewerToken,
      params: { id: trip.id },
    });
    expect(detail.status).toBe(200);
    expect(detail.json.share).toBeUndefined();
  });

  it("lets viewers read and comment but not write", async () => {
    const { token, trip } = await sharedTrip();
    const step = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: trip.id },
      body: { body: "Fjords" },
    });
    const { json } = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: trip.share.url, name: "Grandma" },
    });
    const viewer = json.token;

    const comment = await call("POST", "/api/v1/steps/{id}/comments", {
      token: viewer,
      params: { id: step.json.id },
      body: { body: "Beautiful!", authorName: "Someone else" },
    });
    expect(comment.status).toBe(201);
    expect(comment.json.authorName).toBe("Grandma");

    const patch = await call("PATCH", "/api/v1/trips/{id}", {
      token: viewer,
      params: { id: trip.id },
      body: { title: "Hacked" },
    });
    expect(patch.status).toBe(403);

    const list = await call("GET", "/api/v1/trips", { token: viewer });
    expect(list.json.items.map((t: { id: number }) => t.id)).toEqual([trip.id]);
  });

  it("sees only its own trip", async () => {
    const { token, trip } = await sharedTrip();
    const other = await call("POST", "/api/v1/trips", { token, body: { title: "Secret" } });
    const otherStep = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: other.json.id },
      body: { publish: false },
    });
    const form = new FormData();
    form.set("file", new File([new Uint8Array(await makeJpeg(100, 100))], "a.jpg", { type: "image/jpeg" }));
    const photo = await call("POST", "/api/v1/steps/{id}/media", {
      token,
      params: { id: otherStep.json.id },
      form,
    });

    const { json } = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: trip.share.url, name: "Grandma" },
    });
    const viewer = json.token;

    expect(
      (await call("GET", "/api/v1/trips/{id}", { token: viewer, params: { id: other.json.id } })).status,
    ).toBe(404);
    expect(
      (
        await call("GET", "/api/v1/photos/{id}/{variant}", {
          token: viewer,
          params: { id: photo.json.photo.id, variant: "thumb" },
        })
      ).status,
    ).toBe(404);
  });

  it("is locked out while sharing is off and removable by authors", async () => {
    const { token, trip } = await sharedTrip();
    const { json } = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: trip.share.url, name: "Grandma" },
    });
    const viewer = json.token;

    await call("PATCH", "/api/v1/trips/{id}", { token, params: { id: trip.id }, body: { shareEnabled: false } });
    const locked = await call("GET", "/api/v1/trips/{id}", { token: viewer, params: { id: trip.id } });
    expect(locked.json.code).toBe("trip_not_shared");

    await call("PATCH", "/api/v1/trips/{id}", { token, params: { id: trip.id }, body: { shareEnabled: true } });
    expect((await call("GET", "/api/v1/trips/{id}", { token: viewer, params: { id: trip.id } })).status).toBe(200);

    const viewers = await call("GET", "/api/v1/trips/{id}/viewers", { token, params: { id: trip.id } });
    expect(viewers.json.items).toHaveLength(1);
    await call("DELETE", "/api/v1/viewers/{id}", { token, params: { id: viewers.json.items[0].id } });
    expect((await call("GET", "/api/v1/me", { token: viewer })).status).toBe(401);
  });

  it("signs every reader out when the link or the password changes ([D17])", async () => {
    const { token, trip } = await sharedTrip();
    const redeem = async () =>
      (await call("POST", "/api/v1/viewers/redeem", { body: { shareLink: trip.share.url, name: "Grandma" } })).json
        .token as string;
    const { rotateShareToken, updateSharing } = await import("@/lib/services/trips");

    const first = await redeem();
    await rotateShareToken(trip.id);
    expect((await call("GET", "/api/v1/me", { token: first })).status).toBe(401);

    const detail = await call("GET", "/api/v1/trips/{id}", { token, params: { id: trip.id } });
    const second = (
      await call("POST", "/api/v1/viewers/redeem", { body: { shareLink: detail.json.share.url, name: "Grandpa" } })
    ).json.token;
    // Only a new password signs out; switching sharing on again doesn't.
    await updateSharing(trip.id, { enabled: true, password: "" });
    expect((await call("GET", "/api/v1/me", { token: second })).status).toBe(200);
    await updateSharing(trip.id, { enabled: true, password: "a new secret" });
    expect((await call("GET", "/api/v1/me", { token: second })).status).toBe(401);
  });
});

describe("step views", () => {
  async function tripWithReader() {
    const { token, trip } = await sharedTrip();
    const steps = [];
    for (const body of ["Oslo", "Bergen"]) {
      const step = await call("POST", "/api/v1/trips/{id}/steps", {
        token,
        params: { id: trip.id },
        body: { body },
      });
      steps.push(step.json.id as number);
    }
    const redeem = async (name: string) =>
      (await call("POST", "/api/v1/viewers/redeem", { body: { shareLink: trip.share.url, name } }))
        .json.token as string;
    return { token, tripId: trip.id as number, steps, redeem };
  }

  const counts = async (token: string, tripId: number) => {
    const { json } = await call("GET", "/api/v1/trips/{id}", { token, params: { id: tripId } });
    return json.steps.map((step: { viewCount?: number }) => step.viewCount);
  };

  it("counts each reader once per step and shows the numbers to authors only", async () => {
    const { token, tripId, steps, redeem } = await tripWithReader();
    expect(await counts(token, tripId)).toEqual([0, 0]);

    const grandma = await redeem("Grandma");
    const uncle = await redeem("Uncle");
    for (const viewer of [grandma, grandma, uncle]) {
      const { status } = await call("POST", "/api/v1/trips/{id}/views", {
        token: viewer,
        params: { id: tripId },
        body: { stepIds: [steps[0]] },
      });
      expect(status).toBe(204);
    }
    await call("POST", "/api/v1/trips/{id}/views", {
      token: grandma,
      params: { id: tripId },
      body: { stepIds: [steps[1], 999_999] },
    });

    expect(await counts(token, tripId)).toEqual([2, 1]);
    // Readers don't learn how many others read along.
    expect(await counts(grandma, tripId)).toEqual([undefined, undefined]);
  });

  it("doesn't count authors, and only accepts the trip's own steps", async () => {
    const { token, tripId, steps, redeem } = await tripWithReader();
    await call("POST", "/api/v1/trips/{id}/views", {
      token,
      params: { id: tripId },
      body: { stepIds: steps },
    });
    expect(await counts(token, tripId)).toEqual([0, 0]);

    const other = await call("POST", "/api/v1/trips", { token, body: { title: "Iceland" } });
    const foreign = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: other.json.id },
      body: { body: "Reykjavík" },
    });
    const viewer = await redeem("Grandma");
    // Its own trip, but a step of another one: ignored.
    await call("POST", "/api/v1/trips/{id}/views", {
      token: viewer,
      params: { id: tripId },
      body: { stepIds: [foreign.json.id] },
    });
    // Another trip altogether: not readable for this device.
    const elsewhere = await call("POST", "/api/v1/trips/{id}/views", {
      token: viewer,
      params: { id: other.json.id },
      body: { stepIds: [foreign.json.id] },
    });
    expect(elsewhere.status).toBe(404);
    const { json } = await call("GET", "/api/v1/trips/{id}", { token, params: { id: other.json.id } });
    expect(json.steps[0].viewCount).toBe(0);

    const empty = await call("POST", "/api/v1/trips/{id}/views", {
      token: viewer,
      params: { id: tripId },
      body: { stepIds: [] },
    });
    expect(empty.status).toBe(400);
  });

  it("is announced in /info", async () => {
    const { json } = await call("GET", "/api/v1/info");
    expect(json.features).toContain("step-views");
  });
});

describe("client address", () => {
  it("trusts only the entries the reverse proxies added", async () => {
    const { clientAddress } = await import("@/lib/rate-limit");
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    // The client sent "6.6.6.6" itself; the one proxy appended the real one.
    expect(clientAddress(headers, 1)).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-forwarded-for": "198.51.100.1, 6.6.6.6, 10.0.0.2" }), 2)).toBe("6.6.6.6");
    expect(clientAddress(headers, 0)).toBe("unknown");
    expect(clientAddress(new Headers(), 1)).toBe("unknown");
  });

  it("refuses a weak APP_SECRET", async () => {
    const { appSecretProblem } = await import("@/lib/env");
    expect(appSecretProblem(undefined)).toBeNull();
    expect(appSecretProblem("")).toBeNull();
    expect(appSecretProblem("change-me")).toMatch(/openssl rand/);
    expect(appSecretProblem("a".repeat(40))).toMatch(/too weak/);
    expect(appSecretProblem("Qm9zc2ViYWxsLXRlc3Qtc2VjcmV0LTEyMzQ1Njc4OTA=")).toBeNull();
  });
});

describe("changes", () => {
  it("reports upserts and deletions after a cursor, per token scope", async () => {
    const token = await signIn();
    const start = await call("GET", "/api/v1/changes", { token });
    expect(start.json.changes).toEqual([]);
    const cursor = start.json.cursor;

    const shared = await call("POST", "/api/v1/trips", { token, body: { title: "Shared" } });
    await call("PATCH", "/api/v1/trips/{id}", { token, params: { id: shared.json.id }, body: { shareEnabled: true } });
    const secret = await call("POST", "/api/v1/trips", { token, body: { title: "Secret" } });
    const step = await call("POST", "/api/v1/trips/{id}/steps", {
      token,
      params: { id: shared.json.id },
      body: { body: "Hello" },
    });
    await call("DELETE", "/api/v1/steps/{id}", { token, params: { id: step.json.id } });

    const feed = await call("GET", "/api/v1/changes", { token, query: `?since=${cursor}` });
    const summary = feed.json.changes.map(
      (c: { entity: string; op: string; tripId: number }) => `${c.entity}:${c.op}:${c.tripId}`,
    );
    expect(summary).toContain(`step:upsert:${shared.json.id}`);
    expect(summary).toContain(`step:delete:${shared.json.id}`);
    expect(summary).toContain(`trip:upsert:${secret.json.id}`);

    const detail = await call("GET", "/api/v1/trips/{id}", { token, params: { id: shared.json.id } });
    const { json } = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: detail.json.share.url, name: "Grandma" },
    });
    const viewerFeed = await call("GET", "/api/v1/changes", { token: json.token, query: "?since=0" });
    expect(
      viewerFeed.json.changes.every((c: { tripId: number }) => c.tripId === shared.json.id),
    ).toBe(true);

    const next = await call("GET", "/api/v1/changes", { token, query: `?since=${feed.json.cursor}` });
    expect(next.json.changes).toEqual([]);
  });
});

describe("OIDC hand-over", () => {
  it("computes PKCE challenges like the app (RFC 7636, appendix B)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("trades a one-time code plus PKCE verifier for a device token, once", async () => {
    const user = await createUser({ email: "o@example.com", name: "O", password: "long enough pw" });
    const verifier = "v".repeat(43) + "erifier-for-the-test";
    const code = await createAuthCode({
      userId: user.id,
      codeChallenge: pkceChallenge(verifier),
      deviceName: "iPhone",
    });

    const wrong = await call("POST", "/api/v1/auth/oidc/exchange", {
      body: { code, codeVerifier: "x".repeat(43) },
    });
    expect(wrong.json.code).toBe("auth_code_invalid");

    // A failed attempt burns the code, so a new one is needed.
    const fresh = await createAuthCode({
      userId: user.id,
      codeChallenge: pkceChallenge(verifier),
      deviceName: "iPhone",
    });
    const ok = await call("POST", "/api/v1/auth/oidc/exchange", {
      body: { code: fresh, codeVerifier: verifier },
    });
    expect(ok.status).toBe(201);
    expect(ok.json.token).toMatch(/^osa_/);

    const reused = await call("POST", "/api/v1/auth/oidc/exchange", {
      body: { code: fresh, codeVerifier: verifier },
    });
    expect(reused.json.code).toBe("auth_code_invalid");
  });
});

describe("export", () => {
  it("gives authors the album and Immich status, and readers neither", async () => {
    const { token, trip } = await sharedTrip();
    const album = await call("GET", "/api/v1/trips/{id}/export", { token, params: { id: trip.id } });
    expect(album.status).toBe(200);
    expect(album.headers.get("content-type")).toBe("application/zip");

    const status = await call("GET", "/api/v1/trips/{id}/immich", { token, params: { id: trip.id } });
    expect(status.json).toMatchObject({ connected: false, state: "idle" });
    const start = await call("POST", "/api/v1/trips/{id}/immich", { token, params: { id: trip.id } });
    expect(start.json.code).toBe("immich_not_connected");

    const redeemed = await call("POST", "/api/v1/viewers/redeem", {
      body: { shareLink: trip.share.url, name: "Grandma" },
    });
    for (const route of ["/api/v1/trips/{id}/export", "/api/v1/trips/{id}/immich"]) {
      const denied = await call("GET", route, { token: redeemed.json.token, params: { id: trip.id } });
      expect(denied.json.code, route).toBe("author_only");
    }
  });
});

describe("Immich connection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lets authors connect, read and forget their Immich", async () => {
    const token = await signIn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init: RequestInit = {}) => {
        const ok = new Headers(init.headers).get("x-api-key") === "good-key";
        return String(input) === "https://photos.example.com/api/users/me" && ok
          ? Response.json({ name: "Mia" })
          : Response.json({}, { status: 401 });
      }),
    );

    const before = await call("GET", "/api/v1/me/immich", { token });
    expect(before.json).toMatchObject({ connected: false, url: null });

    const wrong = await call("PUT", "/api/v1/me/immich", {
      token,
      body: { url: "photos.example.com", apiKey: "bad" },
    });
    expect(wrong.json.code).toBe("immich_key_invalid");

    const connected = await call("PUT", "/api/v1/me/immich", {
      token,
      body: { url: "photos.example.com", apiKey: "good-key" },
    });
    expect(connected.json).toEqual({
      connected: true,
      url: "https://photos.example.com",
      name: "Mia",
      problem: null,
    });

    expect((await call("DELETE", "/api/v1/me/immich", { token })).status).toBe(204);
    expect((await call("GET", "/api/v1/me/immich", { token })).json.connected).toBe(false);
  });
});
