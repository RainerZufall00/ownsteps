import { handle, json, problem, readJson } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { tokenRequestSchema } from "@/lib/api/schemas";
import { userDto } from "@/lib/api/serialize";
import { parseInput } from "@/lib/schemas";
import { clientAddress, createRateLimit } from "@/lib/rate-limit";
import { authenticate } from "@/lib/services/accounts";
import { createApiToken, revokeApiToken } from "@/lib/tokens";

const attempts = createRateLimit({ windowMs: 60_000, max: 10 });

/** Password sign-in for the app: returns a device token ([D14], [D15]). */
export async function POST(request: Request) {
  return handle(async () => {
    if (!attempts(clientAddress(request.headers))) return problem("too_many_attempts");
    const input = parseInput(tokenRequestSchema, await readJson(request));
    const user = await authenticate(input);
    const { token } = await createApiToken(user.id, input.deviceName);
    return json({ token, user: userDto(user) }, 201);
  });
}

/** Signs this device out: the token used for the request stops working. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const principal = await requireAuthor(request);
    await revokeApiToken(principal.tokenId, principal.user.id);
    return new Response(null, { status: 204 });
  });
}
