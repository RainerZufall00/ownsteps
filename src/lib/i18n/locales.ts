/**
 * The UI languages and how a request picks one. Deliberately free of
 * `server-only`: the client needs the `Locale` type and the date formats.
 *
 * No locale in the URL: share links stay the same for everyone, and each
 * reader gets their own language – from the cookie of the manual switch,
 * otherwise from `Accept-Language`, otherwise English ([E15], D4).
 */

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Set by the language switch; read by every page, action and route handler. */
export const LOCALE_COOKIE = "ownsteps_locale";

/** The name of each language in itself, for the switch. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best supported language from an `Accept-Language` header
 * ("de-AT,de;q=0.9,en;q=0.8"). Only the primary subtag counts – there's one
 * German and one English. Entries are tried by descending quality, ties in
 * header order.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.language && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  return ranked.map((entry) => entry.language).find(isLocale) ?? DEFAULT_LOCALE;
}

/** The cookie wins; it's the reader's explicit choice. */
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return isLocale(cookieValue) ? cookieValue : negotiateLocale(acceptLanguage);
}
