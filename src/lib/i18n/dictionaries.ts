import { de } from "./de";
import { en, type Dictionary } from "./en";
import type { Locale } from "./locales";

/**
 * All dictionaries. Server-side only in practice: the client gets just the
 * active one through `I18nProvider`, so it never loads both.
 */
export const DICTIONARIES: Record<Locale, Dictionary> = { en, de };

export type { Dictionary };
