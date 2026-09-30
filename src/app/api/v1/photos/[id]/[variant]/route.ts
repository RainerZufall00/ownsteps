import { handle, idParam } from "@/lib/api/http";
import { requirePrincipal, requireReadableTrip } from "@/lib/api/principal";
import { serveMediaVariant } from "@/lib/serve-media";
import { requirePhoto } from "@/lib/services/media";

export const dynamic = "force-dynamic";

/**
 * Photo and video files for the app (`thumb`, `medium`, `large`, `video`).
 * Same access rule as the trip itself: authors everything, a viewer only
 * the photos of its trip while it's shared.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/photos/[id]/[variant]">,
) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    const { id, variant } = await context.params;
    const photo = await requirePhoto(idParam(id, "photo_not_found"));
    await requireReadableTrip(principal, photo.tripId);
    return serveMediaVariant({
      storageKey: photo.storageKey,
      variant,
      videoMime: photo.videoMime,
      request,
    });
  });
}
