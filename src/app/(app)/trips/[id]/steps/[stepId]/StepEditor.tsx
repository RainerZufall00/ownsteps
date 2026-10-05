"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import BackLink from "@/components/BackLink";
import FormFeedback from "@/components/FormFeedback";
import { PlusIcon } from "@/components/icons";
import SubmitButton from "@/components/SubmitButton";
import { toDateInput } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";
import type { MapStyleConfig } from "@/lib/map";
import type { UploadResult, ViewPhoto, ViewStep } from "@/lib/view-types";
import { deleteStepAction, saveStepAction, type ActionState } from "@/app/(app)/actions";
import EditorPhoto from "./EditorPhoto";
import PlaceField, { type Place } from "./PlaceField";
import { useMediaUpload } from "./useMediaUpload";

type EditorStep = Omit<ViewStep, "comments"> & { tripId: number; published: boolean };

const initial: ActionState = {};

export default function StepEditor({
  step,
  mapStyle,
}: {
  step: EditorStep;
  mapStyle: MapStyleConfig;
}) {
  const [state, action] = useActionState(saveStepAction, initial);
  const { t } = useI18n();
  const [photos, setPhotos] = useState<ViewPhoto[]>(step.photos);
  const [place, setPlace] = useState<Place>({
    name: step.placeName ?? "",
    lat: step.lat,
    lon: step.lon,
  });
  const [occurredAt, setOccurredAt] = useState(toDateInput(step.occurredAt));
  const [coverSetFor, setCoverSetFor] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { upload, progress, percent, problems } = useMediaUpload(step.id, (result: UploadResult) => {
    setPhotos((current) => [...current, ...result.photos]);
    // The first hit with GPS determines the step's place.
    const { derived } = result;
    setPlace((current) =>
      derived.lat !== null && current.lat === null
        ? { name: derived.placeName ?? current.name, lat: derived.lat, lon: derived.lon }
        : current,
    );
  });

  async function uploadPicked(files: File[]) {
    await upload(files);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-5">
      <div className="mb-5 flex items-center justify-between">
        <BackLink href={`/trips/${step.tripId}`}>{t.stepEditor.back}</BackLink>

        {step.published && (
          <form action={deleteStepAction}>
            <input type="hidden" name="stepId" value={step.id} />
            <button
              type="submit"
              className="text-sm font-medium text-ink-faint transition hover:text-accent"
            >
              {t.stepEditor.delete}
            </button>
          </form>
        )}
      </div>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        {step.published ? t.stepEditor.editHeading : t.stepEditor.newHeading}
      </h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        {t.stepEditor.intro}
      </p>

      {/* The photos sit inside the form so the captions are saved together
          with the step. The images themselves are already stored on upload. */}
      <form action={action} className="mt-6 space-y-5">
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="lat" value={place.lat ?? ""} />
        <input type="hidden" name="lon" value={place.lon ?? ""} />

        <section>
          <h2 className="label">{t.stepEditor.photos}</h2>

          {photos.length > 0 && (
            <ul className="mb-2 space-y-2">
              {photos.map((photo) => (
                <EditorPhoto
                  key={photo.id}
                  photo={photo}
                  tripId={step.tripId}
                  isCover={coverSetFor === photo.id}
                  onCoverSet={() => setCoverSetFor(photo.id)}
                  onRemoved={() => setPhotos((current) => current.filter((p) => p.id !== photo.id))}
                />
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={progress !== null}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-4 text-sm font-semibold text-ink-faint transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <PlusIcon className="h-5 w-5" strokeWidth={2} />
            {t.stepEditor.addMedia}
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              void uploadPicked(files);
            }}
          />

          {progress && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {progress.hint ??
                  fill(t.stepEditor.progress, { done: progress.done, total: progress.total })}
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
            {t.stepEditor.bodyLabel}
          </label>
          <textarea
            id="body"
            name="body"
            defaultValue={step.body}
            rows={8}
            className="field resize-y leading-relaxed"
            placeholder={t.stepEditor.bodyPlaceholder}
          />
        </div>

        <div>
          <label className="label" htmlFor="occurredDate">
            {t.stepEditor.date}
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

        <PlaceField
          place={place}
          onChange={setPlace}
          mapStyle={mapStyle}
          markerPhotoId={photos[0]?.id ?? null}
        />

        <FormFeedback error={state.error} />

        {/* Saving stays visible while typing. */}
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 px-4 pt-3 backdrop-blur-lg">
          <div className="mx-auto flex max-w-2xl gap-3">
            <Link
              href={`/trips/${step.tripId}`}
              className="btn btn-secondary flex-1"
            >
              {t.common.cancel}
            </Link>
            <SubmitButton
              className="btn btn-primary flex-[2]"
              pendingLabel={t.common.saving}
            >
              {t.common.save}
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}
