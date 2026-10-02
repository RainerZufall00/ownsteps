import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { cookieStore, resetCookies } from "./helpers/cookie-jar";

// A fresh data directory per test file, set before `@/db` is first imported.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ownsteps-test-"));

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

beforeEach(async () => {
  resetCookies();
  const { resetDatabase } = await import("./helpers/db");
  resetDatabase();
  const { resetRateLimits } = await import("@/lib/rate-limit");
  resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});
