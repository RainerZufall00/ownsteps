"use client";

import type { StyleSpecification } from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatWeekday, fromDateInput, tripDay } from "@/lib/format";
import type { ViewStep, ViewTrip } from "@/lib/view-types";
import CommentSection from "./CommentSection";
import MapCanvas, { type MapStep } from "./MapCanvas";
import MapTimelineStrip from "./MapTimelineStrip";
import { MediaBaseProvider } from "./media-context";
import PhotoGrid from "./PhotoGrid";

type Props = {
  trip: ViewTrip;
  steps: ViewStep[];
  mapStyle: string | StyleSpecification;
  /** Shows edit links on the steps. */
  editable?: boolean;
  /**
   * Where the media come from. Signed in via `/api/photos`, through a share
   * link via `/api/share-media/<token>`, so the token is part of the image
   * URLs and the photos can't be reached without it.
   */
  mediaBase?: string;
  /** Header contributed by the respective page (title, actions). */
  header: ReactNode;
};

export default function TripView({
  trip,
  steps,
  mapStyle,
  editable = false,
  mediaBase = "/api/photos",
  header,
}: Props) {
  const [mobileView, setMobileView] = useState<"timeline" | "map">("timeline");
  const [activeStepId, setActiveStepId] = useState<number | null>(
    steps.at(-1)?.id ?? null,
  );
  const articleRefs = useRef(new Map<number, HTMLElement>());
  // After a marker click, scroll tracking should hold still briefly.
  const suppressObserver = useRef(false);
  const mapBox = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState<number | null>(null);

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
   * Day 1 is the entered trip start, otherwise the first step. Whoever sets
   * the date range wants to read "day 3" when writing for the first time on
   * the third day – not "day 1" again.
   */
  const firstDay = fromDateInput(trip.startDate) ?? steps[0]?.occurredAt ?? null;

  /**
   * The timeline shows the newest step on top – readers following along want
   * to see what's new, not scroll to the start of the trip first. Only the
   * display is reversed: `steps` stays chronological because day counting,
   * the route line and the strip over the map depend on it. A route drawn
   * backwards wouldn't be a route anymore.
   */
  const timelineSteps = useMemo(() => [...steps].reverse(), [steps]);

  // While scrolling, track which step is currently being read.
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
      // Window in the upper third: the step there counts as "active".
      { rootMargin: "-15% 0px -60% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [steps]);

  /**
   * On phones the map should reach down to the bottom edge. How much space
   * sits above it depends on the view – the signed-in one has a header bar,
   * the share link doesn't. So it's measured instead of calculated.
   */
  useEffect(() => {
    if (mobileView !== "map") return;
    const measure = () => {
      const box = mapBox.current;
      if (!box) return;
      // From the two-column layout on, the stylesheet handles the height.
      if (window.matchMedia("(min-width: 1280px)").matches) {
        setMapHeight(null);
        return;
      }
      const top = box.getBoundingClientRect().top;
      setMapHeight(Math.max(320, window.innerHeight - top - 12));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [mobileView]);

  // When opened with #step-123, jump straight there.
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

  /** Jump to the step – out of the map view into the timeline. */
  const openStep = (stepId: number) => {
    setActiveStepId(stepId);
    setMobileView("timeline");
    suppressObserver.current = true;
    // On phones only scroll after switching views.
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
    <MediaBaseProvider value={mediaBase}>
    <div
      /*
       * Below the two-column layout the mode decides the width: the timeline
       * gets a reading column, the map all the space. Without the cap, lines
       * on a tablet ran over 1150 px.
       */
      /*
       * `w-full` is mandatory: `<body>` is a flex container, and a flex child
       * with `margin: auto` on the cross axis no longer stretches but shrinks
       * to its content. The map has no width of its own – without this line
       * it collapsed to a hundred-odd pixels.
       */
      className={`mx-auto w-full px-4 pt-5 xl:max-w-7xl xl:pb-10 ${
        mobileView === "map" ? "max-w-6xl pb-0" : "max-w-3xl pb-24"
      }`}
    >
      {/* In map mode the header steps back on phones so the map gets the
          screen. */}
      <div className={mobileView === "map" ? "hidden xl:block" : ""}>
        {header}
      </div>

      {/* Toggle only on narrow screens. Deliberately not sticky: a bar
          scrolling along above the timeline feels restless. */}
      <div className="mb-4 xl:hidden">
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

      {/*
        Side by side only from `xl`. On a tablet in landscape (around 1194 px)
        the timeline got 628 px and the map 460 px – both too little, both
        felt cramped. Below that, each view gets the full width via the
        toggle.
      */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)] xl:items-start xl:gap-8">
        <div className={mobileView === "map" ? "hidden xl:block" : ""}>
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
              {/* Continuous line behind the dots. */}
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
          } xl:sticky xl:top-20 xl:block`}
        >
          <div
            ref={mapBox}
            style={mapHeight ? { height: mapHeight } : undefined}
            className="relative h-[70dvh] overflow-hidden rounded-3xl border border-line shadow-card xl:h-[calc(100dvh-7rem)]"
          >
            <MapCanvas
              steps={mapSteps}
              mapStyle={mapStyle}
              activeStepId={activeStepId}
              onSelect={setActiveStepId}
              className="h-full w-full"
            />

            {/* Page through steps over the map without having to hit the markers. */}
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
    </MediaBaseProvider>
  );
}
