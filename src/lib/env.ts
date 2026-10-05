import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/db";
import { randomToken } from "./crypto";

/** What `openssl rand -base64 32` produces is 44 characters. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Why the configured `APP_SECRET` can't be used, or null if it's fine or
 * unset. Checked at startup (instrumentation.ts), which refuses to run
 * with a weak one rather than quietly falling back to another secret.
 */
export function appSecretProblem(value = process.env.APP_SECRET): string | null {
  const secret = value?.trim();
  if (!secret) return null;
  if (secret.length < MIN_SECRET_LENGTH || new Set(secret).size < 8) {
    return (
      `APP_SECRET is too weak (at least ${MIN_SECRET_LENGTH} random characters). ` +
      "Generate one with: openssl rand -base64 32 – or leave it empty to have one generated."
    );
  }
  return null;
}

/** Startup check: a configured but weak secret stops the server. */
export function exitOnWeakAppSecret() {
  const problem = appSecretProblem();
  if (!problem) return;
  console.error(`[start] ${problem}`);
  process.exit(1);
}

/**
 * Signing secret for share cookies. Comes from the environment; otherwise one
 * is generated on first start and stored in the data directory – so nothing
 * has to be set by hand when deploying, yet it stays stable across restarts.
 */
function loadSecret(): string {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    const problem = appSecretProblem(fromEnv);
    if (problem) throw new Error(problem);
    return fromEnv;
  }

  const secretFile = path.join(DATA_DIR, ".secret");
  try {
    const existing = fs.readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {
    // doesn't exist yet
  }
  const generated = randomToken();
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

const globalForEnv = globalThis as unknown as { __ownstepsSecret?: string };
/**
 * Loaded on first use, not on import: the startup check must be able to
 * import this module and stop the server cleanly with a weak secret.
 */
export function appSecret() {
  globalForEnv.__ownstepsSecret ??= loadSecret();
  return globalForEnv.__ownstepsSecret;
}

export const MAPTILER_KEY = process.env.MAPTILER_KEY?.trim() ?? "";
// Satellite imagery with subtle labels – photos and route stand out better on
// it than on a street map.
export const MAP_STYLE = process.env.MAP_STYLE?.trim() || "hybrid";
export const SITE_NAME = process.env.SITE_NAME?.trim() || "OwnSteps";
export const PUBLIC_URL = process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
/**
 * `PASSWORD_LOGIN=false` switches password sign-in off everywhere (web and
 * app), for instances that only use OIDC. Initial setup is unaffected.
 */
export const PASSWORD_LOGIN =
  process.env.PASSWORD_LOGIN?.trim().toLowerCase() !== "false";
/** Numeric App Store ID of the iOS app; enables the Smart App Banner. */
export const APP_STORE_ID = process.env.APP_STORE_ID?.trim() ?? "";
