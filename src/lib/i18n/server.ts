import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DICTIONARIES } from "./dictionaries";
import { LOCALE_COOKIE, resolveLocale } from "./locales";

/**
 * The request's language: the switch's cookie, otherwise `Accept-Language`.
 * Works in pages, layouts, Server Actions and route handlers alike.
 */
export const getLocale = cache(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language"),
  );
});

/** Locale plus its dictionary – `t.trips.heading` and so on. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
