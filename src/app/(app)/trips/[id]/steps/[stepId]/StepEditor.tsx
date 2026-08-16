"use client";

import type { StyleSpecification } from "maplibre-gl";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import MapCanvas from "@/components/MapCanvas";
import PhotoImg from "@/components/PhotoImg";
import SubmitButton from "@/components/SubmitButton";
import { toDateInput } from "@/lib/format";
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

type UploadState = { done: number; total: number; current: number } | null;

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
  const [coverHinweis, setCoverHinweis] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Bilder gehen einzeln raus: das hält den Speicherbedarf auf dem VPS klein
   * und zeigt unterwegs einen ehrlichen Fortschritt.
   */
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setProblems([]);
    setUpload({ done: 0, total: files.length, current: 0 });

    for (const [index, file] of files.entries()) {
      try {
        const body = new FormData();
        body.append("stepId", String(step.id));
        body.append("files", file);

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
        // Der erste Treffer mit GPS bestimmt den Ort des Beitrags.
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

  async function pickLocation(nextLat: number, nextLon: number) {
    setLat(nextLat);
    setLon(nextLon);
    if (placeName.trim()) return;
    try {
      const response = await fetch(
        `/api/geocode?lat=${nextLat}&lon=${nextLon}`,
      );
      if (!response.ok) return;
      const place = (await response.json()) as { placeName: string | null };
      if (place.placeName) setPlaceName(place.placeName);
    } catch {
      // Ohne Ortsnamen ist der Pin trotzdem gesetzt.
    }
  }

  /**
   * Rettungsanker für Fotos ohne GPS – iOS entfernt die Position beim Teilen
   * je nach Weg. Wer noch vor Ort ist, übernimmt sie einfach vom Gerät.
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

  // Ohne feste Referenz bekäme die Karte bei jedem Tastendruck neue Daten
  // gereicht und würde ihre Ansicht zurücksetzen.
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
    // placeName absichtlich nicht enthalten: Der Titel steht nur im
    // Marker-Label und ist kein Grund, die Karte neu zu bespielen.
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

      {/* Fotos liegen außerhalb des Formulars: sie werden sofort gespeichert. */}
      {/* Die Fotos stehen mit im Formular, damit die Bildunterschriften
          zusammen mit dem Beitrag gespeichert werden. Die Bilder selbst sind
          schon beim Hochladen gesichert. */}
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
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                    <PhotoImg
                      photo={photo}
                      variant="thumb"
                      className="h-full w-full object-cover"
                      sizes="80px"
                    />
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
                          setCoverHinweis(photo.id);
                        }}
                        className="text-ink-soft transition hover:text-accent"
                      >
                        {coverHinweis === photo.id ? "Titelbild ✓" : "Titelbild"}
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
            Fotos hinzufügen
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
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
          <input
            id="placeName"
            name="placeName"
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            className="field"
            placeholder="Bergen, Norwegen"
          />

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
              className="h-full w-full"
            />
          </div>
        </div>

        {state.error && (
          <p className="text-sm font-medium text-accent">{state.error}</p>
        )}

        {/* Speichern bleibt beim Tippen immer sichtbar. */}
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
