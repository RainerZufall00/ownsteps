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
