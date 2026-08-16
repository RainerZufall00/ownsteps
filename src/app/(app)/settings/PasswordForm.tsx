"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type { ActionState } from "../actions";
import { changePasswordAction } from "./actions";

const initial: ActionState = {};

export default function PasswordForm({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const [state, action] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="space-y-4">
      {hasPassword && (
        <div>
          <label className="label" htmlFor="currentPassword">
            Aktuelles Passwort
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="field"
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="newPassword">
          Neues Passwort
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="field"
          placeholder="mindestens 10 Zeichen"
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-sm font-medium text-sea">Passwort geändert.</p>
      )}

      <SubmitButton className="btn btn-secondary" pendingLabel="Speichern …">
        {hasPassword ? "Passwort ändern" : "Passwort setzen"}
      </SubmitButton>
    </form>
  );
}
