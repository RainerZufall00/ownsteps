import "server-only";

import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { PUBLIC_URL } from "./env";
import { publicOrigin } from "./origin";

/** Kurzlebiges Cookie, das State, PKCE-Verifier und Ziel des Logins hält. */
export const OIDC_FLOW_COOKIE = "ownsteps_oidc";

/**
 * Muss exakt der in Pocket ID hinterlegten Callback-URL entsprechen. Ohne
 * PUBLIC_URL zieht `publicOrigin` die Weiterleitungs-Header des Proxys heran –
 * die nackte Anfrage-URL wäre im Container `http://0.0.0.0:2555`, und der
 * Anbieter lehnte den Rückweg als unbekannt ab.
 */
export function redirectUriFor(request: Request) {
  return `${publicOrigin(request, PUBLIC_URL)}/api/auth/oidc/callback`;
}

export const OIDC_ISSUER = process.env.OIDC_ISSUER?.trim().replace(/\/$/, "") ?? "";
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID?.trim() ?? "";
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET?.trim() ?? "";
export const OIDC_BUTTON_LABEL =
  process.env.OIDC_BUTTON_LABEL?.trim() || "Pocket ID";
const OIDC_SCOPES = process.env.OIDC_SCOPES?.trim() || "openid profile email";

/** Optionale Zusatzsperre: nur diese Adressen dürfen sich anmelden. */
const ALLOWED_EMAILS = (process.env.OIDC_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export const oidcEnabled = Boolean(
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET,
);

export function isEmailAllowed(email: string) {
  if (ALLOWED_EMAILS.length === 0) return true;
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
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

export async function discover(): Promise<Discovery> {
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
      `OIDC-Discovery fehlgeschlagen (${response.status}) – OIDC_ISSUER prüfen.`,
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

export function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function randomState() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function buildAuthorizationUrl(input: {
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

export type OidcClaims = {
  subject: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

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
      `Token-Austausch fehlgeschlagen (${response.status}): ${detail.slice(0, 200)}`,
    );
  }

  const tokens = (await response.json()) as {
    id_token?: string;
    access_token?: string;
  };
  if (!tokens.id_token) throw new Error("Antwort enthält kein id_token.");

  const { payload } = await jwtVerify(tokens.id_token, jwks(config.jwks_uri), {
    issuer: config.issuer,
    audience: OIDC_CLIENT_ID,
  });

  if (payload.nonce !== input.nonce) {
    throw new Error("Nonce stimmt nicht überein.");
  }

  let email = typeof payload.email === "string" ? payload.email : "";
  let name =
    typeof payload.name === "string"
      ? payload.name
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null;
  let picture = typeof payload.picture === "string" ? payload.picture : null;

  // Manche Provider liefern die Profildaten erst über userinfo.
  if ((!email || !name) && config.userinfo_endpoint && tokens.access_token) {
    try {
      const info = await fetch(config.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      });
      if (info.ok) {
        const profile = (await info.json()) as Record<string, unknown>;
        if (!email && typeof profile.email === "string") email = profile.email;
        if (!name && typeof profile.name === "string") name = profile.name;
        if (!picture && typeof profile.picture === "string") {
          picture = profile.picture;
        }
      }
    } catch {
      // Profildaten sind optional.
    }
  }

  if (!email) {
    throw new Error(
      "Der Anbieter hat keine E-Mail-Adresse geliefert – Scope „email“ freigeben.",
    );
  }

  return { subject: String(payload.sub), email, name, picture };
}
