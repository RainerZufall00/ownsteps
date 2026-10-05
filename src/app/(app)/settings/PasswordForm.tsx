"use client";

import { useActionState } from "react";
import FormFeedback from "@/components/FormFeedback";
import { NewPasswordInput } from "@/components/form-fields";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import type { ActionState } from "../actions";
import { changePasswordAction } from "./actions";

const initial: ActionState = {};

export default function PasswordForm({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const [state, action] = useActionState(changePasswordAction, initial);
  const { t } = useI18n();

  return (
    <form action={action} className="space-y-4">
      {hasPassword && (
        <div>
          <label className="label" htmlFor="currentPassword">
            {t.settings.currentPassword}
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
          {t.settings.newPassword}
        </label>
        <NewPasswordInput id="newPassword" name="newPassword" />
      </div>

      <FormFeedback error={state.error} success={state.ok && t.settings.passwordChanged} />

      <SubmitButton className="btn btn-secondary" pendingLabel={t.common.saving}>
        {hasPassword ? t.settings.changePassword : t.settings.setPassword}
      </SubmitButton>
    </form>
  );
}
