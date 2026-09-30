"use client";

import type { StyleSpecification } from "maplibre-gl";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import MapCanvas from "@/components/MapCanvas";
import PhotoImg from "@/components/PhotoImg";
import SubmitButton from "@/components/SubmitButton";
import { toDateInput } from "@/lib/format";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/limits";
import type { ViewPhoto } from "@/lib/view-types";
import {
  deletePhotoAction,
  deleteStepAction,
  saveStepAction,
  setCoverPhotoAction,
  type ActionState,
} from "@/app/(app)/actions";

type EditorStep = {
  id: number;
  tripId: number;
  title: string;
  body: string;
  lat: number | null;
  lon: number | null;
  placeName: string | null;
  occurredAt: number;
  published: boolean;
  photos: ViewPhoto[];
};

type UploadState = {
  done: number;
  total: number;
  current: number;
  hint?: string;
} | null;
type PlaceHit = { id: string; name: string; lat: number; lon: number };

const initial: ActionState = {};

export default function StepEditor({
  step,
  mapStyle,
}: {
  step: EditorStep;
  mapStyle: string | StyleSpecification;
}) {
  const [state, action] = useActionState(saveStepAction, initial);
  const [photos, setPhotos] = useState<ViewPhoto[]>(step.photos);
  const [lat, setLat] = useState<number | null>(step.lat);
  const [lon, setLon] = useState<number | null>(step.lon);
  const [placeName, setPlaceName] = useState(step.placeName ?? "");
  const [occurredAt, setOccurredAt] = useState(toDateInput(step.occurredAt));
  const [upload, setUpload] = useState<UploadState>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [locating, setLocating] = useState<string | null>(null);
  const [coverSetFor, setCoverSetFor] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lon: number;
    key: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number | undefined>(undefined);

  /** Plain fallback image in case none can be extracted from the video. */
  async function fallbackPoster() {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#2a2622";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 64px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Video", canvas.width / 2, canvas.height / 2 + 22);
    }
    const blob = await new Promise<Blob | null>((settle) =>
      canvas.toBlob(settle, "image/jpeg", 0.8),
    );
    return new File([blob ?? new Blob()], "poster.jpg", { type: "image/jpeg" });
  }

  /**
   * Grabs a poster frame from a video. The browser can decode the video
   * anyway – that keeps ffmpeg out of the Docker image.
   *
   * The order matters: first wait for the metadata, then seek to a position.
   * Waiting for `loadeddata` led nowhere, because with `preload="metadata"` no
   * image data is loaded at all – the upload then ran into a timeout without
   * ever starting.
   */
  async function extractPoster(file: File) {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const waitFor = (eventName: string, limit: number) =>
      new Promise<boolean>((settle) => {
        const timer = window.setTimeout(() => settle(false), limit);
        video.addEventListener(
          eventName,
          () => {
            window.clearTimeout(timer);
            settle(true);
          },
          { once: true },
        );
        video.addEventListener(
          "error",
          () => {
            window.clearTimeout(timer);
            settle(false);
          },
          { once: true },
        );
      });

    try {
      const hasMetadata = await waitFor("loadedmetadata", 20000);
      const durationMs =
        hasMetadata && Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : 0;

      if (hasMetadata && video.videoWidth > 0) {
        // Seek in a bit – the first frame is often black. The browser loads
        // exactly the section needed for that.
        const seekTime = Number.isFinite(video.duration)
          ? Math.min(1, video.duration / 3)
          : 0;
        video.currentTime = seekTime;
        await waitFor("seeked", 10000);

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas
          .getContext("2d")
          ?.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((settle) =>
          canvas.toBlob(settle, "image/jpeg", 0.85),
        );
        if (blob && blob.size > 0) {
          return {
            poster: new File([blob], "poster.jpg", { type: "image/jpeg" }),
            durationMs: durationMs,
          };
        }
      }

      // No poster frame possible (e.g. with a codec the browser can't
      // decode). The video should be uploaded anyway.
      console.warn("[upload] No poster frame from the video, using fallback");
      return { poster: await fallbackPoster(), durationMs: durationMs };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Files go out one by one: that keeps memory use on the VPS small and shows
   * honest progress along the way.
   */
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setProblems([]);
    setUpload({ done: 0, total: files.length, current: 0 });

    for (const [index, file] of files.entries()) {
      try {
        const isVideo = file.type.startsWith("video/");
        const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (file.size > limit) {
          // Catch it before uploading: otherwise a hundred megabytes travel
          // over the network only for the server to reject them.
          setProblems((current) => [
            ...current,
            `${file.name}: ${Math.round(file.size / 1024 / 1024)} MB – erlaubt sind ` +
              `${Math.round(limit / 1024 / 1024)} MB.`,
          ]);
          setUpload({ done: index + 1, total: files.length, current: 0 });
          continue;
        }

        const body = new FormData();
        body.append("stepId", String(step.id));
        body.append("files", file);

        if (isVideo) {
          // The poster frame takes a moment – without a hint this looks like a
          // hang, because the progress bar is still at zero.
          setUpload({
            done: index,
            total: files.length,
            current: 0,
            hint: "Video wird vorbereitet …",
          });
          const posterFrame = await extractPoster(file);
          body.append("poster0", posterFrame.poster);
          body.append("duration0", String(posterFrame.durationMs));
        }

        const result = await new Promise<{
          photos: ViewPhoto[];
          failed: { name: string; reason: string }[];
          derived: { lat: number | null; lon: number | null; placeName: string | null };
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            setUpload({
              done: index,
              total: files.length,
              current: event.loaded / event.total,
            });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Verbindung unterbrochen"));
          xhr.send(body);
        });

        if (result.photos.length > 0) {
          setPhotos((current) => [...current, ...result.photos]);
        }
        if (result.failed.length > 0) {
          setProblems((current) => [
            ...current,
            ...result.failed.map((f) => `${f.name}: ${f.reason}`),
          ]);
        }
        // The first hit with GPS determines the step's place.
        if (result.derived.lat !== null && lat === null) {
          setLat(result.derived.lat);
          setLon(result.derived.lon);
          if (result.derived.placeName) setPlaceName(result.derived.placeName);
        }
      } catch (error) {
        setProblems((current) => [
          ...current,
          `${file.name}: ${error instanceof Error ? error.message : "Upload fehlgeschlagen"}`,
        ]);
      }

      setUpload({ done: index + 1, total: files.length, current: 0 });
    }

    setUpload(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Typing in the place field starts the search without firing on every keystroke. */
  function onPlaceInput(value: string) {
    setPlaceName(value);
    window.clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/geocode/search?q=${encodeURIComponent(value)}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as { hits: PlaceHit[] };
        setSuggestions(data.hits ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  /** Adopt a suggestion: name, coordinates and map section. */
  function pickPlace(hit: PlaceHit) {
    window.clearTimeout(searchTimer.current);
    setPlaceName(hit.name);
    setLat(hit.lat);
    setLon(hit.lon);
    setFocusPoint({ lat: hit.lat, lon: hit.lon, key: Date.now() });
    setSuggestions([]);
    setLocating(null);
  }

  async function pickLocation(nextLat: number, nextLon: number) {
    setLat(nextLat);
    setLon(nextLon);
    setFocusPoint({ lat: nextLat, lon: nextLon, key: Date.now() });
    if (placeName.trim()) return;
    try {
      const response = await fetch(
        `/api/geocode?lat=${nextLat}&lon=${nextLon}`,
      );
      if (!response.ok) return;
      const place = (await response.json()) as { placeName: string | null };
      if (place.placeName) setPlaceName(place.placeName);
    } catch {
      // Without a place name the pin is set anyway.
    }
  }

  /**
   * Lifeline for photos without GPS – iOS strips the position when sharing,
   * depending on the route. Whoever is still on site simply takes it from the
   * device.
   */
  function applyDeviceLocation() {
    if (!navigator.geolocation) {
      setLocating("Dieses Gerät gibt keinen Standort her.");
      return;
    }
    setLocating("Standort wird ermittelt …");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(null);
        void pickLocation(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(
          error.code === error.PERMISSION_DENIED
            ? "Zugriff auf den Standort wurde abgelehnt."
            : "Standort konnte nicht ermittelt werden.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // Without a stable reference the map would get new data on every keystroke
  // and reset its view.
  const mapSteps = useMemo(
    () =>
      lat !== null && lon !== null
        ? [
            {
              id: step.id,
              title: placeName || "Dieser Beitrag",
              lat,
              lon,
              occurredAt: step.occurredAt,
              coverPhotoId: photos[0]?.id ?? null,
            },
          ]
        : [],
    // placeName deliberately left out: the title only appears in the marker
    // label and is no reason to feed the map again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lat, lon, step.id, step.occurredAt, photos[0]?.id],
  );

  const uploadPercent = upload
    ? Math.round(((upload.done + upload.current) / upload.total) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-5">
      <div className="mb-5 flex items-center justify-between">
        <Link
          href={`/trips/${step.tripId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="m15 5-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          Zur Reise
        </Link>

        {step.published && (
          <form action={deleteStepAction}>
            <input type="hidden" name="stepId" value={step.id} />
            <button
              type="submit"
              className="text-sm font-medium text-ink-faint transition hover:text-accent"
            >
              Beitrag löschen
            </button>
          </form>
        )}
      </div>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        {step.published ? "Beitrag bearbeiten" : "Neuer Beitrag"}
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        Ort und Zeitpunkt kommen automatisch aus den Fotos.
      </p>

      {/* The photos sit inside the form so the captions are saved together
          with the step. The images themselves are already stored on upload. */}
      <form action={action} className="mt-6 space-y-5">
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="lat" value={lat ?? ""} />
        <input type="hidden" name="lon" value={lon ?? ""} />

        <section>
          <h2 className="label">Fotos</h2>

          {photos.length > 0 && (
            <ul className="mb-2 space-y-2">
              {photos.map((photo) => (
                <li
                  key={photo.id}
                  className="flex gap-3 rounded-2xl border border-line p-2"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                    <PhotoImg
                      photo={photo}
                      variant="thumb"
                      className="h-full w-full object-cover"
                      sizes="80px"
                    />
                    {photo.mediaType === "video" && (
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white drop-shadow">
                          <path d="M8 5.5v13l11-6.5z" />
                        </svg>
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
                    <input
                      name={`caption_${photo.id}`}
                      defaultValue={photo.caption ?? ""}
                      maxLength={500}
                      className="field py-1.5 text-[15px]"
                      placeholder="Bildunterschrift (optional)"
                      aria-label="Bildunterschrift"
                    />
                    <div className="flex gap-4 px-1 text-[13px] font-medium">
                      <button
                        type="button"
                        onClick={async () => {
                          const body = new FormData();
                          body.append("tripId", String(step.tripId));
                          body.append("photoId", String(photo.id));
                          await setCoverPhotoAction(body);
                          setCoverSetFor(photo.id);
                        }}
                        className="text-ink-soft transition hover:text-accent"
                      >
                        {coverSetFor === photo.id ? "Titelbild ✓" : "Titelbild"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setPhotos((current) =>
                            current.filter((p) => p.id !== photo.id),
                          );
                          const body = new FormData();
                          body.append("photoId", String(photo.id));
                          body.append("stepId", String(step.id));
                          await deletePhotoAction(body);
                        }}
                        className="text-ink-faint transition hover:text-accent"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={upload !== null}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-4 text-sm font-semibold text-ink-faint transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Fotos oder Videos hinzufügen
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              void uploadFiles(files);
            }}
          />

          {upload && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {upload.done} von {upload.total} hochgeladen …
              </p>
            </div>
          )}

          {problems.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-2xl bg-accent-soft px-4 py-3 text-[13px] text-accent">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </section>

        <div>
          <label className="label" htmlFor="body">
            Was ist passiert?
          </label>
          <textarea
            id="body"
            name="body"
            defaultValue={step.body}
            rows={8}
            className="field resize-y leading-relaxed"
            placeholder="Erzähl von diesem Tag …"
          />
        </div>

        <div>
          <label className="label" htmlFor="occurredDate">
            Datum
          </label>
          <input
            id="occurredDate"
            name="occurredDate"
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="placeName">
            Ort
          </label>

          <div className="relative">
            <input
              id="placeName"
              name="placeName"
              value={placeName}
              onChange={(event) => onPlaceInput(event.target.value)}
              autoComplete="off"
              className="field pr-10"
              placeholder="Ort suchen, z.B. Ulm"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
                sucht …
              </span>
            )}

            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
                {suggestions.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => pickPlace(hit)}
                      className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-[15px] transition hover:bg-surface-muted"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"
                          fill="currentColor"
                          opacity="0.25"
                        />
                        <circle cx="12" cy="10" r="2.6" fill="currentColor" />
                      </svg>
                      {hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyDeviceLocation}
              className="btn btn-secondary px-4 py-2 text-sm"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                <path
                  d="M12 2v2m0 16v2M2 12h2m16 0h2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Mein Standort
            </button>

            {lat !== null && (
              <button
                type="button"
                onClick={() => {
                  setLat(null);
                  setLon(null);
                }}
                className="btn btn-ghost px-3 py-2 text-sm"
              >
                Ort entfernen
              </button>
            )}

            <span className="text-[13px] text-ink-soft">
              {locating ??
                (lat === null
                  ? "Kein Ort gesetzt – tippe auf die Karte."
                  : `${lat.toFixed(5)}, ${lon?.toFixed(5)}`)}
            </span>
          </div>

          <div className="relative mt-2 h-56 overflow-hidden rounded-2xl border border-line">
            <MapCanvas
              steps={mapSteps}
              mapStyle={mapStyle}
              onMapClick={pickLocation}
              autoFit={false}
              focusPoint={focusPoint}
              className="h-full w-full"
            />
          </div>
        </div>

        {state.error && (
          <p className="text-sm font-medium text-accent">{state.error}</p>
        )}

        {/* Saving stays visible while typing. */}
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 px-4 pt-3 backdrop-blur-lg">
          <div className="mx-auto flex max-w-2xl gap-3">
            <Link
              href={`/trips/${step.tripId}`}
              className="btn btn-secondary flex-1"
            >
              Abbrechen
            </Link>
            <SubmitButton
              className="btn btn-primary flex-[2]"
              pendingLabel="Speichern …"
            >
              Speichern
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}
