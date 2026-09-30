import { cookies } from "next/headers";
import { createSession, upsertOidcUser } from "@/lib/auth";
import { redirectTo } from "@/lib/origin";
import {
  APP_CALLBACK_URL,
  exchangeCode,
  isEmailAllowed,
  OIDC_FLOW_COOKIE,
  oidcEnabled,
  redirectUriFor,
} from "@/lib/oidc";
import { createAuthCode } from "@/lib/tokens";

type Flow = {
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  /** Set when the sign-in was started by the app (`/api/v1/auth/oidc/start`). */
  app?: { codeChallenge: string; state: string; deviceName: string };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const store = await cookies();
  const raw = store.get(OIDC_FLOW_COOKIE)?.value;
  store.delete(OIDC_FLOW_COOKIE);

  let flow: Flow | null = null;
  try {
    flow = raw ? JSON.parse(raw) : null;
  } catch {
    flow = null;
  }

  // The app waits for its URL scheme, the browser for a page.
  const fail = (reason: string) => {
    if (flow?.app) {
      const url = new URL(APP_CALLBACK_URL);
      url.searchParams.set("error", reason);
      url.searchParams.set("state", flow.app.state);
      return redirectTo(url.toString());
    }
    return redirectTo(`/login?error=${reason}`);
  };

  if (!oidcEnabled) return fail("oidc_disabled");
  if (!flow) return fail("oidc_expired");

  if (searchParams.get("error")) {
    console.warn("[oidc] Provider reports", searchParams.get("error"));
    return fail("oidc_denied");
  }

  const code = searchParams.get("code");
  if (!code || searchParams.get("state") !== flow.state) {
    return fail("oidc_state");
  }

  try {
    const claims = await exchangeCode({
      code,
      redirectUri: redirectUriFor(request),
      verifier: flow.verifier,
      nonce: flow.nonce,
    });

    if (!isEmailAllowed(claims.email)) {
      console.warn("[oidc] Sign-in rejected for", claims.email);
      return fail("oidc_not_allowed");
    }

    const user = await upsertOidcUser(claims);

    if (flow.app) {
      const appCode = await createAuthCode({
        userId: user.id,
        codeChallenge: flow.app.codeChallenge,
        deviceName: flow.app.deviceName,
      });
      const url = new URL(APP_CALLBACK_URL);
      url.searchParams.set("code", appCode);
      url.searchParams.set("state", flow.app.state);
      return redirectTo(url.toString());
    }

    await createSession(user.id);
    return redirectTo(flow.next);
  } catch (error) {
    console.error("[oidc] Callback failed", error);
    return fail("oidc_failed");
  }
}
