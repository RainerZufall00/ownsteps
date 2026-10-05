"use client";

import { useFormStatus } from "react-dom";
import { useI18n } from "@/lib/i18n/client";

export default function SubmitButton({
  children,
  className = "btn btn-primary w-full",
  pendingLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? t.common.moment) : children}
    </button>
  );
}
