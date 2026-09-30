"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewPhoto } from "@/lib/view-types";
import { useMediaBase } from "./media-context";

type Props = {
  photos: ViewPhoto[];
  startIndex: number;
  onClose: () => void;
};

type Zoom = { scale: number; x: number; y: number };

const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 4;
/** From this share of the screen width on, the next medium snaps in. */
const PAGE_THRESHOLD = 0.22;
/**
 * Height of the control bar the browser draws at the bottom of a video.
 * Gestures starting there belong to the video – otherwise every scrub turns
 * into paging.
 */
const CONTROLS_HEIGHT = 64;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function Lightbox({ photos, startIndex, onClose }: Props) {
  const base = useMediaBase();
  const [index, setIndex] = useState(startIndex);
  const [drag, setDrag] = useState(0);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [animated, setAnimated] = useState(true);

  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    startDistance: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    zoomStart: NO_ZOOM,
    moved: false,
    startedAt: 0,
    lastTap: 0,
    /**
     * Once two fingers were involved, there's neither paging nor tapping until
     * all fingers are lifted. Without this, the last finger lifted after a
     * zoom gesture was read as a swipe – the view then jumped to the next
     * image or out of the zoom.
     */
    wasPinch: false,
    /** Gesture in a video's control bar: ignore completely. */
    ignored: false,
  });

  const zoomed = zoom.scale > 1.01;
  const medium = photos[index];
  const isVideo = medium?.mediaType === "video";

  const flip = useCallback(
    (delta: number) => {
      setAnimated(true);
      setDrag(0);
      setZoom(NO_ZOOM);
      setIndex((current) => {
        const next = current + delta;
        if (next < 0 || next >= photos.length) return current;
        return next;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") flip(1);
      if (event.key === "ArrowLeft") flip(-1);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [flip, onClose]);

  /**
   * The browser must not zoom by itself in the fullscreen view. For photos the
   * app handles that; for videos it would be a dead end: the page zoom sits on
   * top of a `position: fixed` overlay that doesn't scroll along – you're then
   * stuck in a magnified section and only get out by reloading the page.
   *
   * Two paths lead there, both are closed here: pinching with two fingers (on
   * iOS via separate `gesture` events) and double-tapping. Single touches stay
   * untouched – they belong to the video's control bar.
   */
  useEffect(() => {
    const root = dialog.current;
    if (!root) return;

    const twoFingers = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const iosGesture = (event: Event) => event.preventDefault();

    root.addEventListener("touchmove", twoFingers, { passive: false });
    root.addEventListener("gesturestart", iosGesture);
    root.addEventListener("gesturechange", iosGesture);
    return () => {
      root.removeEventListener("touchmove", twoFingers);
      root.removeEventListener("gesturestart", iosGesture);
      root.removeEventListener("gesturechange", iosGesture);
    };
  }, []);

  /**
   * When switching, no video keeps playing in the background. The position
   * among the videos isn't the position in the media strip – photos can sit
   * between videos – so it's stored on the element.
   */
  useEffect(() => {
    stage.current
      ?.querySelectorAll<HTMLVideoElement>("video[data-pos]")
      .forEach((video) => {
        if (Number(video.dataset.pos) !== index) video.pause();
      });
  }, [index]);

  if (!medium) return null;

  function clamp(next: Zoom): Zoom {
    const scale = Math.min(Math.max(next.scale, 1), MAX_SCALE);
    if (scale <= 1.01) return NO_ZOOM;
    const slack = 400 * (scale - 1);
    return {
      scale,
      x: Math.min(Math.max(next.x, -slack), slack),
      y: Math.min(Math.max(next.y, -slack), slack),
    };
  }

  /** Is the point on the video's control bar? */
  function inControls(event: React.PointerEvent) {
    const video = (event.currentTarget as HTMLElement).querySelector("video");
    if (!video) return false;
    const box = video.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY > box.bottom - CONTROLS_HEIGHT &&
      event.clientY <= box.bottom
    );
  }

  function onPointerDown(event: React.PointerEvent) {
    const g = gesture.current;
    g.ignored = false;

    if (isVideo) {
      // Play, scrub, volume: the browser handles that itself. Pointer capture
      // would steal its events.
      if (inControls(event)) {
        g.ignored = true;
        return;
      }
    } else {
      try {
        (event.target as Element).setPointerCapture?.(event.pointerId);
      } catch {
        // Everything keeps working without capture.
      }
    }

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    g.moved = false;
    g.startedAt = Date.now();
    g.startX = event.clientX;
    g.startY = event.clientY;
    g.zoomStart = zoom;
    setAnimated(false);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.startDistance = distance(a, b);
      g.startScale = zoom.scale;
      g.wasPinch = true;
      setDrag(0);
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const g = gesture.current;
    if (g.ignored) return;
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      // Videos aren't zoomed – there's the fullscreen button for that.
      if (isVideo) return;
      const [a, b] = [...pointers.current.values()];
      if (g.startDistance > 0) {
        g.moved = true;
        setZoom(clamp({ ...zoom, scale: g.startScale * (distance(a, b) / g.startDistance) }));
      }
      return;
    }

    // After a zoom gesture the remaining finger has no effect.
    if (g.wasPinch) return;

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;

    if (zoomed) {
      setZoom(
        clamp({ scale: g.zoomStart.scale, x: g.zoomStart.x + dx, y: g.zoomStart.y + dy }),
      );
      return;
    }

    // The medium follows the finger, dampened at the ends.
    const atEdge =
      (index === 0 && dx > 0) || (index === photos.length - 1 && dx < 0);
    setDrag(atEdge ? dx * 0.3 : dx);
  }

  function onPointerUp(event: React.PointerEvent) {
    const g = gesture.current;
    if (g.ignored) {
      g.ignored = false;
      return;
    }

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    const duration = Date.now() - g.startedAt;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relative = (event.clientX - rect.left) / rect.width;

    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) g.startDistance = 0;

    // Only once all fingers are gone does a new gesture count again.
    if (pointers.current.size > 0) return;
    if (g.wasPinch) {
      g.wasPinch = false;
      setAnimated(true);
      setDrag(0);
      return;
    }

    setAnimated(true);

    if (zoomed) {
      // While zoomed: a short tap returns to the overview.
      if (!g.moved && duration < 250) setZoom(NO_ZOOM);
      return;
    }

    // Swiping down closes.
    if (g.moved && dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      setDrag(0);
      onClose();
      return;
    }

    if (g.moved) {
      const threshold = window.innerWidth * PAGE_THRESHOLD;
      if (Math.abs(dx) > threshold) flip(dx < 0 ? 1 : -1);
      else setDrag(0);
      return;
    }

    // For videos a tap is reserved for playback: moving on works by swiping
    // or via the arrows there.
    if (isVideo) return;

    // Two short taps zoom in.
    const now = Date.now();
    if (duration < 250 && now - g.lastTap < 300) {
      g.lastTap = 0;
      setZoom(clamp({ scale: 2.5, x: 0, y: 0 }));
      return;
    }
    g.lastTap = now;

    // Single tap: left third goes back, otherwise forward.
    window.setTimeout(() => {
      if (gesture.current.lastTap !== now) return;
      flip(relative < 0.33 ? -1 : 1);
    }, 260);
  }

  return (
    /**
     * `100svh` instead of `inset-0`: on phones `inset-0` uses the viewport
     * without the address bar. The bottom edge – and with it the caption –
     * then sat behind the browser bar.
     */
    <div
      ref={dialog}
      className="ownsteps-lightbox fixed inset-x-0 top-0 z-[100] flex h-[100svh] flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Medien"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white/80">
        <span className="text-sm tabular-nums">
          {zoomed ? (
            <button
              type="button"
              onClick={() => setZoom(NO_ZOOM)}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold transition hover:bg-white/20"
            >
              Zoom zurücksetzen
            </button>
          ) : (
            `${index + 1} / ${photos.length}`
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          aria-label="Schließen"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* All media sit side by side; the whole row is shifted. */}
      <div ref={stage} className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${drag}px))`,
            transition: animated
              ? "transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)"
              : "none",
          }}
        >
          {photos.map((item, i) => {
            const active = i === index;
            const video = item.mediaType === "video";
            return (
              /**
               * The gesture hangs on the frame, not the medium: for videos the
               * browser's control bar sits on top, where any pointer capture
               * of our own fails.
               */
              <div
                key={item.id}
                className="flex h-full w-full shrink-0 items-center justify-center px-2"
                /*
                 * For videos `touch-action` deliberately stays generous,
                 * otherwise the browser's control bar loses its gestures;
                 * `manipulation` only takes away the double-tap zoom.
                 */
                style={{ touchAction: video ? "manipulation" : "none" }}
                onPointerDown={active ? onPointerDown : undefined}
                onPointerMove={active ? onPointerMove : undefined}
                onPointerUp={active ? onPointerUp : undefined}
                onPointerCancel={active ? onPointerUp : undefined}
              >
                {video ? (
                  <video
                    data-pos={i}
                    src={`${base}/${item.id}/video`}
                    poster={`${base}/${item.id}/medium`}
                    controls
                    playsInline
                    preload={active ? "metadata" : "none"}
                    className="max-h-full max-w-full"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${base}/${item.id}/large`}
                    alt={item.caption ?? ""}
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain"
                    style={
                      active
                        ? {
                            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                            transition: animated ? "transform 0.2s ease-out" : "none",
                            cursor: zoomed ? "grab" : "pointer",
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {medium.caption && (
        <div
          className="shrink-0 px-5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        >
          <p className="mx-auto max-w-2xl text-center text-[15px] leading-relaxed text-white/90">
            {medium.caption}
          </p>
        </div>
      )}

      {photos.length > 1 && (
        <>
          {/*
            For videos the arrows are visible on every device: a tap belongs
            to playback there, so it can't page onwards.
          */}
          <button
            type="button"
            aria-label="Vorheriges Medium"
            disabled={index === 0}
            className={`absolute left-2 top-1/2 h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-25 sm:grid ${
              isVideo ? "grid" : "hidden"
            }`}
            onClick={() => flip(-1)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Nächstes Medium"
            disabled={index === photos.length - 1}
            className={`absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-25 sm:grid ${
              isVideo ? "grid" : "hidden"
            }`}
            onClick={() => flip(1)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
