import fs from "node:fs";
import path from "node:path";
import { PASSWORD_MIN_LENGTH } from "./limits";
import { openFreeMapStyle } from "./map-sources";

/**
 * Checks the configuration once at startup (instrumentation.ts). Errors stop
 * the server with a message that names the variable – a typo like
 * `PASSWORD_LOGIN=flase` used to mean "true" without a word, and a half
 * OIDC setup only showed up as a broken button. Warnings are printed and
 * the server starts anyway.
 *
 * Takes the environment as a parameter, so tests can feed it anything.
 */

type Env = Record<string, string | undefined>;

/** What `openssl rand -base64 32` produces is 44 characters. */
const MIN_SECRET_LENGTH = 32;

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


const TRUE = new Set(["true", "1", "yes"]);
const FALSE = new Set(["false", "0", "no"]);

/** A yes/no switch from the environment; unset or unreadable means `fallback`. */
export function envFlag(raw: string | undefined, fallback: boolean) {
  const value = raw?.trim().toLowerCase() ?? "";
  if (TRUE.has(value)) return true;
  if (FALSE.has(value)) return false;
  return fallback;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function value(env: Env, key: string) {
  return env[key]?.trim() ?? "";
}

function isHttpUrl(text: string) {
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isLocal(text: string) {
  try {
    const host = new URL(text).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function configProblems(env: Env, options: { dataDir?: string } = {}) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const secret = appSecretProblem(env.APP_SECRET);
  if (secret) errors.push(secret);

  // Public address
  const publicUrl = value(env, "PUBLIC_URL");
  if (publicUrl) {
    if (!isHttpUrl(publicUrl)) {
      errors.push(`PUBLIC_URL="${publicUrl}" isn't a web address – write it like https://trips.example.com.`);
    } else {
      const url = new URL(publicUrl);
      if (url.pathname !== "/" && url.pathname !== "") {
        errors.push(
          `PUBLIC_URL="${publicUrl}" has a path. OwnSteps must run at the root of its address (https://trips.example.com, not …/ownsteps).`,
        );
      }
      if (url.hostname.endsWith("example.com")) {
        warnings.push(`PUBLIC_URL is still the example (${publicUrl}) – share links will point there.`);
      }
      if (url.protocol === "http:" && !isLocal(publicUrl)) {
        warnings.push(`PUBLIC_URL uses http. Sign-in cookies and the app need https outside your own network.`);
      }
    }
  } else if (env.NODE_ENV === "production") {
    warnings.push(
      "PUBLIC_URL isn't set – share links and the OIDC callback then take the address from each request, which a reverse proxy may not pass on correctly.",
    );
  }

  // Yes/no switches
  for (const key of ["PASSWORD_LOGIN", "KEEP_ORIGINALS", "OIDC_TRUST_EMAIL"]) {
    const raw = value(env, key).toLowerCase();
    if (raw && !TRUE.has(raw) && !FALSE.has(raw)) errors.push(`${key}="${env[key]}" – use true or false.`);
  }

  const proxies = value(env, "TRUSTED_PROXIES");
  if (proxies && !/^\d+$/.test(proxies)) {
    errors.push(`TRUSTED_PROXIES="${proxies}" – use the number of reverse proxies in front of OwnSteps (usually 1, 0 without one).`);
  }

  const appStoreId = value(env, "APP_STORE_ID");
  if (appStoreId && !/^\d+$/.test(appStoreId)) {
    errors.push(`APP_STORE_ID="${appStoreId}" – the App Store ID is a number, like 6741234567.`);
  }

  const geocoding = value(env, "GEOCODING").toLowerCase();
  if (geocoding && geocoding !== "on" && geocoding !== "off") {
    errors.push(`GEOCODING="${env.GEOCODING}" – use on or off.`);
  }

  // OIDC: all three or none. The template ships an example issuer, so an
  // issuer alone is no setup yet.
  const issuer = value(env, "OIDC_ISSUER");
  const clientId = value(env, "OIDC_CLIENT_ID");
  const clientSecret = value(env, "OIDC_CLIENT_SECRET");
  const oidc = Boolean(clientId || clientSecret);
  if (oidc) {
    const missing = [
      !issuer && "OIDC_ISSUER",
      !clientId && "OIDC_CLIENT_ID",
      !clientSecret && "OIDC_CLIENT_SECRET",
    ].filter(Boolean);
    if (missing.length) {
      errors.push(`OIDC is half set up – ${missing.join(" and ")} missing. Set all three, or none.`);
    } else if (!isHttpUrl(issuer)) {
      errors.push(`OIDC_ISSUER="${issuer}" isn't a web address.`);
    } else if (new URL(issuer).hostname.endsWith("example.com")) {
      errors.push(`OIDC_ISSUER is still the example (${issuer}) – set your provider's address.`);
    }
  }
  for (const email of value(env, "OIDC_ALLOWED_EMAILS").split(",").map((e) => e.trim()).filter(Boolean)) {
    if (!EMAIL_RE.test(email)) warnings.push(`OIDC_ALLOWED_EMAILS contains "${email}", which isn't an email address.`);
  }

  if (!envFlag(env.PASSWORD_LOGIN, true) && !oidc) {
    errors.push("PASSWORD_LOGIN=false switches password sign-in off, but OIDC isn't set up – nobody could sign in.");
  }

  // First account
  const adminEmail = value(env, "ADMIN_EMAIL");
  const adminPassword = env.ADMIN_PASSWORD ?? "";
  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminPassword) {
      errors.push("ADMIN_EMAIL and ADMIN_PASSWORD go together – set both, or neither.");
    } else {
      if (!EMAIL_RE.test(adminEmail)) errors.push(`ADMIN_EMAIL="${adminEmail}" isn't an email address.`);
      if (adminPassword.length < PASSWORD_MIN_LENGTH) {
        errors.push(`ADMIN_PASSWORD is too short – at least ${PASSWORD_MIN_LENGTH} characters.`);
      }
    }
  }

  // Map
  const mapStyle = value(env, "MAP_STYLE");
  if (!value(env, "MAPTILER_KEY") && mapStyle && openFreeMapStyle(mapStyle) !== mapStyle && mapStyle !== "hybrid") {
    warnings.push(
      `MAP_STYLE=${mapStyle} needs a MapTiler key. Without one the map comes from OpenFreeMap (styles liberty, bright, positron); using ${openFreeMapStyle(mapStyle)}.`,
    );
  }

  // Data directory
  const dataDir = options.dataDir ?? path.resolve(/* turbopackIgnore: true */ env.DATA_DIR ?? "./data");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch {
    errors.push(`The data directory ${dataDir} isn't writable – photos and the database live there. Check the volume and its owner.`);
  }

  return { errors, warnings };
}

/** Startup: print what's wrong, and stop on errors. */
export function checkConfigOrExit(env: Env = process.env) {
  const { errors, warnings } = configProblems(env);
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  if (errors.length === 0) return;
  for (const error of errors) console.error(`[config] ${error}`);
  console.error(`[config] OwnSteps can't start like this – fix the ${errors.length === 1 ? "setting" : "settings"} above in .env.`);
  process.exit(1);
}
