import { handle, json, noContent, readJson } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { tokenRequestSchema } from "@/lib/api/schemas";
import { userDto } from "@/lib/api/serialize";
import { parseInput } from "@/lib/schemas";
import { clientAddress } from "@/lib/rate-limit";
import { authenticate } from "@/lib/services/accounts";
import { createApiToken, revokeApiToken } from "@/lib/tokens";

/** Password sign-in for the app: returns a device token ([D14], [D15]). */
export async function POST(request: Request) {
  return handle(async () => {
    const input = parseInput(tokenRequestSchema, await readJson(request));
    // Shares its brakes with the web login.
    const user = await authenticate(input, clientAddress(request.headers));
    const { token } = await createApiToken(user.id, input.deviceName);
    return json({ token, user: userDto(user) }, 201);
  });
}

/** Signs this device out: the token used for the request stops working. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const principal = await requireAuthor(request);
    await revokeApiToken(principal.tokenId, principal.user.id);
    return noContent();
  });
}
