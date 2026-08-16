"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewPhoto } from "@/lib/view-types";

type Props = {
  photos: ViewPhoto[];
  startIndex: number;
  onClose: () => void;
};

type Zoom = { scale: number; x: number; y: number };

const OHNE_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 4;
/** Ab diesem Anteil der Bildschirmbreite rastet das nächste Medium ein. */
const BLAETTER_SCHWELLE = 0.22;

function abstand(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function Lightbox({ photos, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [zug, setZug] = useState(0);
  const [zoom, setZoom] = useState<Zoom>(OHNE_ZOOM);
  const [animiert, setAnimiert] = useState(true);

  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const geste = useRef({
    startAbstand: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    zoomStart: OHNE_ZOOM,
    bewegt: false,
    beginn: 0,
    letzterTipp: 0,
    /**
     * Sobald zwei Finger im Spiel waren, wird bis zum Loslassen aller Finger
     * weder geblättert noch getippt. Ohne das wurde der zuletzt gehobene
     * Finger einer Zoom-Geste als Wischen gedeutet – die Ansicht sprang dann
     * ins nächste Bild oder aus dem Zoom heraus.
     */
    warPinch: false,
  });

  const gezoomt = zoom.scale > 1.01;
  const medium = photos[index];

  const blaettern = useCallback(
    (delta: number) => {
      setAnimiert(true);
      setZug(0);
      setZoom(OHNE_ZOOM);
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
      if (event.key === "ArrowRight") blaettern(1);
      if (event.key === "ArrowLeft") blaettern(-1);
    };
    window.addEventListener("keydown", onKey);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = vorher;
    };
  }, [blaettern, onClose]);

  // Beim Wechsel läuft kein Video im Hintergrund weiter.
  useEffect(() => {
    document.querySelectorAll<HTMLVideoElement>(".ownsteps-lightbox video")
      .forEach((video, i) => {
        if (i !== index) video.pause();
      });
  }, [index]);

  if (!medium) return null;

  function begrenze(next: Zoom): Zoom {
    const scale = Math.min(Math.max(next.scale, 1), MAX_SCALE);
    if (scale <= 1.01) return OHNE_ZOOM;
    const spielraum = 400 * (scale - 1);
    return {
      scale,
      x: Math.min(Math.max(next.x, -spielraum), spielraum),
      y: Math.min(Math.max(next.y, -spielraum), spielraum),
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // Ohne Capture funktioniert alles weiter.
    }
    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const g = geste.current;
    g.bewegt = false;
    g.beginn = Date.now();
    g.startX = event.clientX;
    g.startY = event.clientY;
    g.zoomStart = zoom;
    setAnimiert(false);

    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()];
      g.startAbstand = abstand(a, b);
      g.startScale = zoom.scale;
      g.warPinch = true;
      setZug(0);
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!zeiger.current.has(event.pointerId)) return;
    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = geste.current;

    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()];
      if (g.startAbstand > 0) {
        g.bewegt = true;
        setZoom(begrenze({ ...zoom, scale: g.startScale * (abstand(a, b) / g.startAbstand) }));
      }
      return;
    }

    // Nach einer Zoom-Geste bleibt der verbliebene Finger wirkungslos.
    if (g.warPinch) return;

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.bewegt = true;

    if (gezoomt) {
      setZoom(
        begrenze({ scale: g.zoomStart.scale, x: g.zoomStart.x + dx, y: g.zoomStart.y + dy }),
      );
      return;
    }

    // Das Medium wandert mit dem Finger, an den Enden gebremst.
    const amRand =
      (index === 0 && dx > 0) || (index === photos.length - 1 && dx < 0);
    setZug(amRand ? dx * 0.3 : dx);
  }

  function onPointerUp(event: React.PointerEvent) {
    const g = geste.current;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    const dauer = Date.now() - g.beginn;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relativ = (event.clientX - rect.left) / rect.width;

    zeiger.current.delete(event.pointerId);
    if (zeiger.current.size < 2) g.startAbstand = 0;

    // Erst wenn alle Finger weg sind, zählt wieder eine neue Geste.
    if (zeiger.current.size > 0) return;
    if (g.warPinch) {
      g.warPinch = false;
      setAnimiert(true);
      setZug(0);
      return;
    }

    setAnimiert(true);

    if (gezoomt) {
      // Im Zoom: kurzer Tipp holt zurück auf die Übersicht.
      if (!g.bewegt && dauer < 250) setZoom(OHNE_ZOOM);
      return;
    }

    // Nach unten wischen schließt.
    if (g.bewegt && dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      setZug(0);
      onClose();
      return;
    }

    if (g.bewegt) {
      const schwelle = window.innerWidth * BLAETTER_SCHWELLE;
      if (Math.abs(dx) > schwelle) blaettern(dx < 0 ? 1 : -1);
      else setZug(0);
      return;
    }

    // Zwei kurze Tipps zoomen hinein.
    const jetzt = Date.now();
    if (dauer < 250 && jetzt - g.letzterTipp < 300) {
      g.letzterTipp = 0;
      setZoom(begrenze({ scale: 2.5, x: 0, y: 0 }));
      return;
    }
    g.letzterTipp = jetzt;

    // Einfacher Tipp: linkes Drittel zurück, sonst weiter.
    window.setTimeout(() => {
      if (geste.current.letzterTipp !== jetzt) return;
      blaettern(relativ < 0.33 ? -1 : 1);
    }, 260);
  }

  return (
    <div
      className="ownsteps-lightbox fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Medien"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white/80">
        <span className="text-sm tabular-nums">
          {gezoomt ? (
            <button
              type="button"
              onClick={() => setZoom(OHNE_ZOOM)}
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

      {/* Alle Medien liegen nebeneinander; verschoben wird die ganze Reihe. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${zug}px))`,
            transition: animiert
              ? "transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)"
              : "none",
          }}
        >
          {photos.map((eintrag, i) => (
            <div
              key={eintrag.id}
              className="flex h-full w-full shrink-0 items-center justify-center px-2"
            >
              {eintrag.mediaType === "video" ? (
                <video
                  src={`/api/photos/${eintrag.id}/video`}
                  poster={`/api/photos/${eintrag.id}/medium`}
                  controls
                  playsInline
                  preload={i === index ? "metadata" : "none"}
                  className="max-h-full max-w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/photos/${eintrag.id}/large`}
                  alt={eintrag.caption ?? ""}
                  draggable={false}
                  className="max-h-full max-w-full touch-none select-none object-contain"
                  style={
                    i === index
                      ? {
                          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                          transition: animiert ? "transform 0.2s ease-out" : "none",
                          cursor: gezoomt ? "grab" : "pointer",
                        }
                      : undefined
                  }
                  onPointerDown={i === index ? onPointerDown : undefined}
                  onPointerMove={i === index ? onPointerMove : undefined}
                  onPointerUp={i === index ? onPointerUp : undefined}
                  onPointerCancel={i === index ? onPointerUp : undefined}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {medium.caption && (
        <div className="shrink-0 px-5 pb-6 pt-3">
          <p className="mx-auto max-w-2xl text-center text-[15px] leading-relaxed text-white/90">
            {medium.caption}
          </p>
        </div>
      )}

      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Vorheriges Medium"
            disabled={index === 0}
            className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-25 sm:grid"
            onClick={() => blaettern(-1)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Nächstes Medium"
            disabled={index === photos.length - 1}
            className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-25 sm:grid"
            onClick={() => blaettern(1)}
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
