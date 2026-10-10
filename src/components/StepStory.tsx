"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatWeekday, formatWeekdayYear } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { fill, plural } from "@/lib/i18n/text";
import type { ViewStep } from "@/lib/view-types";
import CommentSection from "./CommentSection";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  CommentIcon,
  ExpandIcon,
  EyeIcon,
  MapIcon,
} from "./icons";
import Lightbox from "./Lightbox";
import { useMediaBase } from "./media-context";
import Sheet from "./Sheet";
import StoryVideo from "./StoryVideo";
import { useDayLabel } from "./trip-day";
import { usePrefersReducedMotion } from "./use-media-query";

type Props = {
  tripId: number;
  /** Chronological, like everywhere but the desktop timeline ([E13]). */
  steps: ViewStep[];
  firstDay: number | null;
  startStepId: number;
  editable: boolean;
  shareToken?: string;
  viewCounts?: Record<number, number>;
  /** The step in view changed – the page keeps the URL and the cards in step. */
  onStepChange: (stepId: number) => void;
  onClose: (stepId: number) => void;
  onShowOnMap: (stepId: number) => void;
};

type SheetRequest = { kind: "comments" | "text"; stepId: number };

/**
 * The steps as stories, like the apps (D29): one step per screen, stacked
 * like reels – swiping up brings the next step, so moving on to another day
 * is a real scroll and not just another photo. A step's photos page sideways;
 * a tap on the left third goes back, elsewhere on. Day and place sit at the
 * top, the text at the bottom, the photo between them, never under them.
 *
 * A modal `<dialog>`: it takes the whole screen, keeps focus inside and
 * closes on Escape. Only the step in view and its neighbors are rendered.
 */
