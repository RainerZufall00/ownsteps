import { createSession, findUserByOidcSubject, upsertOidcUser } from "@/lib/auth";
import { redirectTo } from "@/lib/origin";
import {
  appCallbackUrl,
  exchangeCode,
  isEmailAllowed,
  isEmailTrusted,
  oidcEnabled,
  redirectUriFor,
  takeOidcFlow,
} from "@/lib/oidc";
import { createAuthCode } from "@/lib/tokens";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const flow = await takeOidcFlow();

  // The app waits for its URL scheme, the browser for a page.
  const fail = (reason: string) => {
    if (flow?.app) return redirectTo(appCallbackUrl(flow.app, { error: reason }));
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

    if (!isEmailAllowed(claims)) {
      console.warn("[oidc] Sign-in rejected for", claims.email);
      return fail("oidc_not_allowed");
    }

    // A new identity is matched and created by its address – only if the
    // provider vouches for it. Known identities sign in by `sub` as before.
    const emailTrusted = isEmailTrusted(claims);
    if (!emailTrusted && !(await findUserByOidcSubject(claims.subject))) {
      console.warn("[oidc] Unverified email, sign-in refused for", claims.email);
      return fail("oidc_unverified");
    }

    const user = await upsertOidcUser({ ...claims, emailTrusted });

    if (flow.app) {
      const appCode = await createAuthCode({
        userId: user.id,
        codeChallenge: flow.app.codeChallenge,
        deviceName: flow.app.deviceName,
      });
      return redirectTo(appCallbackUrl(flow.app, { code: appCode }));
    }

    await createSession(user.id);
    return redirectTo(flow.next);
  } catch (error) {
    console.error("[oidc] Callback failed", error);
    return fail("oidc_failed");
  }
}
