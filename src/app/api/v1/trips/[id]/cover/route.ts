import { handle, idParam, json, problem } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { photoDto } from "@/lib/api/serialize";
import { parseMultipart } from "@/lib/multipart";
import { fromUpload, uploadCover, uploadLimitFor } from "@/lib/services/media";

/**
 * Uploads a trip's cover image (multipart, field `file`). Excluded from the
 * proxy matcher like every large upload (src/proxy.ts).
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/trips/[id]/cover">) {
  return handle(async () => {
    await requireAuthor(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const form = await parseMultipart(request, uploadLimitFor);
    try {
      const file = form.file("file");
      if (!file) return problem("no_file");
      const photo = await uploadCover(tripId, fromUpload(file));
      return json(photoDto(photo), 201);
    } finally {
      await form.dispose();
    }
  });
}
