import { ServiceError } from "@/lib/errors";
import { messageFor } from "@/lib/messages";
import { withMultipart } from "@/lib/multipart";
import { addMediaToStep, fromUpload, removePhoto, uploadLimitFor } from "@/lib/services/media";
import { toViewPhoto, type UploadResult } from "@/lib/view-types";
import { handleWeb } from "@/lib/web-route";

/**
 * Uploads from the web editor. The logic lives in `addMediaToStep`; this
 * route only unpacks the multipart form, streamed to disk (`parseMultipart`).
 * It must stay excluded from the proxy matcher (see src/proxy.ts), otherwise
 * Next buffers the body and caps it at 10 MB.
 */
export async function POST(request: Request) {
  return handleWeb(({ locale }) =>
    withMultipart(request, uploadLimitFor, async (form) => {
      const { fields } = form;

      // The browser creates a video's poster frame when the file is picked and
      // sends it as `poster<index>`, the length as `duration<index>`.
      const incoming = form.files
        .filter((file) => file.field === "files")
        .map((file, position) =>
          fromUpload(file, {
            poster: form.file(`poster${position}`),
            durationMs: Number(fields.get(`duration${position}`)),
          }),
        );

      const result = await addMediaToStep(Number(fields.get("stepId")), incoming, locale);
      return Response.json({
        photos: result.photos.map(toViewPhoto),
        failed: result.failed.map((f) => ({ name: f.name, reason: messageFor(locale, f.code) })),
        derived: result.derived,
      } satisfies UploadResult);
    }),
  );
}

export async function DELETE(request: Request) {
  return handleWeb(async () => {
    const photoId = Number(new URL(request.url).searchParams.get("photoId"));
    if (!Number.isInteger(photoId)) throw new ServiceError("invalid_request");
    await removePhoto(photoId);
    return Response.json({ ok: true });
  });
}
