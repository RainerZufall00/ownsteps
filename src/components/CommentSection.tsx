"use client";

import { useActionState, useEffect, useState } from "react";
import { addCommentAction, type CommentState } from "@/app/comment-actions";
import { deleteCommentAction } from "@/app/comment-actions";
import { formatDateShort } from "@/lib/format";
import type { ViewComment } from "@/lib/view-types";

const initial: CommentState = {};

/** Merkt sich den Namen, damit ihn niemand bei jedem Kommentar neu tippt. */
const NAME_KEY = "ownsteps_kommentar_name";

export default function CommentSection({
  tripId,
  stepId,
  comments,
  canDelete,
}: {
  tripId: number;
  stepId: number;
  comments: ViewComment[];
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState(addCommentAction, initial);
  const [liste, setListe] = useState<ViewComment[]>(comments);
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setName(window.localStorage.getItem(NAME_KEY) ?? "");
  }, []);

  // Neu abgeschickte Kommentare sofort anzeigen, ohne die Seite neu zu laden.
  useEffect(() => {
    if (!state.comment) return;
    setListe((current) =>
      current.some((c) => c.id === state.comment!.id)
        ? current
        : [...current, state.comment!],
    );
    setOffen(false);
    window.localStorage.setItem(NAME_KEY, name);
  }, [state.comment, name]);

  return (
    <section className="mt-4 border-t border-line pt-3">
      {liste.length > 0 && (
        <ul className="mb-3 space-y-2.5">
          {liste.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-bold text-ink-soft"
                aria-hidden="true"
              >
                {comment.authorName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">
                  {comment.authorName}
                  <span className="ml-2 font-normal text-ink-faint">
                    {formatDateShort(comment.createdAt)}
                  </span>
                </p>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink/90">
                  {comment.body}
                </p>
              </div>
              {canDelete && (
                <form
                  action={async (formData) => {
                    setListe((c) => c.filter((x) => x.id !== comment.id));
                    await deleteCommentAction(formData);
                  }}
                >
                  <input type="hidden" name="commentId" value={comment.id} />
                  <input type="hidden" name="tripId" value={tripId} />
                  <button
                    type="submit"
                    aria-label="Kommentar löschen"
                    className="text-ink-faint transition hover:text-accent"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        d="m6 6 12 12M18 6 6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {offen ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="stepId" value={stepId} />
          <input
            name="authorName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            className="field py-2 text-[15px]"
            placeholder="Dein Name"
            aria-label="Dein Name"
          />
          <textarea
            name="body"
            required
            rows={3}
            maxLength={1500}
            className="field resize-none py-2 text-[15px]"
            placeholder="Was möchtest du sagen?"
            aria-label="Kommentar"
          />
          {state.error && (
            <p className="text-sm font-medium text-accent">{state.error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffen(false)}
              className="btn btn-ghost flex-1 py-2 text-sm"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary flex-1 py-2 text-sm disabled:opacity-50"
            >
              {pending ? "Wird gesendet …" : "Absenden"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOffen(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft transition hover:text-accent"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M21 12a8 8 0 0 1-8 8H5l-1 2-1-4a8 8 0 0 1 8-12h2a8 8 0 0 1 8 6Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          {liste.length > 0 ? "Auch etwas sagen" : "Kommentar schreiben"}
        </button>
      )}
    </section>
  );
}
