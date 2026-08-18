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

const OHNE_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 4;
/** Ab diesem Anteil der Bildschirmbreite rastet das nächste Medium ein. */
const BLAETTER_SCHWELLE = 0.22;
/**
 * Höhe der Bedienleiste, die der Browser unten ins Video zeichnet. Gesten, die
 * dort beginnen, gehören dem Video – sonst wird jedes Spulen zum Blättern.
 */
const STEUERLEISTE = 64;

function abstand(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function Lightbox({ photos, startIndex, onClose }: Props) {
  const base = useMediaBase();
  const [index, setIndex] = useState(startIndex);
  const [zug, setZug] = useState(0);
  const [zoom, setZoom] = useState<Zoom>(OHNE_ZOOM);
  const [animiert, setAnimiert] = useState(true);

  const dialog = useRef<HTMLDivElement>(null);
  const buehne = useRef<HTMLDivElement>(null);
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
    /** Geste in der Bedienleiste eines Videos: komplett ignorieren. */
    aus: false,
  });

  const gezoomt = zoom.scale > 1.01;
  const medium = photos[index];
  const istVideo = medium?.mediaType === "video";

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

  /**
   * Der Browser darf in der Vollbildansicht nicht selbst zoomen. Beim Foto
   * erledigt das die App, beim Video wäre es eine Sackgasse: Der Seitenzoom
   * liegt über einem `position: fixed`-Overlay, das nicht mitscrollt – man
   * sitzt dann in einem vergrößerten Ausschnitt fest und kommt nur über das
   * Neuladen der Seite wieder heraus.
   *
   * Zwei Wege führen dorthin, beide werden hier geschlossen: das Aufziehen mit
   * zwei Fingern (auf iOS über eigene `gesture`-Ereignisse) und der
   * Doppeltipp. Einzelne Berührungen bleiben unangetastet – sie gehören der
   * Bedienleiste des Videos.
   */
  useEffect(() => {
    const wurzel = dialog.current;
    if (!wurzel) return;

    const zweiFinger = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const iosGeste = (event: Event) => event.preventDefault();

    wurzel.addEventListener("touchmove", zweiFinger, { passive: false });
    wurzel.addEventListener("gesturestart", iosGeste);
    wurzel.addEventListener("gesturechange", iosGeste);
    return () => {
      wurzel.removeEventListener("touchmove", zweiFinger);
      wurzel.removeEventListener("gesturestart", iosGeste);
      wurzel.removeEventListener("gesturechange", iosGeste);
    };
  }, []);

  /**
   * Beim Wechsel läuft kein Video im Hintergrund weiter. Die Position im
   * Videofeld ist nicht die Position im Medienstreifen – zwischen den Videos
   * können Fotos liegen –, deshalb steht sie am Element.
   */
  useEffect(() => {
    buehne.current
      ?.querySelectorAll<HTMLVideoElement>("video[data-pos]")
      .forEach((video) => {
        if (Number(video.dataset.pos) !== index) video.pause();
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

  /** Liegt der Punkt auf der Bedienleiste des Videos? */
  function inSteuerleiste(event: React.PointerEvent) {
    const video = (event.currentTarget as HTMLElement).querySelector("video");
    if (!video) return false;
    const box = video.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY > box.bottom - STEUERLEISTE &&
      event.clientY <= box.bottom
    );
  }

  function onPointerDown(event: React.PointerEvent) {
    const g = geste.current;
    g.aus = false;

    if (istVideo) {
      // Abspielen, Spulen, Lautstärke: das macht der Browser selbst. Ein
      // Zeigerfang würde ihm dabei die Ereignisse wegnehmen.
      if (inSteuerleiste(event)) {
        g.aus = true;
        return;
      }
    } else {
      try {
        (event.target as Element).setPointerCapture?.(event.pointerId);
      } catch {
        // Ohne Capture funktioniert alles weiter.
      }
    }

    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

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
    const g = geste.current;
    if (g.aus) return;
    if (!zeiger.current.has(event.pointerId)) return;
    zeiger.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (zeiger.current.size === 2) {
      // Videos werden nicht gezoomt – dafür gibt es den Vollbildknopf.
      if (istVideo) return;
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
    if (g.aus) {
      g.aus = false;
      return;
    }

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

    // Beim Video bleibt der Tipp dem Abspielen vorbehalten: Weiterschalten
    // geht dort per Wischen oder über die Pfeile.
    if (istVideo) return;

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
    /**
     * `100svh` statt `inset-0`: Auf dem Handy rechnet `inset-0` mit dem
     * Viewport ohne Adressleiste. Der untere Rand – und damit die
     * Bildunterschrift – lag dann hinter der Browserleiste.
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
      <div ref={buehne} className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${zug}px))`,
            transition: animiert
              ? "transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)"
              : "none",
          }}
        >
          {photos.map((eintrag, i) => {
            const aktiv = i === index;
            const video = eintrag.mediaType === "video";
            return (
              /**
               * Die Geste hängt am Rahmen, nicht am Medium: Beim Video liegt
               * darüber die Bedienleiste des Browsers, an der jeder eigene
               * Zeigerfang scheitert.
               */
              <div
                key={eintrag.id}
                className="flex h-full w-full shrink-0 items-center justify-center px-2"
                /*
                 * Beim Video bleibt `touch-action` bewusst großzügig, sonst
                 * verliert die Bedienleiste des Browsers ihre Gesten;
                 * `manipulation` nimmt ihr allein den Doppeltipp-Zoom.
                 */
                style={{ touchAction: video ? "manipulation" : "none" }}
                onPointerDown={aktiv ? onPointerDown : undefined}
                onPointerMove={aktiv ? onPointerMove : undefined}
                onPointerUp={aktiv ? onPointerUp : undefined}
                onPointerCancel={aktiv ? onPointerUp : undefined}
              >
                {video ? (
                  <video
                    data-pos={i}
                    src={`${base}/${eintrag.id}/video`}
                    poster={`${base}/${eintrag.id}/medium`}
                    controls
                    playsInline
                    preload={aktiv ? "metadata" : "none"}
                    className="max-h-full max-w-full"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${base}/${eintrag.id}/large`}
                    alt={eintrag.caption ?? ""}
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain"
                    style={
                      aktiv
                        ? {
                            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                            transition: animiert ? "transform 0.2s ease-out" : "none",
                            cursor: gezoomt ? "grab" : "pointer",
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
            Beim Video schalten die Pfeile auf jedem Gerät sichtbar: Ein Tipp
            gehört dort dem Abspielen, er kann also nicht weiterblättern.
          */}
          <button
            type="button"
            aria-label="Vorheriges Medium"
            disabled={index === 0}
            className={`absolute left-2 top-1/2 h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-25 sm:grid ${
              istVideo ? "grid" : "hidden"
            }`}
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
            className={`absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-25 sm:grid ${
              istVideo ? "grid" : "hidden"
            }`}
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
