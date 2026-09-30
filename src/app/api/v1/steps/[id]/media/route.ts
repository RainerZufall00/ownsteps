import { handle, idParam, json, problem } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { photoDto, stepDto } from "@/lib/api/serialize";
import { addMediaToStep, fromFormFile } from "@/lib/services/media";
import { getStep } from "@/lib/trips";

/**
 * Uploads one photo or video to a step (multipart: `file`, for videos
 * `poster` and `durationMs`, optionally `clientUuid`). One file per request
 * suits background uploads, and a retry with the same `clientUuid` returns
 * the photo stored the first time.
 *
 * Must stay excluded from the proxy matcher (src/proxy.ts) – otherwise Next
 * caps the body at 10 MB.
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/steps/[id]/media">) {
  return handle(async () => {
    await requireAuthor(request);
    const stepId = idParam((await context.params).id, "step_not_found");

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) return problem("no_file");
    const poster = form.get("poster");
    const clientUuid = form.get("clientUuid");

    const result = await addMediaToStep(stepId, [
      {
        ...fromFormFile(file, {
          poster: poster instanceof File ? poster : null,
          durationMs: Number(form.get("durationMs")),
        }),
        clientUuid: typeof clientUuid === "string" && clientUuid ? clientUuid : null,
      },
    ]);

    const failure = result.failed[0];
    if (failure) return problem(failure.code);
    return json(
      { photo: photoDto(result.photos[0]), step: stepDto((await getStep(stepId))!) },
      201,
    );
  });
}
