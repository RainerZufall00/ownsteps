"use server";

import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/cookies";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * The manual language switch. Setting the cookie makes Next render the
 * current page again, so the new language shows without a reload.
 */
export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, cookieOptions(ONE_YEAR_S));
}
