import { handle, idParam, json, readJson } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { stepCreateSchema } from "@/lib/api/schemas";
import { stepDto } from "@/lib/api/serialize";
import { negotiateLocale } from "@/lib/i18n/locales";
import { parseInput } from "@/lib/schemas";
import { createStepFromApp } from "@/lib/services/steps";

/**
 * Creates a step, typically one written offline ([D19]). With a
 * `clientUuid`, repeating the request returns the existing step (200)
 * instead of creating a second one (201).
 */
export async function POST(request: Request, context: RouteContext<"/api/v1/trips/[id]/steps">) {
  return handle(async () => {
    const principal = await requireAuthor(request);
    const tripId = idParam((await context.params).id, "trip_not_found");
    const input = parseInput(stepCreateSchema, await readJson(request));
    // The app sends its language as Accept-Language.
    const language = negotiateLocale(request.headers.get("accept-language"));
    const { step, created } = await createStepFromApp(tripId, principal.user.id, input, language);
    return json(stepDto(step), created ? 201 : 200);
  });
}
