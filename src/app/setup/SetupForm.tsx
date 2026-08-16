"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { setupAction, type FormState } from "../login/actions";

const initial: FormState = {};

export default function SetupForm() {
  const [state, action] = useActionState(setupAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Dein Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="field"
          placeholder="Matze"
        />
      </div>

      <div>
        <label className="label" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          className="field"
          placeholder="du@beispiel.de"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
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

      <SubmitButton pendingLabel="Wird angelegt …">Account anlegen</SubmitButton>
    </form>
  );
}
