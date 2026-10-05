"use client";

import { tripDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";

/**
 * "Day 3" for a step, counted from `firstDay` – or null when the trip has no
 * day 1 yet. Shared by the timeline and the strip over the map.
 */
export function useDayLabel(firstDay: number | null) {
  const { t } = useI18n();
  return (occurredAt: number) =>
    firstDay === null ? null : fill(t.timeline.day, { day: tripDay(firstDay, occurredAt) });
}
