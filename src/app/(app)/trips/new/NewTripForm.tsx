"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_IMAGE_BYTES } from "@/lib/limits";
import { createTripAction } from "../../actions";

export default function NewTripForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState("");
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
      setError("Das Titelbild ist größer als 25 MB.");
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

    const fields = new FormData();
    fields.set("title", title);
    fields.set("startDate", from);
    fields.set("endDate", to);
    fields.set("summary", summary);

    let result;
    try {
      result = await createTripAction({}, fields);
    } catch {
      setError("Die Reise konnte nicht angelegt werden.");
      setBusy(false);
      return;
    }
    if (result.error || !result.tripId) {
      setError(result.error ?? "Die Reise konnte nicht angelegt werden.");
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
      <div>
        <label className="label" htmlFor="title">
          Name der Reise
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          className="field"
          placeholder="Norwegen mit dem Bulli"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      {/* The date range may stay open – often the end isn't fixed yet. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="startDate">
            Von <span className="text-ink-faint">(optional)</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            className="field"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="endDate">
            Bis <span className="text-ink-faint">(optional)</span>
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            className="field"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="summary">
          Kurz beschrieben <span className="text-ink-faint">(optional)</span>
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={3}
          maxLength={500}
          className="field resize-none"
          placeholder="Drei Wochen von Oslo bis zum Nordkap."
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="cover">
          Titelbild <span className="text-ink-faint">(optional)</span>
        </label>
        <p className="mb-2 text-[13px] text-ink-soft">
          Das Aushängeschild der Reise – erscheint in der Übersicht und in der
          Link-Vorschau. Anders als die übrigen Fotos ist es öffentlich
          sichtbar.
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
              Entfernen
            </button>
          </div>
        ) : (
          <input
            id="cover"
            name="cover"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/tiff"
            className="field"
            onChange={(event) => pickCover(event.target.files?.[0] ?? null)}
          />
        )}
      </div>

      {error && <p className="text-sm font-medium text-accent">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary w-full disabled:opacity-60"
      >
        {busy ? "Wird angelegt …" : "Reise anlegen"}
      </button>
    </form>
  );
}
