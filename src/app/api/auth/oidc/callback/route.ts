import { cookies } from "next/headers";
import { createSession, upsertOidcUser } from "@/lib/auth";
import {
  exchangeCode,
  isEmailAllowed,
  OIDC_FLOW_COOKIE,
  oidcEnabled,
  redirectUriFor,
} from "@/lib/oidc";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const fail = (reason: string) =>
    Response.redirect(`${origin}/login?error=${reason}`, 302);

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
    console.warn("[oidc] Anbieter meldet", searchParams.get("error"));
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
      console.warn("[oidc] Anmeldung abgelehnt für", claims.email);
      return fail("oidc_not_allowed");
    }

    const user = await upsertOidcUser(claims);
    await createSession(user.id);
    return Response.redirect(`${origin}${flow.next}`, 302);
  } catch (error) {
    console.error("[oidc] Callback fehlgeschlagen", error);
    return fail("oidc_failed");
  }
}
