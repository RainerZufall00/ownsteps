"use client";

import type { StyleSpecification } from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTime, formatWeekday, tripDay } from "@/lib/format";
import type { ViewStep, ViewTrip } from "@/lib/view-types";
import MapCanvas, { type MapStep } from "./MapCanvas";
import PhotoGrid from "./PhotoGrid";

type Props = {
  trip: ViewTrip;
  steps: ViewStep[];
  mapStyle: string | StyleSpecification;
  /** Zeigt Bearbeiten-Links an den Beiträgen. */
  editable?: boolean;
  /** Kopfbereich, den die jeweilige Seite beisteuert (Titel, Aktionen). */
  header: ReactNode;
};

export default function TripView({
  trip,
  steps,
  mapStyle,
  editable = false,
  header,
}: Props) {
  const [mobileView, setMobileView] = useState<"timeline" | "map">("timeline");
  const [activeStepId, setActiveStepId] = useState<number | null>(
    steps[0]?.id ?? null,
  );
  const articleRefs = useRef(new Map<number, HTMLElement>());
  // Nach einem Marker-Klick soll das Scroll-Tracking kurz stillhalten.
  const suppressObserver = useRef(false);

  const mapSteps = useMemo<MapStep[]>(
    () =>
      steps
        .filter((step) => step.lat !== null && step.lon !== null)
        .map((step) => ({
          id: step.id,
          title: step.title,
          lat: step.lat as number,
          lon: step.lon as number,
          occurredAt: step.occurredAt,
          coverPhotoId: step.photos[0]?.id ?? null,
        })),
    [steps],
  );

  const firstDay = steps[0]?.occurredAt ?? null;

  // Beim Scrollen mitverfolgen, welcher Beitrag gerade gelesen wird.
  useEffect(() => {
    const elements = [...articleRefs.current.values()];
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressObserver.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        const id = Number((visible.target as HTMLElement).dataset.stepId);
        if (Number.isInteger(id)) setActiveStepId(id);
      },
      // Fenster im oberen Drittel: der Beitrag dort gilt als "aktiv".
      { rootMargin: "-15% 0px -60% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [steps]);

  // Beim Aufruf mit #step-123 direkt dorthin springen.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#step-")) return;
    const id = Number(hash.slice("#step-".length));
    if (!Number.isInteger(id)) return;
    setActiveStepId(id);
    requestAnimationFrame(() => {
      articleRefs.current.get(id)?.scrollIntoView({ block: "start" });
    });
  }, []);

  const focusStep = (stepId: number) => {
    setActiveStepId(stepId);
    setMobileView("timeline");
    suppressObserver.current = true;
    // Auf dem Handy erst nach dem Umschalten scrollen.
    requestAnimationFrame(() => {
      articleRefs.current
        .get(stepId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        suppressObserver.current = false;
      }, 800);
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-5 lg:pb-10">
      {header}

      {/* Umschalter nur auf schmalen Bildschirmen. */}
      <div className="sticky top-14 z-30 -mx-4 mb-4 bg-paper/85 px-4 py-2 backdrop-blur-lg lg:hidden">
        <div className="flex rounded-full border border-line bg-surface p-1">
          {(["timeline", "map"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              aria-pressed={mobileView === view}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                mobileView === view
                  ? "bg-accent text-accent-ink shadow-card"
                  : "text-ink-soft"
              }`}
            >
              {view === "timeline" ? "Timeline" : "Karte"}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start lg:gap-8">
        <div className={mobileView === "map" ? "hidden lg:block" : ""}>
          {steps.length === 0 ? (
            <div className="card px-6 py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-2xl">
                📍
              </div>
              <h2 className="mt-4 text-lg font-semibold">
                Noch keine Stationen
              </h2>
              <p className="mx-auto mt-2 max-w-xs text-[15px] text-ink-soft">
                {editable
                  ? "Lade dein erstes Foto hoch – Ort und Zeit holt sich OwnSteps direkt aus dem Bild."
                  : "Hier erscheinen die Beiträge, sobald die Reise losgeht."}
              </p>
            </div>
          ) : (
            <ol className="relative">
              {/* Durchgehende Linie hinter den Punkten. */}
              <span
                aria-hidden="true"
                className="absolute bottom-6 left-[7px] top-3 w-0.5 bg-line"
              />

              {steps.map((step, index) => {
                const isActive = step.id === activeStepId;
                return (
                  <li key={step.id} className="relative pb-9 pl-8">
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-2.5 h-4 w-4 rounded-full border-[3px] border-paper transition ${
                        isActive
                          ? "scale-125 bg-accent"
                          : "bg-ink-faint/60"
                      }`}
                    />

                    <article
                      id={`step-${step.id}`}
                      data-step-id={step.id}
                      ref={(element) => {
                        if (element) articleRefs.current.set(step.id, element);
                        else articleRefs.current.delete(step.id);
                      }}
                      className="scroll-mt-32"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-medium text-ink-soft">
                        {firstDay && (
                          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent">
                            Tag {tripDay(firstDay, step.occurredAt)}
                          </span>
                        )}
                        <span>{formatWeekday(step.occurredAt)}</span>
                        <span className="text-ink-faint">
                          {formatTime(step.occurredAt)}
                        </span>
                      </div>

                      {step.title && (
                        <h2 className="mt-1.5 text-xl font-bold leading-snug tracking-tight">
                          {step.title}
                        </h2>
                      )}

                      {step.placeName && (
                        <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-soft">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-accent"
                            aria-hidden="true"
                          >
                            <path
                              d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"
                              fill="currentColor"
                              opacity="0.25"
                            />
                            <circle cx="12" cy="10" r="2.6" fill="currentColor" />
                          </svg>
                          {step.placeName}
                        </p>
                      )}

                      {step.photos.length > 0 && (
                        <div className="mt-3">
                          <PhotoGrid photos={step.photos} priority={index === 0} />
                        </div>
                      )}

                      {step.body && (
                        <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-ink/90">
                          {step.body}
                        </p>
                      )}

                      {editable && (
                        <Link
                          href={`/trips/${trip.id}/steps/${step.id}`}
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                        >
                          Bearbeiten
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            aria-hidden="true"
                          >
                            <path
                              d="m9 5 7 7-7 7"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          </svg>
                        </Link>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div
          className={`${
            mobileView === "timeline" ? "hidden" : ""
          } lg:sticky lg:top-20 lg:block`}
        >
          <div className="relative h-[calc(100dvh-11rem)] overflow-hidden rounded-3xl border border-line shadow-card lg:h-[calc(100dvh-7rem)]">
            <MapCanvas
              steps={mapSteps}
              mapStyle={mapStyle}
              activeStepId={activeStepId}
              onSelect={focusStep}
              className="h-full w-full"
            />
            {mapSteps.length === 0 && (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-surface/90 px-4 py-3 text-center text-sm text-ink-soft backdrop-blur">
                Noch keine Orte – Fotos mit GPS-Daten setzen die Marker
                automatisch.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
