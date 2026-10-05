import { getCurrentUser } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { messageFor } from "@/lib/messages";
import { type MultipartForm, parseMultipart } from "@/lib/multipart";
import { addMediaToStep, fromUpload, removePhoto, uploadLimitFor } from "@/lib/services/media";

/**
 * Uploads from the web editor. The logic lives in `addMediaToStep`; this
 * route only unpacks the multipart form, streamed to disk (`parseMultipart`).
 * It must stay excluded from the proxy matcher (see src/proxy.ts), otherwise
 * Next buffers the body and caps it at 10 MB.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: messageFor("not_signed_in") }, { status: 401 });

  let form: MultipartForm | null = null;
  try {
    form = await parseMultipart(request, uploadLimitFor);
    const { fields } = form;
    const stepId = Number(fields.get("stepId"));

    // The browser creates a video's poster frame when the file is picked and
    // sends it as `poster<index>`, the length as `duration<index>`.
    const incoming = form.files
      .filter((file) => file.field === "files")
      .map((file, position) =>
        fromUpload(file, {
          poster: form!.file(`poster${position}`),
          durationMs: Number(fields.get(`duration${position}`)),
        }),
      );

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
  } finally {
    await form?.dispose();
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
