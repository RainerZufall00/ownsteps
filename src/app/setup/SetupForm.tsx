"use client";

import { useActionState } from "react";
import { AccountFields } from "@/components/form-fields";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import { setupAction, type FormState } from "../login/actions";

const initial: FormState = {};

export default function SetupForm() {
  const [state, action] = useActionState(setupAction, initial);
  const { t } = useI18n();

  return (
    <form action={action} className="space-y-4">
      <AccountFields
        idPrefix="setup-"
        nameLabel={t.setup.yourName}
        namePlaceholder={t.setup.namePlaceholder}
        own
      />
      <FormFeedback error={state.error} />
      <SubmitButton pendingLabel={t.setup.pending}>{t.setup.submit}</SubmitButton>
    </form>
  );
}
