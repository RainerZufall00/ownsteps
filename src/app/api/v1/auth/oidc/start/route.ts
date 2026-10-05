import { problem } from "@/lib/api/http";
import { beginOidcFlow, oidcEnabled } from "@/lib/oidc";

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

  try {
    const url = await beginOidcFlow(request, {
      next: "/",
      app: { codeChallenge, state: appState, deviceName },
    });
    return Response.redirect(url, 302);
  } catch (error) {
    console.error("[oidc] App start failed", error);
    return problem("oidc_disabled", "The identity provider is unreachable.");
  }
}
