import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos, trips } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { serveMediaVariant } from "@/lib/serve-media";

/**
 * Media for the signed-in view. Signed-in users may see everything; for
 * everyone else only the cover of a shared trip is available here – it serves
 * as the public showcase (overview, link preview).
 *
 * Guests of a shared trip do NOT load their images through here but through
 * `/api/share-media/[token]/…`. This route must therefore never derive access
 * merely from a trip being shared – otherwise every photo of every shared
 * trip could be scraped via the sequential ID.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/photos/[id]/[variant]">,
) {
  const { id, variant } = await context.params;

  const photoId = Number(id);
  if (!Number.isInteger(photoId)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await db
    .select({ photo: photos, trip: trips })
    .from(photos)
    .innerJoin(trips, eq(trips.id, photos.tripId))
    .where(eq(photos.id, photoId))
    .get();
  if (!row) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  // Only a separately uploaded cover is public (not attached to any step,
  // step_id is empty). A step photo declared as cover stays protected –
  // otherwise "set as cover" would quietly make a photo public. Behind a
  // share password nothing is public: the locked page shows no cover either.
  const isPublicCover =
    row.trip.shareEnabled &&
    !row.trip.sharePasswordHash &&
    row.trip.coverPhotoId === row.photo.id &&
    row.photo.stepId === null;
  if (!user && !isPublicCover) {
    return new Response("Forbidden", { status: 403 });
  }

  return serveMediaVariant({
    storageKey: row.photo.storageKey,
    variant,
    videoMime: row.photo.videoMime,
    request,
  });
}
