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
 * Umkehrung von `toDateInput`: „2026-07-01" wird zum Tagesbeginn in der
 * Zeitzone des Servers. Bewusst nicht über `new Date(iso)` – das liest den
 * String als UTC und verschiebt das Datum je nach Zeitzone um einen Tag.
 */
export function fromDateInput(iso: string | null): number | null {
  if (!iso) return null;
  const [jahr, monat, tag] = iso.split("-").map(Number);
  if (!jahr || !monat || !tag) return null;
  return new Date(jahr, monat - 1, tag).getTime();
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

/**
 * Zeitraum einer Reise für die Kopfzeile. Ein von Hand gesetztes Datum hat
 * Vorrang vor den Beiträgen: Es beschreibt die Reise, während die Beiträge nur
 * zeigen, wie weit geschrieben wurde. Wer „1.–20. Juli" einträgt, soll nicht
 * „1.–3. Juli" lesen, bloß weil der Rest noch fehlt.
 */
export function formatTripRange(
  trip: { startDate: string | null; endDate: string | null },
  firstStepAt: number | null,
  lastStepAt: number | null,
) {
  const von = fromDateInput(trip.startDate) ?? firstStepAt;
  const bis = fromDateInput(trip.endDate) ?? lastStepAt;
  return formatRange(von, bis);
}

export function formatDuration(from: number | null, to: number | null) {
  if (!from || !to) return null;
  const days = differenceInCalendarDays(new Date(to), new Date(from)) + 1;
  return days === 1 ? "1 Tag" : `${days} Tage`;
}

/** Länge eines Videos als m:ss – bei über einer Stunde als h:mm:ss. */
export function formatMediaDuration(ms: number) {
  const gesamt = Math.round(ms / 1000);
  const stunden = Math.floor(gesamt / 3600);
  const minuten = Math.floor((gesamt % 3600) / 60);
  const sekunden = gesamt % 60;
  const zwei = (n: number) => String(n).padStart(2, "0");
  return stunden > 0
    ? `${stunden}:${zwei(minuten)}:${zwei(sekunden)}`
    : `${minuten}:${zwei(sekunden)}`;
}

export function pluralize(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
