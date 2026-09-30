"use client";

import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { rotateShareTokenAction } from "../../../actions";

/**
 * A new link invalidates the old one – anyone who already sent it out locks
 * all readers out, with no way back: the old token is gone afterwards. That's
 * why, like deleting, it sits behind a second step.
 */
export default function RotateShareForm({ tripId }: { tripId: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-ink-soft transition hover:text-accent"
        >
          Neuen Link erzeugen
        </button>
        <p className="mt-1 text-[13px] text-ink-faint">
          Der bisherige Link funktioniert danach nicht mehr.
        </p>
      </div>
    );
  }

  return (
    <form
      action={rotateShareTokenAction}
      className="mt-5 border-t border-line pt-4"
    >
      <input type="hidden" name="tripId" value={tripId} />

      <p className="text-[15px] font-medium">Neuen Link erzeugen?</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
        Der bisherige Link wird sofort ungültig. Alle, denen du ihn geschickt
        hast, kommen dann nicht mehr hinein – du müsstest ihnen den neuen Link
        noch einmal schicken.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-secondary flex-1 px-4 py-2.5 text-sm"
        >
          Abbrechen
        </button>
        <SubmitButton
          className="btn flex-1 border border-accent px-4 py-2.5 text-sm text-accent"
          pendingLabel="Wird erzeugt …"
        >
          Neuen Link erzeugen
        </SubmitButton>
      </div>
    </form>
  );
}
