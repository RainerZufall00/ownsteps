"use client";

import type { StyleSpecification } from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatWeekday, fromDateInput, tripDay } from "@/lib/format";
import type { ViewStep, ViewTrip } from "@/lib/view-types";
import CommentSection from "./CommentSection";
import MapCanvas, { type MapStep } from "./MapCanvas";
import MapTimelineStrip from "./MapTimelineStrip";
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
    steps.at(-1)?.id ?? null,
  );
  const articleRefs = useRef(new Map<number, HTMLElement>());
  // Nach einem Marker-Klick soll das Scroll-Tracking kurz stillhalten.
  const suppressObserver = useRef(false);
  const kartenBox = useRef<HTMLDivElement>(null);
  const [kartenHoehe, setKartenHoehe] = useState<number | null>(null);

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

  /**
   * Tag 1 ist der eingetragene Reisebeginn, sonst der erste Beitrag. Wer den
   * Zeitraum angibt, will „Tag 3" lesen, wenn er am dritten Tag zum ersten Mal
   * etwas schreibt – nicht wieder „Tag 1".
   */
  const firstDay = fromDateInput(trip.startDate) ?? steps[0]?.occurredAt ?? null;

  /**
   * In der Timeline steht der neueste Beitrag oben – wer mitliest, will das
   * Neue sehen und nicht erst an den Anfang der Reise scrollen. Umgedreht wird
   * nur die Anzeige: `steps` bleibt chronologisch, weil Tageszählung,
   * Routenlinie und die Leiste über der Karte daran hängen. Eine rückwärts
   * gezeichnete Route wäre keine Route mehr.
   */
  const timelineSteps = useMemo(() => [...steps].reverse(), [steps]);

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

  /**
   * Auf dem Handy soll die Karte bis zum unteren Rand reichen. Wie viel Platz
   * über ihr liegt, hängt von der Ansicht ab – die angemeldete hat eine
   * Kopfleiste, der Share-Link nicht. Deshalb wird gemessen statt gerechnet.
   */
  useEffect(() => {
    if (mobileView !== "map") return;
    const messen = () => {
      const box = kartenBox.current;
      if (!box) return;
      // Ab der großen Ansicht regelt das Stylesheet die Höhe.
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setKartenHoehe(null);
        return;
      }
      const oben = box.getBoundingClientRect().top;
      setKartenHoehe(Math.max(320, window.innerHeight - oben - 12));
    };
    messen();
    window.addEventListener("resize", messen);
    window.addEventListener("orientationchange", messen);
    return () => {
      window.removeEventListener("resize", messen);
      window.removeEventListener("orientationchange", messen);
    };
  }, [mobileView]);

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

  /** Zum Beitrag springen – aus der Kartenansicht heraus in die Timeline. */
  const openStep = (stepId: number) => {
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
    <div
      className={`mx-auto max-w-6xl px-4 pt-5 lg:pb-10 ${
        mobileView === "map" ? "pb-0" : "pb-24"
      }`}
    >
      {/* Im Kartenmodus tritt der Kopfbereich auf dem Handy zurück, damit die
          Karte den Bildschirm bekommt. */}
      <div className={mobileView === "map" ? "hidden lg:block" : ""}>
        {header}
      </div>

      {/* Umschalter nur auf schmalen Bildschirmen. Bewusst nicht mitlaufend:
          eine mitscrollende Leiste über der Timeline wirkt unruhig. */}
      <div className="mb-4 lg:hidden">
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

              {timelineSteps.map((step, index) => {
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
                      className="scroll-mt-20"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-medium text-ink-soft">
                        {firstDay && (
                          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent">
                            Tag {tripDay(firstDay, step.occurredAt)}
                          </span>
                        )}
                        <span>{formatWeekday(step.occurredAt)}</span>
                      </div>

                      {step.placeName && (
                        <h2 className="mt-1.5 flex items-start gap-1.5 text-xl font-bold leading-snug tracking-tight">
                          <svg
                            viewBox="0 0 24 24"
                            className="mt-0.5 h-5 w-5 shrink-0 text-accent"
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
                        </h2>
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

                      <CommentSection
                        tripId={trip.id}
                        stepId={step.id}
                        comments={step.comments}
                        canDelete={editable}
                      />

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
          <div
            ref={kartenBox}
            style={kartenHoehe ? { height: kartenHoehe } : undefined}
            className="relative h-[70dvh] overflow-hidden rounded-3xl border border-line shadow-card lg:h-[calc(100dvh-7rem)]"
          >
            <MapCanvas
              steps={mapSteps}
              mapStyle={mapStyle}
              activeStepId={activeStepId}
              onSelect={setActiveStepId}
              className="h-full w-full"
            />

            {/* Blättern über der Karte, ohne die Marker treffen zu müssen. */}
            <MapTimelineStrip
              steps={steps.filter((s) => s.lat !== null && s.lon !== null)}
              firstDay={firstDay}
              activeStepId={activeStepId}
              onFocus={setActiveStepId}
              onOpen={openStep}
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
