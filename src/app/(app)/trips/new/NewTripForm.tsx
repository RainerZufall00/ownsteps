"use client";

import { useActionState, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { createTripAction, type ActionState } from "../../actions";

const initial: ActionState = {};

export default function NewTripForm() {
  const [state, action] = useActionState(createTripAction, initial);

  /**
   * Die Felder sind kontrolliert, weil React 19 ein Formular nach jeder Aktion
   * von sich aus leert. Bei einer abgelehnten Eingabe – etwa einem Ende vor dem
   * Beginn – stünde man sonst wieder vor einem leeren Formular und dürfte alles
   * neu tippen.
   */
  const [titel, setTitel] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [beschreibung, setBeschreibung] = useState("");

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

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}

      <SubmitButton pendingLabel="Wird angelegt …">Reise anlegen</SubmitButton>
    </form>
  );
}
