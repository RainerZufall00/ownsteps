import { setLocaleAction } from "@/app/locale-actions";
import { getI18n } from "@/lib/i18n/server";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/locales";

/**
 * English / German toggle. A plain form, so it works before any JavaScript
 * has loaded – the choice lands in a cookie and beats `Accept-Language`.
 */
export default async function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, t } = await getI18n();

  return (
    <form
      action={setLocaleAction}
      aria-label={t.common.language}
      className={`inline-flex rounded-full border border-line bg-surface p-0.5 text-[13px] ${className}`}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="submit"
          name="locale"
          value={option}
          lang={option}
          aria-pressed={option === locale}
          className={`rounded-full px-3 py-1 font-semibold transition ${
            option === locale
              ? "bg-accent text-accent-ink"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {LOCALE_NAMES[option]}
        </button>
      ))}
    </form>
  );
}
