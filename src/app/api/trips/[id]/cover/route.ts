import { ServiceError } from "@/lib/errors";
import { withMultipart } from "@/lib/multipart";
import { fromUpload, uploadCover, uploadLimitFor } from "@/lib/services/media";
import { handleWeb } from "@/lib/web-route";

/**
 * A trip's optional cover image. Like every large upload it deliberately runs
 * through its own route (not a Server Action) and is excluded from the proxy –
 * otherwise the body would be buffered and capped at 10 MB.
 *
 * The cover is the public showcase: `/api/photos` serves it without sign-in as
 * soon as the trip is shared. All other photos stay behind the share link.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/trips/[id]/cover">,
) {
  return handleWeb(async () => {
    const { id } = await context.params;
    return withMultipart(request, uploadLimitFor, async (form) => {
      const file = form.file("file");
      if (!file) throw new ServiceError("no_file");
      const photo = await uploadCover(Number(id), fromUpload(file));
      return Response.json({ ok: true, photoId: photo.id });
    });
  });
}
