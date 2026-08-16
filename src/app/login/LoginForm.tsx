"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { loginAction, type FormState } from "./actions";

const initial: FormState = {};

export default function LoginForm() {
  const [state, action] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
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
          autoComplete="current-password"
          required
          className="field"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}

      <SubmitButton pendingLabel="Anmelden …">Anmelden</SubmitButton>
    </form>
  );
}
