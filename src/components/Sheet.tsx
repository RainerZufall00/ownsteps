"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { CloseIcon } from "./icons";

/**
 * A sheet from the bottom edge, like the apps' – for comments, a step's whole
 * text and the trip's details on phones and tablets. Built on a modal
 * `<dialog>`: the browser keeps focus inside, closes it on Escape and hides
 * the rest of the page from screen readers. Tapping beside it closes it too.
 * Its content mounts only while it's open.
 */
export default function Sheet({
  open,
  onClose,
  title,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Shown as the sheet's heading and read as its name. */
  title?: string;
  /** The name without a visible heading, when the content brings its own. */
  label?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      // React passes `close` of dialogs inside up its tree; only this one counts.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // The backdrop belongs to the dialog element; the content fills it
      // completely, so a click on the dialog itself came from beside it.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className="sheet mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-ink shadow-float backdrop:bg-black/40 sm:max-w-xl"
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain px-5 pt-2 safe-bottom">
          <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-2 pt-1">
            <div aria-hidden="true" className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-line" />
            {/* A row of its own: the content's top right may hold controls. */}
            <div className="flex items-center justify-between gap-3">
              {title ? (
                <h2 id={titleId} className="text-lg font-bold tracking-tight">
                  {title}
                </h2>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-ink-soft transition hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
