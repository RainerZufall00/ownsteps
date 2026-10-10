"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatDateShort, formatTripRange, formatWeekday, fromDateInput } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { plural } from "@/lib/i18n/text";
import type { MapStyleConfig } from "@/lib/map";
import type { ViewStep, ViewTrip } from "@/lib/view-types";
import DayTrack from "./DayTrack";
import { CommentIcon, EyeIcon, InfoIcon, PinIcon } from "./icons";
import MapCanvas, { type MapStep } from "./MapCanvas";
import PhotoImg from "./PhotoImg";
import Sheet from "./Sheet";
import StepStory from "./StepStory";
import { useDayLabel } from "./trip-day";
import { usePrefersReducedMotion } from "./use-media-query";
import { useShownStepView } from "./use-step-views";

type Props = {
  trip: ViewTrip;
  /** Chronological – the cards run left to right like the route ([E13]). */
  steps: ViewStep[];
  mapStyle: MapStyleConfig;
  editable: boolean;
  shareToken?: string;
  viewCounts?: Record<number, number>;
  firstDay: number | null;
  /** The page's header – shown in the "about this trip" sheet. */
  header: ReactNode;
  /** Round buttons next to "about", e.g. the author's "new step". */
  actions?: ReactNode;
  /** Below the desktop breakpoint: only then the map, the story and view reports run. */
  active: boolean;
};

/** Card width – most of the screen, so the neighbors peek in. Matches the padding below. */
const CARD_WIDTH = "min(88vw, 440px)";
const STRIP_PADDING = "max(6vw, calc(50vw - 220px))";

/**
 * The trip on phones and tablets, laid out like the apps (D29): the map fills
 * the screen, the steps are cards side by side below it – oldest on the
 * left, opening on the newest. Swiping the cards moves the map along, a
 * tapped marker brings its card, a tapped card opens the step as a story.
 * The desktop keeps the timeline beside the map (`TripView`).
 */
