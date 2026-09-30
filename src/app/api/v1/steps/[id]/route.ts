import { handle, idParam, json, readJson } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { stepPatchSchema } from "@/lib/api/schemas";
import { stepDto } from "@/lib/api/serialize";
import { parseInput } from "@/lib/schemas";
import { patchStep, removeStep } from "@/lib/services/steps";

/** Editing needs a connection; only new steps can be written offline ([D19]). */
export async function PATCH(request: Request, context: RouteContext<"/api/v1/steps/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    const stepId = idParam((await context.params).id, "step_not_found");
    const patch = parseInput(stepPatchSchema, await readJson(request));
    return json(stepDto(await patchStep(stepId, patch)));
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/v1/steps/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    const stepId = idParam((await context.params).id, "step_not_found");
    await removeStep(stepId);
    return new Response(null, { status: 204 });
  });
}
