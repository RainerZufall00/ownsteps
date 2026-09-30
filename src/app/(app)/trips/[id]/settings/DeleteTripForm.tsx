"use client";

import { useActionState, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { deleteTripAction, type ActionState } from "../../../actions";

const initial: ActionState = {};

export default function DeleteTripForm({
  tripId,
  title,
}: {
  tripId: number;
  title: string;
}) {
  const [state, action] = useActionState(deleteTripAction, initial);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn border border-accent px-5 py-2.5 text-sm text-accent"
      >
        Reise löschen
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />

      <div>
        <label className="label" htmlFor="confirmTitle">
          Zum Bestätigen <span className="font-semibold">{title}</span> eintippen
        </label>
        <input
          id="confirmTitle"
          name="confirmTitle"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoComplete="off"
          autoFocus
          className="field"
          placeholder={title}
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setInput("");
          }}
          className="btn btn-secondary flex-1"
        >
          Abbrechen
        </button>
        <SubmitButton
          className="btn flex-1 border border-accent text-accent disabled:opacity-40"
          pendingLabel="Wird gelöscht …"
        >
          Endgültig löschen
        </SubmitButton>
      </div>
    </form>
  );
}
