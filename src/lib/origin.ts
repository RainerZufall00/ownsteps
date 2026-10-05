/**
 * Figures out this instance's public address.
 *
 * Behind a reverse proxy `request.url` is **not** usable: the server in the
 * container only knows its own binding and reports `http://0.0.0.0:2555` or
 * `http://127.0.0.1:2555` depending on the setup. A redirect built from that
 * sends the browser nowhere ("0.0.0.0 refused to connect"), and a callback
 * URL built from it gets an error from the OIDC provider. Even when the
 * address is right, behind a proxy it is `http://` – TLS ends there – and the
 * browser blocks it on an HTTPS page as mixed content.
 *
 * Order: `PUBLIC_URL` beats everything, then the proxy's forwarding headers,
 * and only last the request's own origin.
 */
export function originFromHeaders(
  headers: Headers,
  configured: string,
  fallback: string,
) {
  if (configured) return configured.replace(/\/$/, "");

  // With several proxies the values are comma-separated; the first one counts.
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const host =
    headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    headers.get("host");

  return host ? `${proto}://${host}` : fallback;
}

export function publicOrigin(request: Request, configured: string) {
  return originFromHeaders(
    request.headers,
    configured,
    new URL(request.url).origin,
  );
}

/**
 * A return target from the query string, reduced to a path on our own site.
 * Checking for a leading "/" isn't enough: browsers read `/\evil.com` as
 * `//evil.com`, and a login would end on a foreign page. Resolving against a
 * placeholder origin catches every such trick in one place.
 */
export function localPath(requested: string | null, fallback = "/") {
  if (!requested?.startsWith("/")) return fallback;
  const base = "http://ownsteps.invalid";
  try {
    const url = new URL(requested, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Redirect within our own site. The `Location` header deliberately stays
 * relative: the browser resolves it against the address it called itself –
 * the public one. That way the return after login no longer depends on any
 * setting. `Response.redirect()` doesn't work for this, it demands a full
 * address.
 */
export function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
