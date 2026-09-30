import { de } from "date-fns/locale";
import { differenceInCalendarDays, format } from "date-fns";

export function formatDate(ms: number) {
  return format(new Date(ms), "d. MMMM yyyy", { locale: de });
}

export function formatDateShort(ms: number) {
  return format(new Date(ms), "d. MMM yyyy", { locale: de });
}

export function formatWeekday(ms: number) {
  return format(new Date(ms), "EEEE, d. MMMM", { locale: de });
}

export function formatTime(ms: number) {
  return format(new Date(ms), "HH:mm", { locale: de });
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

export function formatRange(from: number | null, to: number | null) {
  if (!from) return "Noch keine Beiträge";
  if (!to || from === to) return formatDateShort(from);

  const start = new Date(from);
  const end = new Date(to);
  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, "d.", { locale: de })}–${format(end, "d. MMMM yyyy", { locale: de })}`;
    }
    return `${format(start, "d. MMM", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
  }
  return `${formatDateShort(from)} – ${formatDateShort(to)}`;
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
) {
  const from = fromDateInput(trip.startDate) ?? firstStepAt;
  const to = fromDateInput(trip.endDate) ?? lastStepAt;
  return formatRange(from, to);
}

export function formatDuration(from: number | null, to: number | null) {
  if (!from || !to) return null;
  const days = differenceInCalendarDays(new Date(to), new Date(from)) + 1;
  return days === 1 ? "1 Tag" : `${days} Tage`;
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

export function pluralize(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
