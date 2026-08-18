"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_BILD_BYTES } from "@/lib/limits";
import { createTripAction } from "../../actions";

export default function NewTripForm() {
  const router = useRouter();

  const [titel, setTitel] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [titelbild, setTitelbild] = useState<File | null>(null);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  // Die Objekt-URL der Vorschau wieder freigeben, sobald sie nicht mehr gilt.
  useEffect(() => {
    if (!titelbild) {
      setVorschau(null);
      return;
    }
    const url = URL.createObjectURL(titelbild);
    setVorschau(url);
    return () => URL.revokeObjectURL(url);
  }, [titelbild]);

  function waehleBild(datei: File | null) {
    if (datei && datei.size > MAX_BILD_BYTES) {
      setFehler("Das Titelbild ist größer als 25 MB.");
      return;
    }
    setFehler(null);
    setTitelbild(datei);
  }

  async function absenden(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (laeuft) return;
    setFehler(null);
    setLaeuft(true);

    const felder = new FormData();
    felder.set("title", titel);
    felder.set("startDate", von);
    felder.set("endDate", bis);
    felder.set("summary", beschreibung);

    let ergebnis;
    try {
      ergebnis = await createTripAction({}, felder);
    } catch {
      setFehler("Die Reise konnte nicht angelegt werden.");
      setLaeuft(false);
      return;
    }
    if (ergebnis.error || !ergebnis.tripId) {
      setFehler(ergebnis.error ?? "Die Reise konnte nicht angelegt werden.");
      setLaeuft(false);
      return;
    }

    // Das Titelbild ist optional; klappt der Upload nicht, ist die Reise
    // trotzdem da – dann eben ohne Bild, das lässt sich später nachholen.
    if (titelbild) {
      try {
        const bild = new FormData();
        bild.set("file", titelbild);
        await fetch(`/api/trips/${ergebnis.tripId}/cover`, {
          method: "POST",
          body: bild,
        });
      } catch {
        // Ignorieren – die Reise steht, das Bild ist Beiwerk.
      }
    }

    router.push(`/trips/${ergebnis.tripId}`);
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
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
          value={titel}
          onChange={(event) => setTitel(event.target.value)}
        />
      </div>

      {/* Der Zeitraum darf offen bleiben – oft steht das Ende noch nicht fest. */}
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
            value={von}
            onChange={(event) => setVon(event.target.value)}
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
            value={bis}
            onChange={(event) => setBis(event.target.value)}
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
          value={beschreibung}
          onChange={(event) => setBeschreibung(event.target.value)}
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

        {vorschau ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vorschau}
              alt=""
              className="h-20 w-20 rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => waehleBild(null)}
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
            onChange={(event) => waehleBild(event.target.files?.[0] ?? null)}
          />
        )}
      </div>

      {fehler && <p className="text-sm font-medium text-accent">{fehler}</p>}

      <button
        type="submit"
        disabled={laeuft}
        className="btn btn-primary w-full disabled:opacity-60"
      >
        {laeuft ? "Wird angelegt …" : "Reise anlegen"}
      </button>
    </form>
  );
}
