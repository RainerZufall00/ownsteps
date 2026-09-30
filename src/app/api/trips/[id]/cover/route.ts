import { getCurrentUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { messageFor } from "@/lib/messages";
import { fromFormFile, uploadCover } from "@/lib/services/media";

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
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: messageFor("not_signed_in") }, { status: 401 });

  const { id } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: messageFor("no_file") }, { status: 400 });
  }

  try {
    const photo = await uploadCover(Number(id), fromFormFile(file));
    return Response.json({ ok: true, photoId: photo.id });
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return Response.json({ error: messageFor(error.code) }, { status: error.status });
  }
}
