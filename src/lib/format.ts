import { de, enUS, type Locale as DateLocale } from "date-fns/locale";
import { differenceInCalendarDays, format } from "date-fns";
import type { Locale } from "./i18n/locales";

/**
 * Date patterns per UI language. English the US way ("July 1, 2026"),
 * German with day first ("1. Juli 2026").
 */
const PATTERNS: Record<
  Locale,
  {
    dateLocale: DateLocale;
    short: string;
    weekday: string;
    /** Same month: "July 1–20, 2026" / "1.–20. Juli 2026". */
    sameMonth: [string, string];
    /** Same year: "Jul 1 – Aug 3, 2026" / "1. Jul – 3. Aug 2026". */
    sameYear: [string, string];
  }
> = {
  en: {
    dateLocale: enUS,
    short: "MMM d, yyyy",
    weekday: "EEEE, MMMM d",
    sameMonth: ["MMMM d", "d, yyyy"],
    sameYear: ["MMM d", "MMM d, yyyy"],
  },
  de: {
    dateLocale: de,
    short: "d. MMM yyyy",
    weekday: "EEEE, d. MMMM",
    sameMonth: ["d.", "d. MMMM yyyy"],
    sameYear: ["d. MMM", "d. MMM yyyy"],
  },
};

function formatIn(locale: Locale, date: Date, pattern: string) {
  return format(date, pattern, { locale: PATTERNS[locale].dateLocale });
}

export function formatDateShort(ms: number, locale: Locale) {
  return formatIn(locale, new Date(ms), PATTERNS[locale].short);
}

export function formatWeekday(ms: number, locale: Locale) {
  return formatIn(locale, new Date(ms), PATTERNS[locale].weekday);
}

/** Value for <input type="date"> in local time. */
export function toDateInput(ms: number) {
  return format(new Date(ms), "yyyy-MM-dd");
}

/**
 * Inverse of `toDateInput`: "2026-07-01" becomes the start of that day in the
 * server's time zone. Deliberately not via `new Date(iso)` – that parses the
 * string as UTC and shifts the date by a day depending on the time zone.
 */
export function fromDateInput(iso: string | null): number | null {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
}

/**
 * Sets a new date and keeps the original's time of day. The time isn't shown
 * anywhere, but it determines the order of several steps on the same day –
 * it comes from the EXIF data and must not get lost.
 */
export function withDate(originalMs: number, isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return originalMs;
  const date = new Date(originalMs);
  date.setFullYear(year, month - 1, day);
  return date.getTime();
}

/** Trip day like on Polarsteps: the first step is day 1. */
export function tripDay(startMs: number, stepMs: number) {
  return differenceInCalendarDays(new Date(stepMs), new Date(startMs)) + 1;
}

/** `null` when there's nothing to show yet – the caller says so in words. */
export function formatRange(from: number | null, to: number | null, locale: Locale) {
  if (!from) return null;
  if (!to || from === to) return formatDateShort(from, locale);

  const start = new Date(from);
  const end = new Date(to);
  const patterns = PATTERNS[locale];
  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth()) {
      const [a, b] = patterns.sameMonth;
      return `${formatIn(locale, start, a)}–${formatIn(locale, end, b)}`;
    }
    const [a, b] = patterns.sameYear;
    return `${formatIn(locale, start, a)} – ${formatIn(locale, end, b)}`;
  }
  return `${formatDateShort(from, locale)} – ${formatDateShort(to, locale)}`;
}

/**
 * A trip's date range for the header. A date set by hand takes precedence over
 * the steps: it describes the trip, while the steps only show how far writing
 * has got. Whoever enters "July 1–20" shouldn't read "July 1–3" just because
 * the rest is still missing.
 */
export function formatTripRange(
  trip: { startDate: string | null; endDate: string | null },
  firstStepAt: number | null,
  lastStepAt: number | null,
  locale: Locale,
) {
  const from = fromDateInput(trip.startDate) ?? firstStepAt;
  const to = fromDateInput(trip.endDate) ?? lastStepAt;
  return formatRange(from, to, locale);
}

/** A video's length as m:ss – over an hour as h:mm:ss. */
export function formatMediaDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
