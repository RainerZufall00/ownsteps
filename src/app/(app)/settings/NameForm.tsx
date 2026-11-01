"use client";

import { useActionState } from "react";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import { NAME_MAX_LENGTH } from "@/lib/limits";
import type { ActionState } from "../actions";
import { renameAction } from "./actions";

const initial: ActionState = {};

export default function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState(renameAction, initial);
  const { t } = useI18n();

  return (
    <form action={action} className="space-y-4">
      <input
        name="name"
        aria-label={t.settings.nameHeading}
        defaultValue={name}
        autoComplete="nickname"
        maxLength={NAME_MAX_LENGTH}
        required
        className="field"
      />

      <FormFeedback error={state.error} success={state.ok && t.settings.nameChanged} />

      <SubmitButton className="btn btn-secondary" pendingLabel={t.common.saving}>
        {t.settings.saveName}
      </SubmitButton>
    </form>
  );
}
