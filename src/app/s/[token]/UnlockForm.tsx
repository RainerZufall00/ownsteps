"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import SubmitButton from "@/components/SubmitButton";
import { unlockAction, type UnlockState } from "./actions";

const initial: UnlockState = {};

export default function UnlockForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unlockAction, initial);
  const router = useRouter();

  // Nach erfolgreicher Eingabe steht das Cookie – die Seite neu laden.
  useEffect(() => {
    if (!pending && state.ok) router.refresh();
  }, [state, pending, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="field"
          placeholder="••••••"
        />
      </div>

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}

      <SubmitButton pendingLabel="Wird geprüft …">Reise ansehen</SubmitButton>
    </form>
  );
}
