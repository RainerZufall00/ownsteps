import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { serveMediaVariant } from "@/lib/serve-media";
import { getTripByShareToken, hasUnlock } from "@/lib/share";

/**
 * Medien für Gäste einer geteilten Reise. Der geheime Token steht im Pfad und
 * ist hier der Ausweis – anders als bei `/api/photos` genügt es nicht, dass
 * eine Reise überhaupt freigegeben ist. So bleibt der Link das Geheimnis: Wer
 * ihn nicht hat, kommt an kein Foto, und ein neuer Token macht alte Bild-URLs
 * sofort ungültig. Bei Passwortschutz muss zusätzlich entsperrt sein.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/share-media/[token]/[id]/[variant]">,
) {
  const { token, id, variant } = await context.params;

  const trip = await getTripByShareToken(token);
  if (!trip) return new Response("Nicht gefunden", { status: 404 });
  if (!(await hasUnlock(trip))) {
    return new Response("Kein Zugriff", { status: 403 });
  }

  const photoId = Number(id);
  if (!Number.isInteger(photoId)) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  const photo = rows[0];
  // Das Foto muss zu genau dieser Reise gehören – sonst wäre der Token einer
  // Reise ein Generalschlüssel für die Fotos aller anderen.
  if (!photo || photo.tripId !== trip.id) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  return serveMediaVariant({
    storageKey: photo.storageKey,
    variant,
    videoMime: photo.videoMime,
    request,
  });
}
