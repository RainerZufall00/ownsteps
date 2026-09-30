import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { serveMediaVariant } from "@/lib/serve-media";
import { getTripByShareToken, hasUnlock } from "@/lib/share";

/**
 * Media for guests of a shared trip. The secret token is in the path and acts
 * as the credential here – unlike `/api/photos`, it isn't enough that a trip
 * is shared at all. That keeps the link the secret: without it you get no
 * photo, and a new token invalidates old image URLs immediately. With password
 * protection the trip must be unlocked as well.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/share-media/[token]/[id]/[variant]">,
) {
  const { token, id, variant } = await context.params;

  const trip = await getTripByShareToken(token);
  if (!trip) return new Response("Not found", { status: 404 });
  if (!(await hasUnlock(trip))) {
    return new Response("Forbidden", { status: 403 });
  }

  const photoId = Number(id);
  if (!Number.isInteger(photoId)) {
    return new Response("Not found", { status: 404 });
  }

  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  const photo = rows[0];
  // The photo must belong to exactly this trip – otherwise one trip's token
  // would be a master key for every other trip's photos.
  if (!photo || photo.tripId !== trip.id) {
    return new Response("Not found", { status: 404 });
  }

  return serveMediaVariant({
    storageKey: photo.storageKey,
    variant,
    videoMime: photo.videoMime,
    request,
  });
}
