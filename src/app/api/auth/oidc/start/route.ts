import { cookies } from "next/headers";
import { redirectTo } from "@/lib/origin";
import {
  buildAuthorizationUrl,
  createPkcePair,
  OIDC_FLOW_COOKIE,
  oidcEnabled,
  randomState,
  redirectUriFor,
} from "@/lib/oidc";

export async function GET(request: Request) {
  if (!oidcEnabled) {
    return new Response("OIDC is not configured.", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  // Only allow same-site targets so the login can't be abused as a redirect
  // to foreign domains.
  const requestedNext = searchParams.get("next") ?? "/";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  const { verifier, challenge } = createPkcePair();
  const state = randomState();
  const nonce = randomState();

  const store = await cookies();
  store.set(OIDC_FLOW_COOKIE, JSON.stringify({ state, verifier, nonce, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  try {
    const url = await buildAuthorizationUrl({
      redirectUri: redirectUriFor(request),
      state,
      nonce,
      challenge,
    });
    return Response.redirect(url, 302);
  } catch (error) {
    console.error("[oidc] Start failed", error);
    return redirectTo("/login?error=oidc_unreachable");
  }
}
