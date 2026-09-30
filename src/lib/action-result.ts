import "server-only";

import { ServiceError } from "./errors";
import { messageFor } from "./messages";

/**
 * Turns a service error into the `{ error }` shape the forms display.
 * Anything that isn't a ServiceError is a bug and keeps propagating.
 */
export function failure(error: unknown): { error: string } {
  if (error instanceof ServiceError) {
    return { error: messageFor(error.code, error.params) };
  }
  throw error;
}