export default function StepStory({
  tripId,
  steps,
  firstDay,
  startStepId,
  editable,
  shareToken,
  viewCounts,
  onStepChange,
  onClose,
  onShowOnMap,
}: Props) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const pager = useRef<HTMLDivElement>(null);
  const photoPagers = useRef(new Map<number, HTMLDivElement>());
  const startIndex = Math.max(0, steps.findIndex((step) => step.id === startStepId));
  const [current, setCurrent] = useState(startIndex);
  const [photoIndex, setPhotoIndex] = useState<Record<number, number>>({});
  /** Shared by all videos of the story, like the apps: on stays on. */
  const [muted, setMuted] = useState(true);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [lightbox, setLightbox] = useState<{ stepId: number; index: number } | null>(null);
  /** The lightbox handles Escape itself; the story must not close with it. */
  const lightboxOpen = useRef(false);
  const currentRef = useRef(current);
  currentRef.current = current;
  const currentStep = steps[current];
  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // Opened at the tapped step, without scrolling past the ones before it.
    if (pager.current) pager.current.scrollTop = startIndex * pager.current.clientHeight;
    return () => element.close();
    // Opened once; paging happens inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentStep) onStepChange(currentStep.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id]);

  // A rotation changes the page height; stay on the same step.
  useEffect(() => {
    const element = pager.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      element.scrollTop = currentRef.current * element.clientHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The step was deleted while open (the author's page refreshes its data).
  useEffect(() => {
    if (steps.length === 0) onClose(startStepId);
    else if (current >= steps.length) setCurrent(steps.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  const frame = useRef(0);
  function onPagerScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const element = pager.current;
      if (!element || element.clientHeight === 0) return;
      const index = Math.round(element.scrollTop / element.clientHeight);
      if (index !== currentRef.current && index >= 0 && index < steps.length) setCurrent(index);
    });
  }

  function goToStep(index: number) {
    const element = pager.current;
    if (!element || index < 0 || index >= steps.length) return;
    element.scrollTo({ top: index * element.clientHeight, behavior });
  }

  function photoOf(step: ViewStep) {
    return Math.min(photoIndex[step.id] ?? 0, Math.max(step.photos.length - 1, 0));
  }

  function goToPhoto(step: ViewStep, index: number) {
    if (index < 0 || index >= step.photos.length) return;
    const element = photoPagers.current.get(step.id);
    if (element) element.scrollTo({ left: index * element.clientWidth, behavior });
    setPhotoIndex((all) => ({ ...all, [step.id]: index }));
  }

  function onPhotoScroll(step: ViewStep, element: HTMLDivElement) {
    if (element.clientWidth === 0) return;
    const index = Math.round(element.scrollLeft / element.clientWidth);
    if (index !== photoOf(step)) setPhotoIndex((all) => ({ ...all, [step.id]: index }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    const target = event.target as HTMLElement;
    // Typing a comment, or something open above the story, keeps its keys.
    if (sheet || lightbox || target.closest("input, textarea, select, [contenteditable]")) return;
    if (!currentStep) return;
    const keys: Record<string, () => void> = {
      ArrowDown: () => goToStep(current + 1),
      PageDown: () => goToStep(current + 1),
      ArrowUp: () => goToStep(current - 1),
      PageUp: () => goToStep(current - 1),
      ArrowRight: () => goToPhoto(currentStep, photoOf(currentStep) + 1),
      ArrowLeft: () => goToPhoto(currentStep, photoOf(currentStep) - 1),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  const sheetStep = sheet ? steps.find((step) => step.id === sheet.stepId) : undefined;
  const lightboxStep = lightbox ? steps.find((step) => step.id === lightbox.stepId) : undefined;

  return (
    <dialog
      ref={dialog}
      aria-label={t.story.label}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        // React passes a sheet's cancel up its tree, although the DOM event
        // doesn't bubble: Escape in a sheet closes only the sheet.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!lightboxOpen.current) onClose(currentStep?.id ?? startStepId);
      }}
      className="story m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black p-0 text-white backdrop:bg-black"
    >
      <div
        ref={pager}
        onScroll={onPagerScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, index) => (
          <section
            key={step.id}
            aria-labelledby={`story-step-${step.id}`}
            className="relative h-full snap-start snap-always overflow-hidden"
          >
            {Math.abs(index - current) <= 1 && (
              <StoryPage
                step={step}
                firstDay={firstDay}
                photo={photoOf(step)}
                isCurrent={index === current && !lightbox}
                editable={editable}
                tripId={tripId}
                viewCount={viewCounts ? (viewCounts[step.id] ?? 0) : undefined}
                muted={muted}
                onToggleSound={() => setMuted((value) => !value)}
                onSoundBlocked={() => setMuted(true)}
                pagerRef={(element) => {
                  if (element) photoPagers.current.set(step.id, element);
                  else photoPagers.current.delete(step.id);
                }}
                onPhotoScroll={(element) => onPhotoScroll(step, element)}
                goToPhoto={(target) => goToPhoto(step, target)}
                openSheet={(kind) => setSheet({ kind, stepId: step.id })}
                onShowOnMap={() => onShowOnMap(step.id)}
                openLightbox={() => {
                  lightboxOpen.current = true;
                  setLightbox({ stepId: step.id, index: photoOf(step) });
                }}
              />
            )}
          </section>
        ))}
      </div>

      {/* Over every page: closing, and the arrows for mouse and keyboard. */}
      <button
        type="button"
        onClick={() => onClose(currentStep?.id ?? startStepId)}
        aria-label={t.story.close}
        className="absolute right-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/35 backdrop-blur"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => goToStep(current - 1)}
          disabled={current === 0}
          aria-label={t.story.previousStep}
          className="touch-sr-only grid h-10 w-10 place-items-center rounded-full bg-black/35 backdrop-blur transition disabled:opacity-30"
        >
          <ChevronUpIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => goToStep(current + 1)}
          disabled={current >= steps.length - 1}
          aria-label={t.story.nextStep}
          className="touch-sr-only grid h-10 w-10 place-items-center rounded-full bg-black/35 backdrop-blur transition disabled:opacity-30"
        >
          <ChevronDownIcon className="h-5 w-5" />
        </button>
      </div>

      <Sheet
        open={sheet?.kind === "comments" && !!sheetStep}
        onClose={() => setSheet(null)}
        title={t.story.comments}
      >
        {sheetStep && (
          // The sheet's heading already separates; no rule above the list.
          <div className="pb-4 [&>section]:mt-1 [&>section]:border-t-0">
            {sheetStep.comments.length === 0 && (
              <p className="pt-2 text-[15px] text-ink-soft">{t.story.noComments}</p>
            )}
            <CommentSection
              key={sheetStep.id}
              tripId={tripId}
              stepId={sheetStep.id}
              shareToken={shareToken}
              comments={sheetStep.comments}
              canDelete={editable}
            />
          </div>
        )}
      </Sheet>

      <Sheet
        open={sheet?.kind === "text" && !!sheetStep}
        onClose={() => setSheet(null)}
        label={sheetStep?.placeName ?? t.story.readMore}
      >
        {sheetStep && <StepText step={sheetStep} firstDay={firstDay} />}
      </Sheet>

      {lightbox && lightboxStep && (
        <Lightbox
          photos={lightboxStep.photos}
          startIndex={lightbox.index}
          onClose={() => {
            setLightbox(null);
            // Escape reaches the story after the lightbox heard it.
            window.setTimeout(() => {
              lightboxOpen.current = false;
            }, 0);
          }}
        />
      )}
    </dialog>
  );
}