export default function MobileTripView({
  trip,
  steps,
  mapStyle,
  editable,
  shareToken,
  viewCounts,
  firstDay,
  header,
  actions,
  active,
}: Props) {
  const { locale, t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const newest = steps.at(-1) ?? null;
  /** The card in the middle of the strip. */
  const [focusedId, setFocusedId] = useState<number | null>(newest?.id ?? null);
  /** The step the map shows – none at first, so the whole route is in view. */
  const [mapStepId, setMapStepId] = useState<number | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [storyAt, setStoryAt] = useState<number | null>(null);
  const [storyStepId, setStoryStepId] = useState<number | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [top, setTop] = useState(0);
  const [overlay, setOverlay] = useState({ top: 72, bottom: 300 });

  const root = useRef<HTMLDivElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const bottomBar = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const cards = useRef(new Map<number, HTMLButtonElement>());
  /** While the strip scrolls to a card by itself, passing cards don't count. */
  const scrollingTo = useRef<number | null>(null);
  const storyOpen = useRef(false);
  /** Whether opening the story added a history entry the back button can take. */
  const pushedHistory = useRef(false);
  // For event handlers that outlive a render.
  const storyStepIdRef = useRef(storyStepId);
  storyStepIdRef.current = storyStepId;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;

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
  const isLocated = useCallback(
    (id: number) => located.some((step) => step.id === id),
    [located],
  );

  /** The bar runs to the entered end date (its whole day) or the last step, whichever is later. */
  const trackEnd = useMemo(() => {
    const entered = fromDateInput(trip.endDate);
    const last = newest?.occurredAt ?? null;
    const enteredEnd = entered === null ? null : entered + 24 * 60 * 60 * 1000 - 1;
    if (enteredEnd === null) return last;
    return last === null ? enteredEnd : Math.max(enteredEnd, last);
  }, [trip.endDate, newest]);

  // Readers' views count like in the app: a second on a card or in the story.
  useShownStepView(active ? shareToken : undefined, storyAt !== null ? storyStepId : focusedId);

  /** How far down the page starts – the signed-in view has a bar above it. */
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    setTop(Math.max(0, element.getBoundingClientRect().top + window.scrollY));
    // Hidden on desktops, it measures nothing there – again once it shows.
  }, [active]);

  // The map frames the route in what the bars leave free.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setOverlay({
        top: topBar.current?.offsetHeight ?? 0,
        bottom: bottomBar.current?.offsetHeight ?? 0,
      });
    });
    if (topBar.current) observer.observe(topBar.current);
    if (bottomBar.current) observer.observe(bottomBar.current);
    return () => observer.disconnect();
  }, []);

  const scrollToCard = useCallback(
    (id: number, smooth: boolean) => {
      const list = strip.current;
      const card = cards.current.get(id);
      if (!list || !card) return;
      const item = card.parentElement as HTMLElement;
      scrollingTo.current = id;
      list.scrollTo({
        left: item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2,
        behavior: smooth && !reducedMotion ? "smooth" : "auto",
      });
      window.setTimeout(() => {
        if (scrollingTo.current === id) scrollingTo.current = null;
      }, 900);
    },
    [reducedMotion],
  );

  /** A step chosen elsewhere (marker, day track, story): card and map follow. */
  const focusStep = useCallback(
    (id: number, smooth = true) => {
      setFocusedId(id);
      if (isLocated(id)) setMapStepId(id);
      scrollToCard(id, smooth);
    },
    [isLocated, scrollToCard],
  );

  // Open on the newest card – or on a step the link points at (`#step-123`),
  // straight in its story.
  useLayoutEffect(() => {
    const list = strip.current;
    if (list) list.scrollLeft = list.scrollWidth;
  }, []);

  const openStory = useCallback((id: number, addHistory: boolean) => {
    storyOpen.current = true;
    pushedHistory.current = addHistory;
    if (addHistory) window.history.pushState(window.history.state, "", `#step-${id}`);
    setStoryStepId(id);
    setStoryAt(id);
  }, []);

  useEffect(() => {
    if (!active) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#step-")) return;
    const id = Number(hash.slice("#step-".length));
    if (!steps.some((step) => step.id === id)) return;
    focusStep(id, false);
    openStory(id, false);
    // Only when arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const closeStory = useCallback(
    (lastId: number) => {
      if (!storyOpen.current) return;
      storyOpen.current = false;
      setStoryAt(null);
      // Going back leaves the cards and the map at this step, like the app.
      focusStep(lastId, false);
      requestAnimationFrame(() => cards.current.get(lastId)?.focus({ preventScroll: true }));
      if (pushedHistory.current) {
        pushedHistory.current = false;
        window.history.back();
      } else {
        const url = window.location.pathname + window.location.search;
        window.history.replaceState(window.history.state, "", url);
      }
    },
    [focusStep],
  );

  // The browser's back button closes the story instead of leaving the trip.
  useEffect(() => {
    const onPop = () => {
      if (!storyOpen.current) return;
      pushedHistory.current = false;
      closeStory(storyStepIdRef.current ?? focusedIdRef.current ?? 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeStory]);

  const frame = useRef(0);
  function onStripScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const list = strip.current;
      if (!list) return;
      const center = list.getBoundingClientRect().left + list.clientWidth / 2;
      let nearest: number | null = null;
      let smallest = Number.POSITIVE_INFINITY;
      for (const [id, card] of cards.current) {
        const box = card.getBoundingClientRect();
        const distance = Math.abs(box.left + box.width / 2 - center);
        if (distance < smallest) {
          smallest = distance;
          nearest = id;
        }
      }
      if (nearest === null) return;
      if (scrollingTo.current !== null) {
        // Arrived – from here on the user's swipes count again.
        if (nearest === scrollingTo.current && smallest < 2) scrollingTo.current = null;
        return;
      }
      if (nearest !== focusedIdRef.current) {
        setFocusedId(nearest);
        if (isLocated(nearest)) setMapStepId(nearest);
      }
    });
  }

  const showWholeTrip = () => {
    setMapStepId(null);
    setFitKey((key) => key + 1);
  };

  const range = formatTripRange(trip, steps[0]?.occurredAt ?? null, newest?.occurredAt ?? null, locale);
  const cover = newest?.photos[0] ?? null;

  return (
    <div
      ref={root}
      className="relative w-full overflow-hidden bg-surface-muted"
      style={{ height: `calc(100dvh - ${top}px)` }}
    >
      <h1 className="sr-only">{trip.title}</h1>

      {active && (
        <div
          // MapLibre's own stylesheet pins its corners; the cards would cover
          // the attribution without the override.
          className="absolute inset-0 [&_.maplibregl-ctrl-bottom-left]:bottom-[var(--overlay-bottom)]! [&_.maplibregl-ctrl-bottom-right]:bottom-[var(--overlay-bottom)]!"
          style={{ "--overlay-bottom": `${overlay.bottom}px` } as React.CSSProperties}
        >
          <MapCanvas
            steps={mapSteps}
            mapStyle={mapStyle}
            activeStepId={mapStepId}
            onSelect={(id) => focusStep(id)}
            className="h-full w-full"
            controls={false}
            fitKey={fitKey}
            padding={{ top: overlay.top + 16, bottom: overlay.bottom + 16, left: 24, right: 24 }}
          />
        </div>
      )}

      {/* The trip at a glance; tapping it shows the whole route again. */}
      <div
        ref={topBar}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 px-3 pb-2"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={showWholeTrip}
          className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-full bg-surface/90 py-1.5 pl-1.5 pr-4 text-left shadow-card backdrop-blur-md"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft">
            {cover ? (
              <PhotoImg photo={cover} variant="thumb" className="h-full w-full object-cover" sizes="40px" />
            ) : (
              <PinIcon className="h-5 w-5 text-accent" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight">{trip.title}</span>
            <span className="block truncate text-[12px] text-ink-soft">
              {range ?? t.range.noSteps}
              {steps.length > 0 && ` · ${plural(t.counts.steps, steps.length)}`}
            </span>
          </span>
          <span className="sr-only">{t.tripScreen.wholeTrip}</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          aria-label={t.tripScreen.about}
          className="pointer-events-auto grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-card backdrop-blur-md"
        >
          <InfoIcon />
        </button>
        {actions && <div className="pointer-events-auto shrink-0">{actions}</div>}
      </div>

      <div
        ref={bottomBar}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        {steps.length > 0 && located.length === 0 && (
          <p className="mx-4 mb-2 rounded-2xl bg-surface/90 px-4 py-3 text-center text-sm text-ink-soft backdrop-blur">
            {t.timeline.noPlaces}
          </p>
        )}
        {steps.length > 0 && (
          <DayTrack
            steps={steps}
            start={firstDay}
            end={trackEnd}
            firstDay={firstDay}
            focusedId={focusedId}
            onSelect={(id) => focusStep(id)}
          />
        )}
        <ul
          ref={strip}
          onScroll={onStripScroll}
          aria-label={t.tripScreen.steps}
          className="pointer-events-auto mt-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingInline: STRIP_PADDING }}
        >
          {steps.length === 0 ? (
            <li className="shrink-0" style={{ width: CARD_WIDTH }}>
              <div className="flex h-[248px] flex-col justify-center rounded-[30px] bg-surface p-6 shadow-float">
                <p className="text-lg font-semibold">{t.timeline.emptyTitle}</p>
                <p className="mt-1 text-[15px] text-ink-soft">
                  {editable ? t.timeline.emptyAuthor : t.timeline.emptyReader}
                </p>
              </div>
            </li>
          ) : (
            steps.map((step) => (
              <li key={step.id} className="shrink-0 snap-center" style={{ width: CARD_WIDTH }}>
                <StepCard
                  step={step}
                  firstDay={firstDay}
                  viewCount={viewCounts ? (viewCounts[step.id] ?? 0) : undefined}
                  priority={step.id === newest?.id}
                  cardRef={(element) => {
                    if (element) cards.current.set(step.id, element);
                    else cards.current.delete(step.id);
                  }}
                  onOpen={() => openStory(step.id, true)}
                  onFocus={() => {
                    if (focusedIdRef.current !== step.id) focusStep(step.id);
                  }}
                />
              </li>
            ))
          )}
        </ul>
      </div>

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} label={t.tripScreen.about}>
        <div className="pb-6 pt-2">{header}</div>
      </Sheet>

      {active && storyAt !== null && (
        <StepStory
          tripId={trip.id}
          steps={steps}
          firstDay={firstDay}
          startStepId={storyAt}
          editable={editable}
          shareToken={shareToken}
          viewCounts={viewCounts}
          onStepChange={(id) => {
            setStoryStepId(id);
            window.history.replaceState(window.history.state, "", `#step-${id}`);
          }}
          onClose={closeStory}
          onShowOnMap={closeStory}
        />
      )}
    </div>
  );
}

