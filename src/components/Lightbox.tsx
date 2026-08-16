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

function abstand(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function Lightbox({ photos, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState<Zoom>(OHNE_ZOOM);
  // Während eine Geste läuft, soll das Bild dem Finger ohne Nachlauf folgen.
  const [inGeste, setInGeste] = useState(false);

  // Alle laufenden Finger; ab zwei davon wird gezoomt statt geblättert.
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
  });

  const gezoomt = zoom.scale > 1.01;

  const blaettern = useCallback(
    (delta: number) => {
      setZoom(OHNE_ZOOM);
      setIndex((current) => {
        const next = current + delta;
        if (next < 0) return photos.length - 1;
        if (next >= photos.length) return 0;
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

  const photo = photos[index];
  if (!photo) return null;

  function begrenze(next: Zoom): Zoom {
    const scale = Math.min(Math.max(next.scale, 1), MAX_SCALE);
    if (scale <= 1.01) return OHNE_ZOOM;
    // Grob im Rahmen halten, damit das Bild nicht aus dem Blick rutscht.
    const spielraum = 400 * (scale - 1);
    return {
      scale,
      x: Math.min(Math.max(next.x, -spielraum), spielraum),
      y: Math.min(Math.max(next.y, -spielraum), spielraum),
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    // Darf fehlschlagen (etwa bei Pointern, die der Browser nicht mehr kennt)
    // und würde sonst die gesamte Gestenerkennung mit sich reißen.
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // Ohne Capture funktioniert alles weiter, nur außerhalb des Bildes
      // endende Gesten gehen verloren.
    }
    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setInGeste(true);

    const g = geste.current;
    g.bewegt = false;
    g.beginn = Date.now();
    g.startX = event.clientX;
    g.startY = event.clientY;
    g.zoomStart = zoom;

    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()];
      g.startAbstand = abstand(a, b);
      g.startScale = zoom.scale;
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
        const faktor = abstand(a, b) / g.startAbstand;
        setZoom((z) => begrenze({ ...z, scale: g.startScale * faktor }));
      }
      return;
    }

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.bewegt = true;

    // Nur im gezoomten Zustand wird das Bild verschoben; sonst bleibt die
    // Wischgeste fürs Blättern reserviert.
    if (gezoomt) {
      setZoom(
        begrenze({
          scale: g.zoomStart.scale,
          x: g.zoomStart.x + dx,
          y: g.zoomStart.y + dy,
        }),
      );
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const g = geste.current;
    const dx = event.clientX - g.startX;
    const dauer = Date.now() - g.beginn;
    const warEinzeln = zeiger.current.size === 1;
    // Maße jetzt festhalten – im setTimeout weiter unten ist das Event weg.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relativ = (event.clientX - rect.left) / rect.width;

    zeiger.current.delete(event.pointerId);
    if (zeiger.current.size < 2) g.startAbstand = 0;
    if (zeiger.current.size === 0) setInGeste(false);
    if (!warEinzeln) return;

    // Wischen blättert – aber nur, solange nicht gezoomt ist.
    if (!gezoomt && g.bewegt && Math.abs(dx) > 50) {
      blaettern(dx < 0 ? 1 : -1);
      return;
    }
    if (g.bewegt) return;

    // Zwei kurze Tipps hintereinander zoomen hinein und wieder heraus.
    const jetzt = Date.now();
    if (dauer < 250 && jetzt - g.letzterTipp < 300) {
      g.letzterTipp = 0;
      setZoom((z) => (z.scale > 1.01 ? OHNE_ZOOM : begrenze({ scale: 2.5, x: 0, y: 0 })));
      return;
    }
    g.letzterTipp = jetzt;

    if (gezoomt) return;

    // Einfacher Tipp: linkes Drittel zurück, sonst weiter. Kurz abwarten,
    // damit ein zweiter Tipp noch als Doppeltipp durchgehen kann.
    window.setTimeout(() => {
      if (geste.current.letzterTipp !== jetzt) return;
      blaettern(relativ < 0.33 ? -1 : 1);
    }, 260);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white/80">
        <span className="text-sm tabular-nums">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          aria-label="Schließen"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Fläche neben dem Bild schließt die Ansicht. */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={`/api/photos/${photo.id}/large`}
          alt={photo.caption ?? ""}
          draggable={false}
          className="max-h-full max-w-full touch-none select-none object-contain"
          style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            transition: inGeste ? "none" : "transform 0.2s ease-out",
            cursor: gezoomt ? "grab" : "pointer",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {photo.caption && (
        <div className="shrink-0 px-5 pb-6 pt-3">
          <p className="mx-auto max-w-2xl text-center text-[15px] leading-relaxed text-white/90">
            {photo.caption}
          </p>
        </div>
      )}

      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Vorheriges Foto"
            className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:grid"
            onClick={() => blaettern(-1)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path
                d="m15 5-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Nächstes Foto"
            className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:grid"
            onClick={() => blaettern(1)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path
                d="m9 5 7 7-7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
