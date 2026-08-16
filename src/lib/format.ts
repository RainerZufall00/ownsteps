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

/** Wert für <input type="date"> in lokaler Zeit. */
export function toDateInput(ms: number) {
  return format(new Date(ms), "yyyy-MM-dd");
}

/**
 * Setzt das Datum neu und behält die Uhrzeit des Originals. Die Uhrzeit wird
 * nirgends angezeigt, bestimmt aber die Reihenfolge mehrerer Beiträge an
 * einem Tag – sie stammt aus den EXIF-Daten und soll nicht verloren gehen.
 */
export function withDate(originalMs: number, isoDate: string) {
  const [jahr, monat, tag] = isoDate.split("-").map(Number);
  if (!jahr || !monat || !tag) return originalMs;
  const datum = new Date(originalMs);
  datum.setFullYear(jahr, monat - 1, tag);
  return datum.getTime();
}

/** Reisetag wie bei Polarsteps: der erste Beitrag ist Tag 1. */
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

export function formatDuration(from: number | null, to: number | null) {
  if (!from || !to) return null;
  const days = differenceInCalendarDays(new Date(to), new Date(from)) + 1;
  return days === 1 ? "1 Tag" : `${days} Tage`;
}

export function pluralize(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
