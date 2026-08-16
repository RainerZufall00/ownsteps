import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/db";

/**
 * Signiergeheimnis für Share-Cookies. Kommt aus der Umgebung, sonst wird beim
 * ersten Start eines erzeugt und im Datenverzeichnis abgelegt – so muss beim
 * Deployment nichts von Hand gesetzt werden, bleibt aber über Neustarts stabil.
 */
function loadSecret(): string {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const secretFile = path.join(DATA_DIR, ".secret");
  try {
    const existing = fs.readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {
    // noch nicht vorhanden
  }
  const generated = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

const globalForEnv = globalThis as unknown as { __ownstepsSecret?: string };
export const APP_SECRET = globalForEnv.__ownstepsSecret ?? loadSecret();
globalForEnv.__ownstepsSecret = APP_SECRET;

export const MAPTILER_KEY = process.env.MAPTILER_KEY?.trim() ?? "";
export const MAP_STYLE =
  process.env.MAP_STYLE?.trim() || "streets-v2";
export const SITE_NAME = process.env.SITE_NAME?.trim() || "OwnSteps";
export const PUBLIC_URL = process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
