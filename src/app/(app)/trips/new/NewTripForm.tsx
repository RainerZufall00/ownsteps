"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { createTripAction, type ActionState } from "../../actions";

const initial: ActionState = {};

export default function NewTripForm() {
  const [state, action] = useActionState(createTripAction, initial);

  return (
    <form action={action} className="space-y-4">
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
        />
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
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}

      <SubmitButton pendingLabel="Wird angelegt …">Reise anlegen</SubmitButton>
    </form>
  );
}
