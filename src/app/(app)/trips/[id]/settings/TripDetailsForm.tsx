"use client";

import { useActionState, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { updateTripAction, type ActionState } from "../../../actions";

const initial: ActionState = {};

export default function TripDetailsForm({
  tripId,
  title,
  summary,
  startDate,
  endDate,
}: {
  tripId: number;
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
}) {
  const [state, action] = useActionState(updateTripAction, initial);

  /**
   * Kontrolliert, weil React 19 das Formular nach jeder Aktion leert. Wird der
   * Zeitraum abgelehnt, sollen die getippten Werte stehen bleiben.
   */
  const [name, setName] = useState(title);
  const [von, setVon] = useState(startDate);
  const [bis, setBis] = useState(endDate);
  const [text, setText] = useState(summary);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tripId" value={tripId} />

      <div>
        <label className="label" htmlFor="trip-title">
          Name
        </label>
        <input
          id="trip-title"
          name="title"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          className="field"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="trip-start">
            Von
          </label>
          <input
            id="trip-start"
            name="startDate"
            type="date"
            value={von}
            onChange={(event) => setVon(event.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="trip-end">
            Bis
          </label>
          <input
            id="trip-end"
            name="endDate"
            type="date"
            value={bis}
            onChange={(event) => setBis(event.target.value)}
            className="field"
          />
        </div>
      </div>
      <p className="-mt-2 text-[13px] text-ink-faint">
        Ohne Zeitraum richtet sich die Anzeige nach den Beiträgen. Der erste
        Reisetag zählt ab dem hier gesetzten Beginn.
      </p>

      <div>
        <label className="label" htmlFor="trip-summary">
          Beschreibung
        </label>
        <textarea
          id="trip-summary"
          name="summary"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={500}
          className="field resize-none"
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-sm font-medium text-sea">Gespeichert.</p>
      )}

      <SubmitButton className="btn btn-secondary" pendingLabel="Speichern …">
        Speichern
      </SubmitButton>
    </form>
  );
}
