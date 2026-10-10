"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatWeekday, fromDateInput } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { plural } from "@/lib/i18n/text";
import type { MapStyleConfig } from "@/lib/map";
import type { ViewStep, ViewTrip } from "@/lib/view-types";
import CommentSection from "./CommentSection";
import MapCanvas, { type MapStep } from "./MapCanvas";
import MapTimelineStrip from "./MapTimelineStrip";
import { MediaBaseProvider } from "./media-context";
import { ChevronRightIcon, EyeIcon, PinIcon } from "./icons";
import MobileTripView from "./MobileTripView";
import PhotoGrid from "./PhotoGrid";
import { useDayLabel } from "./trip-day";
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query";
import { useStepViews } from "./use-step-views";

type Props = {
  trip: ViewTrip;
  steps: ViewStep[];
  mapStyle: MapStyleConfig;
  /** Shows edit links on the steps. */
  editable?: boolean;
  /**
   * Where the media come from. Signed in via `/api/photos`, through a share
   * link via `/api/share-media/<token>`, so the token is part of the image
   * URLs and the photos can't be reached without it.
   */
  mediaBase?: string;
  /**
   * Share link token; guests need it to comment, and the page reports with it
   * which steps were read.
   */
  shareToken?: string;
  /** Readers per step – only on the authors' page. */
  viewCounts?: Record<number, number>;
  /**
   * Header contributed by the respective page (title, actions). On phones and
   * tablets it moves into the "about this trip" sheet.
   */
  header: ReactNode;
  /** Round buttons at the top of the phone and tablet layout, e.g. "new step". */
  mobileActions?: ReactNode;
};

export default function TripView({
  trip,
  steps,
  mapStyle,
  editable = false,
  mediaBase = "/api/photos",
  shareToken,
  viewCounts,
  header,
  mobileActions,
}: Props) {
  const { locale, t } = useI18n();
  /** `null` until hydrated – both layouts render, CSS shows the right one. */
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [activeStepId, setActiveStepId] = useState<number | null>(
    steps.at(-1)?.id ?? null,
  );
  const articleRefs = useRef(new Map<number, HTMLElement>());
  // After a marker click, scroll tracking should hold still briefly.
  const suppressObserver = useRef(false);

  /** Steps with a place – the ones the map and the strip over it show. */
  const located = useMemo(
    () => steps.filter((step) => step.lat !== null && step.lon !== null),
    [steps],
  );
  const mapSteps = useMemo<MapStep[]>(
    () =>
      located.map((step) => ({
        id: step.id,
        label: step.placeName ?? "",
        lat: step.lat as number,
        lon: step.lon as number,
        coverPhotoId: step.photos[0]?.id ?? null,
      })),
    [located],
  );

  /**
   * Day 1 is the entered trip start, otherwise the first step. Whoever sets
   * the date range wants to read "day 3" when writing for the first time on
   * the third day – not "day 1" again.
   */
  const firstDay = fromDateInput(trip.startDate) ?? steps[0]?.occurredAt ?? null;
  const dayLabel = useDayLabel(firstDay);

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

  useStepViews(shareToken, articleRefs, steps);

  // When opened with #step-123, jump straight there. (Phones and tablets open
  // the step's story instead, see MobileTripView.)
  useEffect(() => {
    if (!isDesktop) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#step-")) return;
    const id = Number(hash.slice("#step-".length));
    if (!Number.isInteger(id)) return;
    setActiveStepId(id);
    requestAnimationFrame(() => {
      articleRefs.current.get(id)?.scrollIntoView({ block: "start" });
    });
  }, [isDesktop]);

  /** Jump to the step in the timeline. */
  const openStep = (stepId: number) => {
    setActiveStepId(stepId);
    suppressObserver.current = true;
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
      {/*
        Phones and tablets: map with step cards and stories, like the apps.
        Both layouts are rendered and CSS picks one, so the server needn't
        know the screen; only the visible one runs its map.
      */}
      <div className="w-full xl:hidden">
        <MobileTripView
          trip={trip}
          steps={steps}
          mapStyle={mapStyle}
          editable={editable}
          shareToken={shareToken}
          viewCounts={viewCounts}
          firstDay={firstDay}
          header={header}
          actions={mobileActions}
          active={isDesktop === false}
        />
      </div>

      <div
        /*
         * `w-full` is mandatory: `<body>` is a flex container, and a flex child
         * with `margin: auto` on the cross axis no longer stretches but shrinks
         * to its content. The map has no width of its own – without this line
         * it collapsed to a hundred-odd pixels.
         */
        className="mx-auto hidden w-full max-w-7xl px-4 pb-10 pt-5 xl:block"
      >
        {/* An only child: next to a sibling, React's dev build warned about
            a missing key on the server-made header. */}
        <div>{header}</div>

        {/*
          Side by side only from `xl`. On a tablet in landscape (around 1194 px)
          the timeline got 628 px and the map 460 px – both too little, both
          felt cramped. Below that, phones and tablets get the app's layout.
        */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,520px)] items-start gap-8">
          <div>
            {steps.length === 0 ? (
              <div className="card px-6 py-14 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-2xl">
                  📍
                </div>
                <h2 className="mt-4 text-lg font-semibold">
                  {t.timeline.emptyTitle}
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-[15px] text-ink-soft">
                  {editable
                    ? t.timeline.emptyAuthor
                    : t.timeline.emptyReader}
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
                              {dayLabel(step.occurredAt)}
                            </span>
                          )}
                          <span>{formatWeekday(step.occurredAt, locale)}</span>
                          {viewCounts && (
                            <span
                              title={t.timeline.viewsHint}
                              className="ml-auto inline-flex items-center gap-1 text-ink-faint"
                            >
                              <EyeIcon className="h-3.5 w-3.5" />
                              {plural(t.timeline.views, viewCounts[step.id] ?? 0)}
                            </span>
                          )}
                        </div>

                        {step.placeName && (
                          <h2 className="mt-1.5 flex items-start gap-1.5 text-xl font-bold leading-snug tracking-tight">
                            <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
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
                          shareToken={shareToken}
                          comments={step.comments}
                          canDelete={editable}
                        />

                        {editable && (
                          <Link
                            href={`/trips/${trip.id}/steps/${step.id}`}
                            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                          >
                            {t.timeline.edit}
                            <ChevronRightIcon />
                          </Link>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="sticky top-20">
            <div className="relative h-[calc(100dvh-7rem)] overflow-hidden rounded-3xl border border-line shadow-card">
              {isDesktop && (
                <MapCanvas
                  steps={mapSteps}
                  mapStyle={mapStyle}
                  activeStepId={activeStepId}
                  onSelect={setActiveStepId}
                  className="h-full w-full"
                />
              )}

              {/* Page through steps over the map without having to hit the markers. */}
              <MapTimelineStrip
                steps={located}
                firstDay={firstDay}
                activeStepId={activeStepId}
                onFocus={setActiveStepId}
                onOpen={openStep}
              />

              {mapSteps.length === 0 && (
                <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-surface/90 px-4 py-3 text-center text-sm text-ink-soft backdrop-blur">
                  {t.timeline.noPlaces}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MediaBaseProvider>
  );
}
