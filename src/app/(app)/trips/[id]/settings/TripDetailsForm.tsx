"use client";

import { useActionState, useState } from "react";
import FormFeedback from "@/components/FormFeedback";
import { TripFields, type TripFieldValues } from "@/components/form-fields";
import SubmitButton from "@/components/SubmitButton";
import { useI18n } from "@/lib/i18n/client";
import { updateTripAction, type ActionState } from "../../../actions";

const initial: ActionState = {};

export default function TripDetailsForm({
  tripId,
  title,
  summary,
  startDate,
  endDate,
}: {
  tripId: number;
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
}) {
  const [state, action] = useActionState(updateTripAction, initial);
  const { t } = useI18n();

  const [fields, setFields] = useState<TripFieldValues>({ title, startDate, endDate, summary });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tripId" value={tripId} />

      <TripFields
        idPrefix="trip-"
        values={fields}
        onChange={setFields}
        titleLabel={t.common.name}
        summaryLabel={t.tripDetails.description}
        rangeHint={t.tripDetails.rangeHint}
      />

      <FormFeedback error={state.error} success={state.ok && t.common.saved} />

      <SubmitButton className="btn btn-secondary" pendingLabel={t.common.saving}>
        {t.common.save}
      </SubmitButton>
    </form>
  );
}
