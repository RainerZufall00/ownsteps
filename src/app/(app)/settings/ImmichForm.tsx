"use client";

import { useActionState } from "react";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import type { ActionState } from "../actions";
import { connectImmichAction } from "./actions";

const initial: ActionState = {};

/** Immich address and API key; checked against Immich before saving. */
export default function ImmichForm({ url }: { url?: string }) {
  const [state, action] = useActionState(connectImmichAction, initial);
  const { t } = useI18n();

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="immichUrl">
          {t.immich.url}
        </label>
        <input
          id="immichUrl"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          defaultValue={url}
          placeholder={t.immich.urlPlaceholder}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="immichKey">
          {t.immich.apiKey}
        </label>
        <input
          id="immichKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          required
          className="field"
        />
        <p className="mt-1.5 text-[13px] text-ink-faint">{t.immich.apiKeyHint}</p>
      </div>
      <FormFeedback error={state.error} />
      <SubmitButton className="btn btn-secondary" pendingLabel={t.immich.connecting}>
        {t.immich.connect}
      </SubmitButton>
    </form>
  );
}
