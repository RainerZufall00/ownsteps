import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cookieOptions } from "./cookies";
import { pkceChallenge, randomToken } from "./crypto";
import { PUBLIC_URL } from "./env";
import { publicOrigin } from "./origin";
import { envFlag } from "./config-check";

/** Short-lived cookie holding state, PKCE verifier and the login target. */
const OIDC_FLOW_COOKIE = "ownsteps_oidc";
const OIDC_FLOW_TTL_S = 600;

/** Where the app waits for the end of its OIDC sign-in (custom URL scheme). */
const APP_CALLBACK_URL = "ownsteps://auth";

/**
 * Must match the callback URL registered with the provider (e.g. Pocket ID)
 * exactly. Without PUBLIC_URL, `publicOrigin` falls back to the proxy's
 * forwarding headers – the bare request URL would be `http://0.0.0.0:2555`
 * inside the container, and the provider would reject the return as unknown.
 */
export function redirectUriFor(request: Request) {
  return `${publicOrigin(request, PUBLIC_URL)}/api/auth/oidc/callback`;
}

const OIDC_ISSUER = process.env.OIDC_ISSUER?.trim().replace(/\/$/, "") ?? "";
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID?.trim() ?? "";
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET?.trim() ?? "";
export const OIDC_BUTTON_LABEL =
  process.env.OIDC_BUTTON_LABEL?.trim() || "Pocket ID";
const OIDC_SCOPES = process.env.OIDC_SCOPES?.trim() || "openid profile email";

/** Optional extra restriction: only these addresses may sign in. */
const ALLOWED_EMAILS = (process.env.OIDC_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export const oidcEnabled = Boolean(
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET,
);

/**
 * `OIDC_TRUST_EMAIL=true` accepts addresses the provider doesn't mark as
 * verified – only for providers that never send `email_verified` although
 * every address on them is checked.
 */
const TRUST_UNVERIFIED_EMAIL = envFlag(process.env.OIDC_TRUST_EMAIL, false);

/**
 * Whether the address may be used to find or create an account. An
 * unverified one could be anybody's: registered at the provider with your
 * address, it would otherwise land in your account.
 */
export function isEmailTrusted(claims: OidcClaims) {
  return claims.emailVerified || TRUST_UNVERIFIED_EMAIL;
}

/** The allow list only counts addresses the provider has verified. */
export function isEmailAllowed(claims: OidcClaims) {
  if (ALLOWED_EMAILS.length === 0) return true;
  return isEmailTrusted(claims) && ALLOWED_EMAILS.includes(claims.email.trim().toLowerCase());
}

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
};

const globalForOidc = globalThis as unknown as {
  __oidcDiscovery?: { value: Discovery; fetchedAt: number };
  __oidcJwks?: ReturnType<typeof createRemoteJWKSet>;
};

const DISCOVERY_TTL_MS = 1000 * 60 * 60;

async function discover(): Promise<Discovery> {
  const cached = globalForOidc.__oidcDiscovery;
  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_TTL_MS) {
    return cached.value;
  }

  const response = await fetch(
    `${OIDC_ISSUER}/.well-known/openid-configuration`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed (${response.status}) – check OIDC_ISSUER.`,
    );
  }
  const value = (await response.json()) as Discovery;
  globalForOidc.__oidcDiscovery = { value, fetchedAt: Date.now() };
  return value;
}

function jwks(jwksUri: string) {
  globalForOidc.__oidcJwks ??= createRemoteJWKSet(new URL(jwksUri));
  return globalForOidc.__oidcJwks;
}

async function buildAuthorizationUrl(input: {
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}) {
  const config = await discover();
  const url = new URL(config.authorization_endpoint);
  url.searchParams.set("client_id", OIDC_CLIENT_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OIDC_SCOPES);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** What the flow cookie carries from the start of a sign-in to its return. */
type OidcFlow = {
  state: string;
  verifier: string;
  nonce: string;
  /** Where the browser goes after signing in. */
  next: string;
  /** Set when the sign-in was started by the app (`/api/v1/auth/oidc/start`). */
  app?: { codeChallenge: string; state: string; deviceName: string };
};

/**
 * Starts a sign-in at the provider – for the web login and the app alike.
 * State, nonce and PKCE verifier wait in a short-lived cookie for the
 * callback; returns the provider's address to redirect to.
 */
export async function beginOidcFlow(
  request: Request,
  target: Pick<OidcFlow, "next" | "app">,
): Promise<string> {
  const flow: OidcFlow = {
    state: randomToken(24),
    verifier: randomToken(48),
    nonce: randomToken(24),
    ...target,
  };
  (await cookies()).set(OIDC_FLOW_COOKIE, JSON.stringify(flow), cookieOptions(OIDC_FLOW_TTL_S));
  return buildAuthorizationUrl({
    redirectUri: redirectUriFor(request),
    state: flow.state,
    nonce: flow.nonce,
    challenge: pkceChallenge(flow.verifier),
  });
}

/** Reads and clears the flow cookie – it's good for exactly one return. */
export async function takeOidcFlow(): Promise<OidcFlow | null> {
  const store = await cookies();
  const raw = store.get(OIDC_FLOW_COOKIE)?.value;
  store.delete(OIDC_FLOW_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OidcFlow;
  } catch {
    return null;
  }
}

/** The app's return address (`ownsteps://auth`) with `params` and its state. */
export function appCallbackUrl(
  app: NonNullable<OidcFlow["app"]>,
  params: Record<string, string>,
) {
  const url = new URL(APP_CALLBACK_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("state", app.state);
  return url.toString();
}

type OidcClaims = {
  subject: string;
  email: string;
  /** The provider confirmed the address belongs to the user. */
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
};

/** Some providers send `"true"` as a string. */
function isTrue(value: unknown) {
  return value === true || value === "true";
}

export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  verifier: string;
  nonce: string;
}): Promise<OidcClaims> {
  const config = await discover();

  const response = await fetch(config.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: OIDC_CLIENT_ID,
      client_secret: OIDC_CLIENT_SECRET,
      code_verifier: input.verifier,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Token exchange failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }

  const tokens = (await response.json()) as {
    id_token?: string;
    access_token?: string;
  };
  if (!tokens.id_token) throw new Error("Response contains no id_token.");

  const { payload } = await jwtVerify(tokens.id_token, jwks(config.jwks_uri), {
    issuer: config.issuer,
    audience: OIDC_CLIENT_ID,
  });

  if (payload.nonce !== input.nonce) {
    throw new Error("Nonce mismatch.");
  }

  let email = typeof payload.email === "string" ? payload.email : "";
  let name =
    typeof payload.name === "string"
      ? payload.name
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null;
  let picture = typeof payload.picture === "string" ? payload.picture : null;
  let emailVerified = isTrue(payload.email_verified);

  // Some providers only deliver profile data via userinfo.
  if ((!email || !name) && config.userinfo_endpoint && tokens.access_token) {
    try {
      const info = await fetch(config.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      });
      if (info.ok) {
        const profile = (await info.json()) as Record<string, unknown>;
        if (!email && typeof profile.email === "string") {
          email = profile.email;
          emailVerified = isTrue(profile.email_verified);
        }
        if (!name && typeof profile.name === "string") name = profile.name;
        if (!picture && typeof profile.picture === "string") {
          picture = profile.picture;
        }
      }
    } catch {
      // Profile data is optional.
    }
  }

  if (!email) {
    throw new Error(
      "The provider returned no email address – grant the \"email\" scope.",
    );
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("The ID token carries no subject.");
  }
  return { subject: payload.sub, email, emailVerified, name, picture };
}
