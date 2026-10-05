import { localPath, redirectTo } from "@/lib/origin";
import { beginOidcFlow, oidcEnabled } from "@/lib/oidc";

export async function GET(request: Request) {
  if (!oidcEnabled) {
    return new Response("OIDC is not configured.", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  // Only allow same-site targets so the login can't be abused as a redirect
  // to foreign domains.
  const next = localPath(searchParams.get("next"));

  try {
    return Response.redirect(await beginOidcFlow(request, { next }), 302);
  } catch (error) {
    console.error("[oidc] Start failed", error);
    return redirectTo("/login?error=oidc_unreachable");
  }
}