/** A step under the map: its first photo, day and place, the start of the text. */
function StepCard({
  step,
  firstDay,
  viewCount,
  priority,
  cardRef,
  onOpen,
  onFocus,
}: {
  step: ViewStep;
  firstDay: number | null;
  viewCount?: number;
  priority: boolean;
  cardRef: (element: HTMLButtonElement | null) => void;
  onOpen: () => void;
  onFocus: () => void;
}) {
  const { locale, t } = useI18n();
  const dayLabel = useDayLabel(firstDay);
  const day = dayLabel(step.occurredAt);
  const photo = step.photos[0];

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onOpen}
      onFocus={onFocus}
      aria-description={t.tripScreen.openStep}
      className="flex h-[248px] w-full flex-col overflow-hidden rounded-[30px] bg-surface p-2 text-left shadow-float transition active:scale-[0.98]"
    >
      {photo && (
        <span className="relative block h-[104px] w-full shrink-0 overflow-hidden rounded-[22px] bg-surface-muted">
          <PhotoImg
            photo={photo}
            variant="medium"
            priority={priority}
            className="h-full w-full object-cover"
            sizes="440px"
          />
          {step.photos.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur">
              +{step.photos.length - 1}
            </span>
          )}
        </span>
      )}
      <span className="flex min-h-0 flex-1 flex-col px-2.5 pb-1 pt-2.5">
        <span className="block shrink-0 truncate text-[13px] font-semibold text-ink-soft">
          {day && (
            <>
              <span className="text-accent">{day}</span>
              {" · "}
            </>
          )}
          {formatWeekday(step.occurredAt, locale)}
        </span>
        <span className="block shrink-0 truncate text-[17px] font-semibold leading-snug">
          {step.placeName ?? formatDateShort(step.occurredAt, locale)}
        </span>
        {step.body && (
          <span
            className={`mt-0.5 min-h-0 overflow-hidden text-[14px] leading-snug text-ink-soft ${
              photo ? "line-clamp-2" : "line-clamp-5"
            }`}
          >
            {step.body}
          </span>
        )}
        <span className="mt-auto flex shrink-0 items-center gap-3.5 pt-1 text-[12px] font-medium text-ink-faint">
          {step.photos.length > 0 && (
            <span>{plural(t.counts.photos, step.photos.length)}</span>
          )}
          {step.comments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <CommentIcon className="h-3.5 w-3.5" />
              <span className="sr-only">{plural(t.story.commentCount, step.comments.length)}</span>
              <span aria-hidden="true">{step.comments.length}</span>
            </span>
          )}
          {viewCount !== undefined && (
            <span className="inline-flex items-center gap-1">
              <EyeIcon className="h-3.5 w-3.5" />
              <span className="sr-only">{plural(t.timeline.views, viewCount)}</span>
              <span aria-hidden="true">{viewCount}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
