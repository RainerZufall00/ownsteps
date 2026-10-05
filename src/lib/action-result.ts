import "server-only";

import { ServiceError } from "./errors";
import { getLocale } from "./i18n/server";
import { messageFor } from "./messages";

/**
 * Turns a service error into the `{ error }` shape the forms display, in the
 * request's language. Anything that isn't a ServiceError is a bug and keeps
 * propagating.
 */
export async function failure(error: unknown): Promise<{ error: string }> {
  if (error instanceof ServiceError) {
    return { error: messageFor(await getLocale(), error.code, error.params) };
  }
  throw error;
}
