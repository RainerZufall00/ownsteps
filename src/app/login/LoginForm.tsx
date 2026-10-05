"use client";

import { useActionState } from "react";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import { loginAction, type FormState } from "./actions";

const initial: FormState = {};

export default function LoginForm() {
  const [state, action] = useActionState(loginAction, initial);
  const { t } = useI18n();

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          {t.common.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          className="field"
          placeholder={t.common.emailPlaceholder}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          {t.common.password}
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

      <FormFeedback error={state.error} />

      <SubmitButton pendingLabel={t.login.pending}>{t.login.submit}</SubmitButton>
    </form>
  );
}
