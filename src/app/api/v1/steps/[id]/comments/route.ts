import { handle, idParam, json, readJson } from "@/lib/api/http";
import { requirePrincipal, requireReadableTrip } from "@/lib/api/principal";
import { commentCreateSchema } from "@/lib/api/schemas";
import { commentDto } from "@/lib/api/serialize";
import { ServiceError } from "@/lib/errors";
import { parseInput } from "@/lib/schemas";
import { postComment } from "@/lib/services/comments";
import { getStep } from "@/lib/trips";

/**
 * Authors comment under their account name, viewers under the name they
 * chose when redeeming the link – nobody has to type it again.
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/steps/[id]/comments">) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    const stepId = idParam((await context.params).id, "step_not_found");
    const input = parseInput(commentCreateSchema, await readJson(request));

    const step = await getStep(stepId);
    if (!step || !step.published) throw new ServiceError("step_not_found");

    const { comment } = await postComment({
      tripId: step.tripId,
      stepId,
      raw: {
        authorName: principal.kind === "author" ? principal.user.name : principal.device.name,
        body: input.body,
      },
      clientKey:
        principal.kind === "author"
          ? `user:${principal.user.id}`
          : `viewer:${principal.device.id}`,
      resolveAccess: async (trip) => {
        try {
          await requireReadableTrip(principal, trip.id);
          return { kind: principal.kind === "author" ? "owner" : "guest" };
        } catch {
          return { kind: "denied" };
        }
      },
    });
    return json(commentDto(comment), 201);
  });
}
