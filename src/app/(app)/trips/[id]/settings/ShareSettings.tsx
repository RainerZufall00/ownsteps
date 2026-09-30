"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import SubmitButton from "@/components/SubmitButton";
import { updateShareAction, type ActionState } from "../../../actions";

const initial: ActionState = {};

export default function ShareSettings({
  tripId,
  shareUrl,
  shareEnabled,
  hasPassword,
}: {
  tripId: number;
  shareUrl: string;
  shareEnabled: boolean;
  hasPassword: boolean;
}) {
  const [state, action] = useActionState(updateShareAction, initial);
  const [enabled, setEnabled] = useState(shareEnabled);
  const [copied, setCopied] = useState(false);
  const checkbox = useRef<HTMLInputElement>(null);

  // React's form reset after each action unchecks the box in the DOM; the
  // prop didn't change, so React won't put it back by itself.
  useEffect(() => {
    if (checkbox.current) checkbox.current.checked = enabled;
  }, [enabled, state]);

  async function share() {
    // On phones the native share sheet, otherwise the clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl });
        return;
      } catch {
        // Cancelled – copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tripId" value={tripId} />
      {/*
        The state travels in a hidden field, not the checkbox: React 19 resets
        the form after every action, which unchecks the checkbox in the DOM
        while `enabled` stays true. The next save – e.g. setting a password –
        then silently switched sharing off.
      */}
      <input type="hidden" name="shareEnabled" value={enabled ? "on" : ""} />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          ref={checkbox}
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            const form = event.target.form;
            // Toggle the state, not the DOM value – see the effect above.
            // flushSync renders the hidden field before submitting.
            flushSync(() => setEnabled(!enabled));
            form?.requestSubmit();
          }}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
        <span>
          <span className="block font-medium">Reise über Link teilen</span>
          <span className="block text-[14px] text-ink-soft">
            Wer den Link hat, kann mitlesen – ohne Account, ohne Suchmaschine.
          </span>
        </span>
      </label>

      {enabled && (
        <>
          <div className="rounded-2xl bg-surface-muted p-3">
            <p className="break-all font-mono text-[13px] leading-relaxed text-ink-soft">
              {shareUrl}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={share}
                className="btn btn-primary flex-1 px-4 py-2.5 text-sm"
              >
                {copied ? "Kopiert!" : "Link teilen"}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary px-4 py-2.5 text-sm"
              >
                Ansehen
              </a>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="sharePassword">
              Zusätzliches Passwort{" "}
              <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              id="sharePassword"
              name="sharePassword"
              type="text"
              autoComplete="off"
              className="field"
              placeholder={hasPassword ? "Neues Passwort setzen" : "Kein Passwort"}
            />
            {hasPassword && (
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  name="removePassword"
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Passwortschutz aufheben
              </label>
            )}
          </div>
        </>
      )}

      {state.error && (
        <p className="text-sm font-medium text-accent">{state.error}</p>
      )}
      {state.ok && <p className="text-sm font-medium text-sea">Gespeichert.</p>}

      <SubmitButton className="btn btn-secondary" pendingLabel="Speichern …">
        Einstellungen speichern
      </SubmitButton>
    </form>
  );
}
