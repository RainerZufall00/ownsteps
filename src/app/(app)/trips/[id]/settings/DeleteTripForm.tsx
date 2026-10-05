"use client";

import { useActionState, useState } from "react";
import FormFeedback from "@/components/FormFeedback";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import { deleteTripAction, type ActionState } from "../../../actions";

const initial: ActionState = {};

export default function DeleteTripForm({
  tripId,
  title,
}: {
  tripId: number;
  title: string;
}) {
  const [state, action] = useActionState(deleteTripAction, initial);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { t } = useI18n();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn border border-accent px-5 py-2.5 text-sm text-accent"
      >
        {t.deleteTrip.action}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />

      <div>
        <label className="label" htmlFor="confirmTitle">
          {t.deleteTrip.confirmBefore}
          <span className="font-semibold">{title}</span>
          {t.deleteTrip.confirmAfter}
        </label>
        <input
          id="confirmTitle"
          name="confirmTitle"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoComplete="off"
          autoFocus
          className="field"
          placeholder={title}
        />
      </div>

      <FormFeedback error={state.error} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setInput("");
          }}
          className="btn btn-secondary flex-1"
        >
          {t.common.cancel}
        </button>
        <SubmitButton
          className="btn flex-1 border border-accent text-accent disabled:opacity-40"
          pendingLabel={t.deleteTrip.pending}
        >
          {t.deleteTrip.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
