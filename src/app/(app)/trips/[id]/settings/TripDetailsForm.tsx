"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { updateTripAction, type ActionState } from "../../../actions";

const initial: ActionState = {};

export default function TripDetailsForm({
  tripId,
  title,
  summary,
}: {
  tripId: number;
  title: string;
  summary: string;
}) {
  const [state, action] = useActionState(updateTripAction, initial);

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
          defaultValue={title}
          maxLength={120}
          required
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="trip-summary">
          Beschreibung
        </label>
        <textarea
          id="trip-summary"
          name="summary"
          defaultValue={summary}
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