/** One step: top, photos (or the text as the picture), bottom. */
function StoryPage({
  step,
  firstDay,
  photo,
  isCurrent,
  editable,
  tripId,
  viewCount,
  muted,
  onToggleSound,
  onSoundBlocked,
  pagerRef,
  onPhotoScroll,
  goToPhoto,
  openSheet,
  onShowOnMap,
  openLightbox,
}: {
  step: ViewStep;
  firstDay: number | null;
  photo: number;
  isCurrent: boolean;
  editable: boolean;
  tripId: number;
  viewCount?: number;
  muted: boolean;
  onToggleSound: () => void;
  onSoundBlocked: () => void;
  pagerRef: (element: HTMLDivElement | null) => void;
  onPhotoScroll: (element: HTMLDivElement) => void;
  goToPhoto: (index: number) => void;
  openSheet: (kind: SheetRequest["kind"]) => void;
  onShowOnMap: () => void;
  openLightbox: () => void;
}) {
  const { locale, t } = useI18n();
  const base = useMediaBase();
  const dayLabel = useDayLabel(firstDay);
  const day = dayLabel(step.occurredAt);
  const hasPhotos = step.photos.length > 0;
  const shown = step.photos[photo];
  const located = step.lat !== null && step.lon !== null;
  const pagerElement = useRef<HTMLDivElement | null>(null);

  // Rendered again after paging away and back: land on the photo it was at.
  useLayoutEffect(() => {
    const element = pagerElement.current;
    if (element && photo > 0) element.scrollLeft = photo * element.clientWidth;
    // Only on mounting; afterwards scrolling moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tapPhoto(event: React.MouseEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    goToPhoto(event.clientX - box.left < box.width / 3 ? photo - 1 : photo + 1);
  }

  return (
    <>
      {/* The shown photo, blurred, behind everything – or a calm color for text. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shown.id}
            src={`${base}/${shown.id}/thumb`}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-55 blur-2xl"
          />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-sea to-black" />
        )}
      </div>

      <div
        className="relative flex h-full flex-col"
        style={
          {
            // Text keeps a reading width on tablets; the photos take it all.
            "--story-gutter": "max(1.25rem, calc(50% - 24rem))",
          } as React.CSSProperties
        }
      >
        {/* The safe areas are padding of header and footer, not of the page:
            their shades must reach the screen's edges, or a lighter strip
            stays above the home indicator. */}
        <header
          className="bg-linear-to-b from-black/60 to-transparent px-(--story-gutter) pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          {step.photos.length > 1 && (
            <div aria-hidden="true" className="mb-3 mr-12 flex gap-1">
              {step.photos.map((item, index) => (
                <span
                  key={item.id}
                  className={`h-[3px] flex-1 rounded-full transition ${
                    index <= photo ? "bg-white/95" : "bg-white/35"
                  }`}
                />
              ))}
            </div>
          )}
          <div className="pr-12 [text-shadow:0_1px_4px_rgb(0_0_0/0.35)]">
            <p className="text-[14px] font-semibold text-white/85">
              {day && (
                <>
                  <span className="text-accent">{day}</span>
                  {" · "}
                </>
              )}
              {formatWeekday(step.occurredAt, locale)}
            </p>
            <h2
              id={`story-step-${step.id}`}
              className="line-clamp-2 text-2xl font-bold leading-tight tracking-tight"
            >
              {step.placeName ?? formatWeekday(step.occurredAt, locale)}
            </h2>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {hasPhotos ? (
            <div
              ref={(element) => {
                pagerElement.current = element;
                pagerRef(element);
              }}
              onScroll={(event) => onPhotoScroll(event.currentTarget)}
              className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {step.photos.map((item, index) => {
                const label =
                  item.caption?.trim() ||
                  fill(item.mediaType === "video" ? t.story.video : t.story.photo, {
                    index: index + 1,
                    count: step.photos.length,
                  });
                return (
                  <figure
                    key={item.id}
                    onClick={tapPhoto}
                    // Photo and caption as one group in the middle: the caption
                    // stays right under its photo, like under a print.
                    className="flex h-full w-full shrink-0 snap-center snap-always flex-col justify-center gap-3 pb-1"
                  >
                    {item.mediaType === "video" ? (
                      <div
                        className="relative min-h-0 w-full"
                        style={{ aspectRatio: `${item.width || 16} / ${item.height || 9}` }}
                      >
                        <StoryVideo
                          video={item}
                          label={label}
                          active={isCurrent && index === photo}
                          muted={muted}
                          onToggleSound={onToggleSound}
                          onSoundBlocked={onSoundBlocked}
                          onEdgeTap={(forward) => goToPhoto(forward ? photo + 1 : photo - 1)}
                        />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${base}/${item.id}/large`}
                        alt={label}
                        width={item.width}
                        height={item.height}
                        loading={Math.abs(index - photo) <= 1 ? "eager" : "lazy"}
                        // Shrinks to what's left when the photo is tall.
                        className="min-h-0 w-full object-contain"
                      />
                    )}
                    {item.caption?.trim() && (
                      // The photo's own note, set like a caption under a print.
                      <figcaption className="line-clamp-4 px-(--story-gutter) text-[15px] italic text-white/90">
                        {item.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          ) : (
            // No photos: the text is the picture, as large as it fits.
            <div className="flex h-full items-center justify-center px-8">
              {step.body && (
                <ClampedText
                  text={step.body}
                  lines="line-clamp-[10]"
                  onMore={() => openSheet("text")}
                  className="text-center text-xl font-semibold leading-relaxed"
                />
              )}
            </div>
          )}

          {step.photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goToPhoto(photo - 1)}
                disabled={photo === 0}
                aria-label={t.story.previousPhoto}
                className="touch-sr-only absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 backdrop-blur transition disabled:opacity-0"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goToPhoto(photo + 1)}
                disabled={photo >= step.photos.length - 1}
                aria-label={t.story.nextPhoto}
                className="touch-sr-only absolute right-16 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 backdrop-blur transition disabled:opacity-0"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <footer
          className="bg-linear-to-t from-black/50 to-transparent px-(--story-gutter) pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          {hasPhotos && step.body && (
            <ClampedText
              text={step.body}
              lines="line-clamp-3"
              onMore={() => openSheet("text")}
              className="text-[16px] leading-relaxed text-white/90"
            />
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => openSheet("comments")}
              aria-label={plural(t.story.commentCount, step.comments.length)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-4 text-sm font-semibold backdrop-blur"
            >
              <CommentIcon />
              {step.comments.length}
            </button>
            {located && (
              <button
                type="button"
                onClick={onShowOnMap}
                aria-label={t.story.showOnMap}
                title={t.story.showOnMap}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-white/15 backdrop-blur"
              >
                <MapIcon />
              </button>
            )}
            {hasPhotos && (
              <button
                type="button"
                onClick={openLightbox}
                aria-label={t.story.fullScreen}
                title={t.story.fullScreen}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-white/15 backdrop-blur"
              >
                <ExpandIcon />
              </button>
            )}
            <span className="flex-1" />
            {viewCount !== undefined && (
              <span
                title={t.timeline.viewsHint}
                className="inline-flex items-center gap-1 text-sm text-white/80"
              >
                <EyeIcon />
                <span className="sr-only">{plural(t.timeline.views, viewCount)}</span>
                <span aria-hidden="true">{viewCount}</span>
              </span>
            )}
            {editable && (
              <Link
                href={`/trips/${tripId}/steps/${step.id}`}
                className="inline-flex h-10 items-center rounded-full border border-white/20 bg-white/15 px-4 text-sm font-semibold backdrop-blur"
              >
                {t.timeline.edit}
              </Link>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}

/**
 * Text cut to a few lines. When anything was cut, it ends in a bold "more"
 * and the whole text opens in a sheet – like captions in Instagram or the
 * apps.
 */
function ClampedText({
  text,
  lines,
  onMore,
  className,
}: {
  text: string;
  /** A complete `line-clamp-*` class, so Tailwind sees it. */
  lines: string;
  onMore: () => void;
  className: string;
}) {
  const { t } = useI18n();
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="[text-shadow:0_1px_4px_rgb(0_0_0/0.35)]">
      <p ref={paragraph} className={`${lines} ${className}`}>
        {text}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={onMore}
          aria-label={t.story.readMore}
          className="mt-1 text-[15px] font-bold text-white"
        >
          … {t.story.more}
        </button>
      )}
    </div>
  );
}

/** A step's whole text, to read at length – on a solid surface. */
function StepText({ step, firstDay }: { step: ViewStep; firstDay: number | null }) {
  const { locale } = useI18n();
  const dayLabel = useDayLabel(firstDay);
  const day = dayLabel(step.occurredAt);
  return (
    <article className="pb-8 pt-2">
      <p className="text-[14px] font-semibold text-ink-soft">
        {day && (
          <>
            <span className="text-accent">{day}</span>
            {" · "}
          </>
        )}
        {formatWeekdayYear(step.occurredAt, locale)}
      </p>
      {step.placeName && (
        <h2 className="mt-1 text-3xl font-bold leading-tight tracking-tight">{step.placeName}</h2>
      )}
      <p className="mt-4 whitespace-pre-wrap text-[17px] leading-relaxed">{step.body}</p>
    </article>
  );
}
