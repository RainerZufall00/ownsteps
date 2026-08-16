"use client";

import { useEffect, useRef } from "react";
import { formatDateShort, tripDay } from "@/lib/format";
import type { ViewStep } from "@/lib/view-types";
import PhotoImg from "./PhotoImg";

type Props = {
  steps: ViewStep[];
  firstDay: number | null;
  activeStepId: number | null;
  /** Beim Durchwischen: nur die Karte mitziehen. */
  onFocus: (stepId: number) => void;
  /** Beim Antippen: zum Beitrag in der Timeline springen. */
  onOpen: (stepId: number) => void;
};

/**
 * Leiste über der Karte, mit der man die Stationen durchblättert. Beim
 * Wischen rastet jeweils eine Karte ein und die Karte fliegt mit – so lässt
 * sich eine Reise abfahren, ohne auf die Marker zielen zu müssen.
 */
export default function MapTimelineStrip({
  steps,
  firstDay,
  activeStepId,
  onFocus,
  onOpen,
}: Props) {
  const leiste = useRef<HTMLDivElement>(null);
  const eintraege = useRef(new Map<number, HTMLButtonElement>());
  // Verhindert, dass das Nachführen der Leiste selbst wieder einen Wechsel auslöst.
  const scrolltSelbst = useRef(false);

  // Von außen gewählte Station (z.B. Marker-Klick) in den Blick holen.
  useEffect(() => {
    if (activeStepId === null) return;
    const ziel = eintraege.current.get(activeStepId);
    if (!ziel || !leiste.current) return;
    scrolltSelbst.current = true;
    ziel.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    const timer = window.setTimeout(() => {
      scrolltSelbst.current = false;
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeStepId]);

  function onScroll() {
    if (scrolltSelbst.current || !leiste.current) return;
    const kasten = leiste.current.getBoundingClientRect();
    const mitte = kasten.left + kasten.width / 2;

    let naechste: number | null = null;
    let kleinsterAbstand = Number.POSITIVE_INFINITY;
    for (const [id, element] of eintraege.current) {
      const r = element.getBoundingClientRect();
      const abstand = Math.abs(r.left + r.width / 2 - mitte);
      if (abstand < kleinsterAbstand) {
        kleinsterAbstand = abstand;
        naechste = id;
      }
    }
    if (naechste !== null && naechste !== activeStepId) onFocus(naechste);
  }

  if (steps.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-3">
      <div
        ref={leiste}
        onScroll={onScroll}
        className="pointer-events-auto flex snap-x snap-mandatory gap-2 overflow-x-auto px-[calc(50%-6.5rem)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, index) => {
          const aktiv = step.id === activeStepId;
          return (
            <button
              key={step.id}
              type="button"
              ref={(element) => {
                if (element) eintraege.current.set(step.id, element);
                else eintraege.current.delete(step.id);
              }}
              onClick={() => (aktiv ? onOpen(step.id) : onFocus(step.id))}
              className={`flex w-52 shrink-0 snap-center items-center gap-2.5 rounded-2xl p-2 text-left transition ${
                aktiv
                  ? "bg-surface shadow-float"
                  : "bg-surface/80 shadow-card backdrop-blur"
              }`}
            >
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                {step.photos[0] ? (
                  <PhotoImg
                    photo={step.photos[0]}
                    variant="thumb"
                    className="h-full w-full object-cover"
                    sizes="48px"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-sm font-bold text-ink-faint">
                    {index + 1}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-accent">
                  {firstDay
                    ? `Tag ${tripDay(firstDay, step.occurredAt)}`
                    : formatDateShort(step.occurredAt)}
                </span>
                <span className="block truncate text-[14px] font-semibold leading-tight">
                  {step.placeName ?? formatDateShort(step.occurredAt)}
                </span>
                {aktiv && (
                  <span className="block text-[11px] text-ink-faint">
                    Antippen zum Lesen
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
