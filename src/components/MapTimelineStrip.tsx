"use client";

import { useEffect, useRef } from "react";
import { formatDateShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { ViewStep } from "@/lib/view-types";
import PhotoImg from "./PhotoImg";
import { useDayLabel } from "./trip-day";

type Props = {
  steps: ViewStep[];
  firstDay: number | null;
  activeStepId: number | null;
  /** While swiping through: only move the map along. */
  onFocus: (stepId: number) => void;
  /** On tap: jump to the step in the timeline. */
  onOpen: (stepId: number) => void;
};

/**
 * Strip over the map for paging through the steps. While swiping, one card
 * snaps in at a time and the map flies along – so a trip can be traveled
 * without having to aim at the markers.
 */
export default function MapTimelineStrip({
  steps,
  firstDay,
  activeStepId,
  onFocus,
  onOpen,
}: Props) {
  const { locale, t } = useI18n();
  const dayLabel = useDayLabel(firstDay);
  const strip = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<number, HTMLButtonElement>());
  // Prevents the strip's own scrolling from triggering another switch.
  const selfScrolling = useRef(false);

  // Bring a step chosen from outside (e.g. marker click) into view.
  useEffect(() => {
    if (activeStepId === null) return;
    const target = items.current.get(activeStepId);
    if (!target || !strip.current) return;
    selfScrolling.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    const timer = window.setTimeout(() => {
      selfScrolling.current = false;
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeStepId]);

  function onScroll() {
    if (selfScrolling.current || !strip.current) return;
    const box = strip.current.getBoundingClientRect();
    const center = box.left + box.width / 2;

    let nearest: number | null = null;
    let smallestDistance = Number.POSITIVE_INFINITY;
    for (const [id, element] of items.current) {
      const r = element.getBoundingClientRect();
      const distance = Math.abs(r.left + r.width / 2 - center);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        nearest = id;
      }
    }
    if (nearest !== null && nearest !== activeStepId) onFocus(nearest);
  }

  if (steps.length === 0) return null;

  return (
    /*
     * Bottom spacing: on iPhone and iPad the system's swipe area sits at the
     * screen edge – every swipe there ended up in the app switcher instead of
     * the strip. The 2.5 rem keep it above that, `safe-area-inset` is added on
     * top for devices with a home indicator.
     */
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2.5rem)" }}
    >
      <div
        ref={strip}
        onScroll={onScroll}
        className="pointer-events-auto flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[calc(50%-8.5rem)] pb-1 [scrollbar-width:none] sm:px-[calc(50%-10rem)] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, index) => {
          const active = step.id === activeStepId;
          return (
            <button
              key={step.id}
              type="button"
              ref={(element) => {
                if (element) items.current.set(step.id, element);
                else items.current.delete(step.id);
              }}
              onClick={() => (active ? onOpen(step.id) : onFocus(step.id))}
              className={`flex w-[17rem] shrink-0 snap-center items-center gap-3 rounded-2xl p-2.5 text-left transition sm:w-80 ${
                active
                  ? "bg-surface shadow-float"
                  : "bg-surface/80 shadow-card backdrop-blur"
              }`}
            >
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                {step.photos[0] ? (
                  <PhotoImg
                    photo={step.photos[0]}
                    variant="thumb"
                    className="h-full w-full object-cover"
                    sizes="64px"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-base font-bold text-ink-faint">
                    {index + 1}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-accent">
                  {dayLabel(step.occurredAt) ?? formatDateShort(step.occurredAt, locale)}
                </span>
                <span className="block truncate text-[17px] font-semibold leading-tight">
                  {step.placeName ?? formatDateShort(step.occurredAt, locale)}
                </span>
                {active && (
                  <span className="block text-[12px] text-ink-faint">
                    {t.timeline.tapToRead}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
