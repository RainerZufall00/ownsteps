"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FormFeedback from "@/components/FormFeedback";
import { TripFields, type TripFieldValues } from "@/components/form-fields";
import { useI18n } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/text";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/limits";
import { createTripAction } from "../../actions";

export default function NewTripForm() {
  const router = useRouter();
  const { t } = useI18n();

  const [fields, setFields] = useState<TripFieldValues>({
    title: "",
    startDate: "",
    endDate: "",
    summary: "",
  });
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Release the preview's object URL as soon as it's no longer valid.
  useEffect(() => {
    if (!cover) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  function pickCover(file: File | null) {
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError(fill(t.newTrip.coverTooLarge));
      return;
    }
    setError(null);
    setCover(file);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);

    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);

    let result;
    try {
      result = await createTripAction({}, form);
    } catch {
      setError(t.newTrip.failed);
      setBusy(false);
      return;
    }
    if (result.error || !result.tripId) {
      setError(result.error ?? t.newTrip.failed);
      setBusy(false);
      return;
    }

    // The cover is optional; if the upload fails, the trip exists anyway –
    // just without an image, which can be added later.
    if (cover) {
      try {
        const coverForm = new FormData();
        coverForm.set("file", cover);
        await fetch(`/api/trips/${result.tripId}/cover`, {
          method: "POST",
          body: coverForm,
        });
      } catch {
        // Ignore – the trip exists, the image is an extra.
      }
    }

    router.push(`/trips/${result.tripId}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TripFields
        idPrefix="new-trip-"
        values={fields}
        onChange={setFields}
        titleLabel={t.newTrip.nameLabel}
        summaryLabel={t.newTrip.summaryLabel}
        placeholders={{ title: t.newTrip.namePlaceholder, summary: t.newTrip.summaryPlaceholder }}
        markOptional
        autoFocus
      />

      <div>
        <label className="label" htmlFor="cover">
          {t.newTrip.coverLabel} <span className="text-ink-faint">{t.common.optional}</span>
        </label>
        <p className="mb-2 text-[13px] text-ink-soft">
          {t.newTrip.coverHint}
        </p>

        {preview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt=""
              className="h-20 w-20 rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => pickCover(null)}
              className="text-sm font-semibold text-accent"
            >
              {t.common.remove}
            </button>
          </div>
        ) : (
          <input
            id="cover"
            name="cover"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="field"
            onChange={(event) => pickCover(event.target.files?.[0] ?? null)}
          />
        )}
      </div>

      <FormFeedback error={error} />

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary w-full disabled:opacity-60"
      >
        {busy ? t.newTrip.pending : t.newTrip.submit}
      </button>
    </form>
  );
}
