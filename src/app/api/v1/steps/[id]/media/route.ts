import { handle, idParam, json, problem } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { photoDto, stepDto } from "@/lib/api/serialize";
import { negotiateLocale } from "@/lib/i18n/locales";
import { withMultipart } from "@/lib/multipart";
import { addMediaToStep, fromUpload, uploadLimitFor } from "@/lib/services/media";
import { getStep } from "@/lib/trips";

/**
 * Uploads one photo or video to a step (multipart: `file`, for videos
 * `poster` and `durationMs`, optionally `clientUuid` and `caption`). One
 * file per request suits background uploads, and a retry with the same
 * `clientUuid` returns the photo stored the first time.
 *
 * Must stay excluded from the proxy matcher (src/proxy.ts) – otherwise Next
 * caps the body at 10 MB.
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/steps/[id]/media">) {
  return handle(async () => {
    await requireAuthor(request);
    const stepId = idParam((await context.params).id, "step_not_found");

    return withMultipart(request, uploadLimitFor, async (form) => {
      const file = form.file("file");
      if (!file) return problem("no_file");

      // The app's URLSession sends the app language as Accept-Language.
      const language = negotiateLocale(request.headers.get("accept-language"));
      const result = await addMediaToStep(stepId, [
        {
          ...fromUpload(file, {
            poster: form.file("poster"),
            durationMs: Number(form.fields.get("durationMs")),
          }),
          clientUuid: form.fields.get("clientUuid") || null,
          caption: form.fields.get("caption") ?? null,
        },
      ], language);

      const failure = result.failed[0];
      if (failure) return problem(failure.code);
      return json(
        { photo: photoDto(result.photos[0]), step: stepDto((await getStep(stepId))!) },
        201,
      );
    });
  });
}
