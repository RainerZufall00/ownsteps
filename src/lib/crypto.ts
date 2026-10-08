import "server-only";

import crypto from "node:crypto";

/**
 * The few cryptographic building blocks the app uses, in one place – so a
 * session token, a device token and a PKCE challenge can't drift apart in how
 * they're made or checked.
 */

/** `bytes` random bytes as base64url – unguessable tokens and secrets. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** The DB only stores a token's hash, never the token itself. */
export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** PKCE S256: base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** HMAC-SHA256 as base64url. */
export function hmac(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

/** Constant-time comparison of two secrets. */
export function safeEqual(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sealingKey(secret: string, purpose: string) {
  return crypto.createHash("sha256").update(`${purpose}:${secret}`).digest();
}

/**
 * A secret stored for later use (an API key of another service), encrypted
 * with AES-256-GCM under a key derived from the app secret – a copy of the
 * database alone doesn't reveal it.
 */
export function sealSecret(secret: string, purpose: string, plaintext: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sealingKey(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** The inverse of `sealSecret`; null if it was sealed under another secret or tampered with. */
export function openSecret(secret: string, purpose: string, sealed: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", sealingKey(secret, purpose), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

