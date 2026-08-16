"use client";

import { useActionState, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type { ActionState } from "../actions";
import { addUserAction } from "./actions";

const initial: ActionState = {};

export default function AddUserForm() {
  const [state, action] = useActionState(addUserAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary w-full"
      >
        Weiteren Account anlegen
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 border-t border-line pt-5">
      <div>
        <label className="label" htmlFor="new-name">
          Name
        </label>
        <input id="new-name" name="name" required className="field" />
      </div>

      <div>
        <label className="label" htmlFor="new-email">
          E-Mail
        </label>
        <input
          id="new-email"
          name="email"
          type="email"
          required
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="new-password">
          Passwort
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="field"
          placeholder="mindestens 10 Zeichen"
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-sm font-medium text-sea">Account angelegt.</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost flex-1"
        >
          Schließen
        </button>
        <SubmitButton className="btn btn-primary flex-1" pendingLabel="Anlegen …">
          Anlegen
        </SubmitButton>
      </div>
    </form>
  );
}
