"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { ViewPhoto } from "@/lib/view-types";
import { PlayIcon, SoundOffIcon, SoundOnIcon } from "./icons";
import { useMediaBase } from "./media-context";
import { usePrefersReducedMotion } from "./use-media-query";

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * A video as in the apps' stories: it plays by itself, muted and looping,
 * while it's the page in view, and stops when paged away or when the tab is
 * hidden. No browser controls – a tap switches the sound (for all videos of
 * the story, like the apps), a thin bar shows the position, and "full
 * screen" in the story opens the lightbox with the browser's controls for
 * scrubbing. Taps on the outer fifths page instead. With reduced motion
 * asked for, the poster waits with a play button instead of autoplay.
 */
export default function StoryVideo({
  video,
  label,
  active,
  muted,
  onToggleSound,
  onSoundBlocked,
  onEdgeTap,
}: {
  video: ViewPhoto;
  /** "Video 2 of 5" or the caption. */
  label: string;
  /** The page in view – only that one plays. */
  active: boolean;
  muted: boolean;
  onToggleSound: () => void;
  /** The browser refused to play with sound; the story falls back to muted. */
  onSoundBlocked: () => void;
  onEdgeTap: (forward: boolean) => void;
}) {
  const base = useMediaBase();
  const { t } = useI18n();
  const element = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const pageVisible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
  /** Without autoplay: the play button was pressed on this page. */
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(0);

  const waitsForPlay = reducedMotion && !started;
  const shouldPlay = active && pageVisible && !waitsForPlay;

  // Paged away: next time it starts over, and asks again without autoplay.
  useEffect(() => {
    if (active) return;
    setStarted(false);
    const media = element.current;
    if (media) media.currentTime = 0;
  }, [active]);

  // React doesn't keep the `muted` attribute in sync; the property is set here.
  useEffect(() => {
    if (element.current) element.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const media = element.current;
    if (!media) return;
    if (!shouldPlay) {
      media.pause();
      return;
    }
    media.muted = muted;
    media.play().catch(() => {
      // Sound without a fresh tap is up to the browser; muted always works.
      if (!media.muted) {
        onSoundBlocked();
        media.muted = true;
        void media.play().catch(() => {});
      }
    });
    // `muted` is synced above; replaying on every sound switch would restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay]);

  // The indicator shows briefly after each switch.
  useEffect(() => {
    if (flash === 0) return;
    const timer = window.setTimeout(() => setFlash(0), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function tap(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    // Keyboard presses carry no position (detail 0) and mean the button itself.
    if (event.detail > 0) {
      const box = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      if (x < 0.2 || x > 0.8) {
        onEdgeTap(x > 0.8);
        return;
      }
    }
    if (waitsForPlay) {
      setStarted(true);
      return;
    }
    // Switched right here, inside the tap: Safari only allows sound then.
    const media = element.current;
    if (media) {
      media.muted = !muted;
      if (media.paused) void media.play().catch(() => {});
    }
    onToggleSound();
    setFlash((n) => n + 1);
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={element}
        src={`${base}/${video.id}/video`}
        poster={`${base}/${video.id}/large`}
        muted
        loop
        playsInline
        preload="metadata"
        disableRemotePlayback
        onTimeUpdate={(event) => {
          const media = event.currentTarget;
          if (media.duration > 0) setProgress(media.currentTime / media.duration);
        }}
        className="h-full w-full object-contain"
      />
      <button
        type="button"
        onClick={tap}
        aria-label={`${label} – ${waitsForPlay ? t.story.play : muted ? t.story.soundOn : t.story.soundOff}`}
        className="absolute inset-0 grid place-items-center"
      >
        {waitsForPlay ? (
          <span className="grid h-[72px] w-[72px] place-items-center rounded-full border border-white/25 bg-black/35 backdrop-blur">
            <PlayIcon className="ml-1 h-8 w-8 fill-white" />
          </span>
        ) : (
          flash > 0 && (
            <span className="grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-black/35 backdrop-blur">
              {muted ? <SoundOffIcon className="h-6 w-6" /> : <SoundOnIcon className="h-6 w-6" />}
            </span>
          )
        )}
      </button>
      {!waitsForPlay && (
        <>
          {/* Lasting hint in the corner whether sound is on. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/40"
          >
            {muted ? <SoundOffIcon className="h-4 w-4" /> : <SoundOnIcon className="h-4 w-4" />}
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 bottom-0 h-[3px] overflow-hidden rounded-full bg-white/25"
          >
            <span
              className="block h-full bg-white/90"
              style={{ width: `${Math.round(progress * 1000) / 10}%` }}
            />
          </span>
        </>
      )}
    </div>
  );
}
