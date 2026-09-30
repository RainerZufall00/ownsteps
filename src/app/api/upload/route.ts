import { getCurrentUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { messageFor } from "@/lib/messages";
import { addMediaToStep, fromFormFile, removePhoto } from "@/lib/services/media";

/**
 * Uploads from the web editor. The logic lives in `addMediaToStep`; this
 * route only unpacks the multipart form. It must stay excluded from the proxy
 * matcher (see src/proxy.ts), otherwise Next caps the body at 10 MB.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: messageFor("not_signed_in") }, { status: 401 });

  const form = await request.formData();
  const stepId = Number(form.get("stepId"));
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  // The browser creates a video's poster frame when the file is picked and
  // sends it as `poster<index>`, the length as `duration<index>`.
  const incoming = files.map((file, position) => {
    const poster = form.get(`poster${position}`);
    return fromFormFile(file, {
      poster: poster instanceof File ? poster : null,
      durationMs: Number(form.get(`duration${position}`)),
    });
  });

  try {
    const result = await addMediaToStep(stepId, incoming);
    return Response.json({
      photos: result.photos.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        placeholder: p.placeholder,
        caption: p.caption,
        mediaType: p.mediaType,
        durationMs: p.durationMs,
        lat: p.lat,
        lon: p.lon,
        takenAt: p.takenAt,
      })),
      failed: result.failed.map((f) => ({ name: f.name, reason: messageFor(f.code) })),
      derived: result.derived,
    });
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return Response.json({ error: messageFor(error.code) }, { status: error.status });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: messageFor("not_signed_in") }, { status: 401 });

  const photoId = Number(new URL(request.url).searchParams.get("photoId"));
  if (!Number.isInteger(photoId)) {
    return Response.json({ error: messageFor("invalid_request") }, { status: 400 });
  }

  await removePhoto(photoId);
  return Response.json({ ok: true });
}
