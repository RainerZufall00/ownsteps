import "server-only";

/**
 * Options for every cookie the server sets: not readable by scripts, sent on
 * top-level navigation (OIDC returns, shared links), HTTPS-only in production.
 */
export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
