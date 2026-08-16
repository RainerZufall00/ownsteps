"use client";

import type { StyleSpecification } from "maplibre-gl";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import MapCanvas from "@/components/MapCanvas";
import PhotoImg from "@/components/PhotoImg";
import SubmitButton from "@/components/SubmitButton";
import { toDateTimeLocal } from "@/lib/format";
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
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(step.occurredAt));
  const [upload, setUpload] = useState<UploadState>(null);
  const [problems, setProblems] = useState<string[]>([]);
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
      <section className="mt-6">
        <h2 className="label">Fotos</h2>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-surface-muted"
            >
              <PhotoImg
                photo={photo}
                variant="thumb"
                className="h-full w-full object-cover"
                sizes="160px"
              />
              <button
                type="button"
                aria-label="Foto entfernen"
                onClick={async () => {
                  setPhotos((current) =>
                    current.filter((p) => p.id !== photo.id),
                  );
                  const body = new FormData();
                  body.append("photoId", String(photo.id));
                  body.append("stepId", String(step.id));
                  await deletePhotoAction(body);
                }}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <form
                action={setCoverPhotoAction}
                className="absolute inset-x-1.5 bottom-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
              >
                <input type="hidden" name="tripId" value={step.tripId} />
                <input type="hidden" name="photoId" value={photo.id} />
                <button
                  type="submit"
                  className="w-full rounded-full bg-black/55 py-1 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-black/75"
                >
                  Titelbild
                </button>
              </form>
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={upload !== null}
            className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-ink-faint transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <span className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[11px] font-semibold">Hinzufügen</span>
            </span>
          </button>
        </div>

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

      <form action={action} className="mt-7 space-y-5">
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="lat" value={lat ?? ""} />
        <input type="hidden" name="lon" value={lon ?? ""} />

        <div>
          <label className="label" htmlFor="title">
            Überschrift
          </label>
          <input
            id="title"
            name="title"
            defaultValue={step.title}
            maxLength={160}
            className="field"
            placeholder="Ankunft in Bergen"
          />
        </div>

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
          <label className="label" htmlFor="occurredAt">
            Zeitpunkt
          </label>
          <input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
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

          <div className="relative mt-2 h-52 overflow-hidden rounded-2xl border border-line">
            <MapCanvas
              steps={
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
                  : []
              }
              mapStyle={mapStyle}
              onMapClick={pickLocation}
              className="h-full w-full"
            />
            <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-surface/90 px-3 py-2 text-center text-[13px] text-ink-soft backdrop-blur">
              {lat === null
                ? "Kein GPS im Foto – tippe auf die Karte, um den Ort zu setzen."
                : "Tippe auf die Karte, um den Ort zu korrigieren."}
            </p>
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
