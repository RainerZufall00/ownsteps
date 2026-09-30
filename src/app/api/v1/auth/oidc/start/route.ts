import { cookies } from "next/headers";
import { problem } from "@/lib/api/http";
import {
  buildAuthorizationUrl,
  createPkcePair,
  OIDC_FLOW_COOKIE,
  oidcEnabled,
  randomState,
  redirectUriFor,
} from "@/lib/oidc";

/**
 * Starts OIDC sign-in for the app ([D14]). The app opens this URL in an
 * `ASWebAuthenticationSession`; the server runs its usual OIDC flow and at
 * the end hands a one-time code to `ownsteps://auth`, which the app trades
 * for a device token at `/api/v1/auth/oidc/exchange`.
 *
 * The app sends its own PKCE challenge: another app registering the same
 * URL scheme could catch the code, but can't redeem it without the verifier.
 */
export async function GET(request: Request) {
  if (!oidcEnabled) return problem("oidc_disabled");

  const { searchParams } = new URL(request.url);
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const appState = searchParams.get("state") ?? "";
  const deviceName = (searchParams.get("device_name") ?? "").trim().slice(0, 100) || "App";
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || appState.length > 200) {
    return problem("invalid_request");
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomState();
  const nonce = randomState();

  const store = await cookies();
  store.set(
    OIDC_FLOW_COOKIE,
    JSON.stringify({
      state,
      verifier,
      nonce,
      next: "/",
      app: { codeChallenge, state: appState, deviceName },
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );

  try {
    const url = await buildAuthorizationUrl({
      redirectUri: redirectUriFor(request),
      state,
      nonce,
      challenge,
    });
    return Response.redirect(url, 302);
  } catch (error) {
    console.error("[oidc] App start failed", error);
    return problem("oidc_disabled", "The identity provider is unreachable.");
  }
}
