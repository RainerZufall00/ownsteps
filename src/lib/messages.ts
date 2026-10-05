import type { ErrorCode } from "./errors";
import { DICTIONARIES } from "./i18n/dictionaries";
import type { Locale } from "./i18n/locales";
import { fill } from "./i18n/text";

/** User-facing text for an error code, in the given UI language. */
export function messageFor(
  locale: Locale,
  code: ErrorCode,
  params: Record<string, string> = {},
) {
  return fill(DICTIONARIES[locale].errors[code], params);
}
