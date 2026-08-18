import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { serveMediaVariant } from "@/lib/serve-media";

/**
 * Medien für die angemeldete Ansicht. Angemeldete dürfen alles sehen; für
 * alle anderen ist hier nur das Titelbild einer freigegebenen Reise frei –
 * es dient als öffentliches Aushängeschild (Übersicht, Link-Vorschau).
 *
 * Gäste einer geteilten Reise laden ihre Bilder NICHT hierüber, sondern über
 * `/api/share-media/[token]/…`. Diese Route darf deshalb keinen Zugriff allein
 * daraus ableiten, dass eine Reise freigegeben ist – sonst ließen sich alle
 * Fotos jeder geteilten Reise über die fortlaufende ID abgreifen.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/photos/[id]/[variant]">,
) {
  const { id, variant } = await context.params;

  const photoId = Number(id);
  if (!Number.isInteger(photoId)) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  const rows = await db
    .select({ photo: photos, trip: trips })
    .from(photos)
    .innerJoin(trips, eq(trips.id, photos.tripId))
    .where(eq(photos.id, photoId))
    .limit(1);

  const row = rows[0];
  if (!row) return new Response("Nicht gefunden", { status: 404 });

  const user = await getCurrentUser();
  // Öffentlich ist nur ein eigens hochgeladenes Titelbild (hängt an keiner
  // Station, step_id ist leer). Ein zum Titelbild erklärtes Stationsfoto bleibt
  // geschützt – sonst würde „als Titelbild setzen" heimlich ein Foto öffentlich
  // machen.
  const istTitelbild =
    row.trip.shareEnabled &&
    row.trip.coverPhotoId === row.photo.id &&
    row.photo.stepId === null;
  if (!user && !istTitelbild) {
    return new Response("Kein Zugriff", { status: 403 });
  }

  return serveMediaVariant({
    storageKey: row.photo.storageKey,
    variant,
    videoMime: row.photo.videoMime,
    request,
  });
}
