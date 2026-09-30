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
   * Controlled because React 19 resets the form after every action. If the
   * date range is rejected, the typed values should stay put.
   */
  const [name, setName] = useState(title);
  const [from, setFrom] = useState(startDate);
  const [to, setTo] = useState(endDate);
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
            value={from}
            onChange={(event) => setFrom(event.target.value)}
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
            value={to}
            onChange={(event) => setTo(event.target.value)}
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
