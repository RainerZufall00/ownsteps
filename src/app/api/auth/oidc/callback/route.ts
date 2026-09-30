import { cookies } from "next/headers";
import { createSession, upsertOidcUser } from "@/lib/auth";
import { redirectTo } from "@/lib/origin";
import {
  exchangeCode,
  isEmailAllowed,
  OIDC_FLOW_COOKIE,
  oidcEnabled,
  redirectUriFor,
} from "@/lib/oidc";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fail = (reason: string) => redirectTo(`/login?error=${reason}`);

  if (!oidcEnabled) return fail("oidc_disabled");

  const store = await cookies();
  const raw = store.get(OIDC_FLOW_COOKIE)?.value;
  store.delete(OIDC_FLOW_COOKIE);
  if (!raw) return fail("oidc_expired");

  let flow: { state: string; verifier: string; nonce: string; next: string };
  try {
    flow = JSON.parse(raw);
  } catch {
    return fail("oidc_expired");
  }

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
    await createSession(user.id);
    return redirectTo(flow.next);
  } catch (error) {
    console.error("[oidc] Callback failed", error);
    return fail("oidc_failed");
  }
}
