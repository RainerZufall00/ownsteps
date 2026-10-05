import "server-only";

import type { User } from "@/db/schema";
import { requireUser } from "./auth";
import { ServiceError } from "./errors";
import { getLocale } from "./i18n/server";
import type { Locale } from "./i18n/locales";
import { messageFor } from "./messages";

/**
 * Runs a route handler the web UI calls with `fetch` (uploads, place search)
 * for a signed-in user. Service errors become `{ error }` in the request's
 * language, like the forms show them; anything else is a bug and propagates.
 * `/api/v1` has its own plumbing (`api/http.ts`).
 */
export async function handleWeb(
  fn: (context: { user: User; locale: Locale }) => Promise<Response>,
): Promise<Response> {
  const locale = await getLocale();
  try {
    return await fn({ user: await requireUser(), locale });
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return Response.json(
      { error: messageFor(locale, error.code, error.params) },
      { status: error.status },
    );
  }
}
