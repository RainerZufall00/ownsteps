/**
 * Die öffentliche Adresse dieser Instanz herausfinden.
 *
 * Hinter einem Reverse Proxy ist `request.url` **nicht** brauchbar: Der Server
 * im Container kennt nur seine eigene Bindung und meldet je nach Aufbau
 * `http://0.0.0.0:2555` oder `http://127.0.0.1:2555`. Wer daraus eine
 * Weiterleitung baut, schickt den Browser ins Leere („0.0.0.0 refused to
 * connect"), und wer daraus eine Callback-URL baut, bekommt vom
 * OIDC-Anbieter eine Fehlermeldung. Selbst wenn die Adresse stimmt, ist sie
 * hinter einem Proxy `http://` – denn dort endet TLS –, und der Browser
 * blockiert das auf einer HTTPS-Seite als Mixed Content.
 *
 * Reihenfolge: `PUBLIC_URL` schlägt alles, danach die Weiterleitungs-Header
 * des Proxys, und erst zum Schluss die Herkunft der Anfrage selbst.
 */
export function originFromHeaders(
  headers: Headers,
  configured: string,
  fallback: string,
) {
  if (configured) return configured.replace(/\/$/, "");

  // Bei mehreren Proxys stehen die Werte kommagetrennt; der erste zählt.
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
 * Weiterleitung innerhalb der eigenen Seite. Der `Location`-Header bleibt
 * bewusst relativ: Den löst der Browser gegen die Adresse auf, die er selbst
 * aufgerufen hat – die öffentliche also. Damit hängt der Rücksprung nach dem
 * Login an keiner Einstellung mehr. `Response.redirect()` geht dafür nicht,
 * es verlangt eine vollständige Adresse.
 */
export function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}
