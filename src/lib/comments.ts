import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, steps } from "@/db/schema";

export const COMMENT_MAX_LENGTH = 1500;
export const NAME_MAX_LENGTH = 60;

/**
 * Einfache Bremse gegen versehentliche Doppelklicks und stumpfes Zumüllen.
 * Bewusst im Arbeitsspeicher: Bei einer Instanz für zwei Familien wäre eine
 * Tabelle dafür überzogen, und nach einem Neustart darf ruhig wieder bei null
 * angefangen werden.
 */
const letzteEintraege = new Map<string, number[]>();
const FENSTER_MS = 60_000;
const MAX_PRO_FENSTER = 5;

export function darfKommentieren(kennung: string) {
  const jetzt = Date.now();
  const bisher = (letzteEintraege.get(kennung) ?? []).filter(
    (zeit) => jetzt - zeit < FENSTER_MS,
  );
  if (bisher.length >= MAX_PRO_FENSTER) {
    letzteEintraege.set(kennung, bisher);
    return false;
  }
  bisher.push(jetzt);
  letzteEintraege.set(kennung, bisher);

  // Der Speicher soll nicht unbegrenzt wachsen.
  if (letzteEintraege.size > 500) {
    for (const [key, zeiten] of letzteEintraege) {
      if (zeiten.every((zeit) => jetzt - zeit >= FENSTER_MS)) {
        letzteEintraege.delete(key);
      }
    }
  }
  return true;
}

export async function addComment(input: {
  stepId: number;
  tripId: number;
  authorName: string;
  body: string;
}) {
  const [created] = await db
    .insert(comments)
    .values({
      stepId: input.stepId,
      tripId: input.tripId,
      authorName: input.authorName.trim().slice(0, NAME_MAX_LENGTH),
      body: input.body.trim().slice(0, COMMENT_MAX_LENGTH),
    })
    .returning();
  return created;
}

export async function deleteComment(commentId: number) {
  await db.delete(comments).where(eq(comments.id, commentId));
}

/** Prüft, ob der Beitrag wirklich zu dieser Reise gehört. */
export async function stepBelongsToTrip(stepId: number, tripId: number) {
  const rows = await db
    .select({ id: steps.id })
    .from(steps)
    .where(and(eq(steps.id, stepId), eq(steps.tripId, tripId)))
    .limit(1);
  return rows.length > 0;
}
