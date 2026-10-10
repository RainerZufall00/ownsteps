"use client";

import type { KeyboardEvent } from "react";
import { formatDateShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { ViewStep } from "@/lib/view-types";
import { useDayLabel } from "./trip-day";

const RESOLUTION = 1000;

/**
 * The trip as a bar above the step cards, like the apps: filled up to the
 * step in view, with "Day n" riding on its end. Dragging along it scrubs
 * through the steps – the cards and the map follow. Underneath sits a plain
 * range input, so keyboards and screen readers get a real slider; the arrow
 * keys move one step at a time.
 */
export default function DayTrack({
  steps,
  start,
  end,
  firstDay,
  focusedId,
  onSelect,
}: {
  /** Chronological. */
  steps: ViewStep[];
  start: number | null;
  end: number | null;
  firstDay: number | null;
  focusedId: number | null;
  onSelect: (stepId: number) => void;
}) {
  const { locale, t } = useI18n();
  const dayLabel = useDayLabel(firstDay);
  const index = Math.max(0, steps.findIndex((step) => step.id === focusedId));
  const current = steps[index] ?? steps.at(-1);
  if (!current) return null;

  const span = start !== null && end !== null && end > start ? end - start : null;
  const fractionOf = (step: ViewStep) =>
    span === null ? 1 : Math.min(Math.max((step.occurredAt - (start as number)) / span, 0), 1);
  const fraction = fractionOf(current);
  const label = dayLabel(current.occurredAt) ?? formatDateShort(current.occurredAt, locale);

  /** The step nearest to a point on the bar, by time. */
  function select(value: number) {
    const target = value / RESOLUTION;
    let nearest = steps[0];
    for (const step of steps) {
      if (Math.abs(fractionOf(step) - target) < Math.abs(fractionOf(nearest) - target)) {
        nearest = step;
      }
    }
    if (nearest.id !== current.id) onSelect(nearest.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      Home: 0,
      End: steps.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    // Steps, not thousandths of the bar.
    event.preventDefault();
    const step = steps[Math.min(Math.max(next, 0), steps.length - 1)];
    if (step.id !== current.id) onSelect(step.id);
  }

  return (
    <div className="pointer-events-auto relative mx-6 h-10">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-black/35 ring-1 ring-white/25"
      />
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${Math.max(fraction * 100, 2)}%` }}
      />
      <input
        type="range"
        min={0}
        max={RESOLUTION}
        step={1}
        value={Math.round(fraction * RESOLUTION)}
        onChange={(event) => select(Number(event.target.value))}
        onKeyDown={onKeyDown}
        aria-label={t.tripScreen.progress}
        aria-valuetext={current.placeName ? `${label} – ${current.placeName}` : label}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/60 bg-accent px-2.5 py-1 text-xs font-bold text-accent-ink shadow-card transition-[left] duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-white"
        style={{ left: `clamp(2.5rem, ${fraction * 100}%, calc(100% - 2.5rem))` }}
      >
        {label}
      </span>
    </div>
  );
}
