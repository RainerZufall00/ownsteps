import { handle, idParam, json, problem } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { photoDto } from "@/lib/api/serialize";
import { fromFormFile, uploadCover } from "@/lib/services/media";

/**
 * Uploads a trip's cover image (multipart, field `file`). Excluded from the
 * proxy matcher like every large upload (src/proxy.ts).
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/trips/[id]/cover">) {
  return handle(async () => {
    await requireAuthor(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return problem("no_file");
    const photo = await uploadCover(tripId, fromFormFile(file));
    return json(photoDto(photo), 201);
  });
}
