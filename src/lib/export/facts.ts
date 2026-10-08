import "server-only";

import type { Trip } from "@/db/schema";
import { formatWeekdayYear, fromDateInput, tripDay } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n/locales";
import { fill } from "@/lib/i18n/text";
import type { StepWithPhotos } from "@/lib/trips";

/**
 * What album and Immich export say about a step, the same way the timeline
 * does: day 1 is the entered start, otherwise the first step.
 */
export function firstDayOf(trip: Pick<Trip, "startDate">, steps: StepWithPhotos[]) {
  return fromDateInput(trip.startDate) ?? steps[0]?.occurredAt ?? null;
}

/** "Day 8 · Saturday, May 9, 2026", with the place in between if asked. */
export function dayLine(
  step: Pick<StepWithPhotos, "occurredAt" | "placeName">,
  firstDay: number | null,
  locale: Locale,
  t: Dictionary,
  options: { place?: boolean } = {},
) {
  return [
    firstDay === null ? null : fill(t.timeline.day, { day: tripDay(firstDay, step.occurredAt) }),
    options.place ? step.placeName : null,
    formatWeekdayYear(step.occurredAt, locale),
  ]
    .filter(Boolean)
    .join(" · ");
}
