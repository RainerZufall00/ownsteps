"use client";

import { useActionState, useState } from "react";
import { AccountFields } from "@/components/form-fields";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import type { ActionState } from "../actions";
import { addUserAction } from "./actions";

const initial: ActionState = {};

export default function AddUserForm() {
  const [state, action] = useActionState(addUserAction, initial);
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary w-full"
      >
        {t.settings.addAccount}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4 border-t border-line pt-5">
      <AccountFields idPrefix="new-" nameLabel={t.common.name} />
      <FormFeedback error={state.error} success={state.ok && t.settings.accountCreated} />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost flex-1"
        >
          {t.common.close}
        </button>
        <SubmitButton className="btn btn-primary flex-1" pendingLabel={t.settings.creating}>
          {t.settings.create}
        </SubmitButton>
      </div>
    </form>
  );
}
