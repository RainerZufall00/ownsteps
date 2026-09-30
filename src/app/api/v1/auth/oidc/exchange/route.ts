import { getUserById } from "@/lib/auth";
import { handle, json, problem, readJson } from "@/lib/api/http";
import { oidcExchangeSchema } from "@/lib/api/schemas";
import { userDto } from "@/lib/api/serialize";
import { clientAddress, createRateLimit } from "@/lib/rate-limit";
import { parseInput } from "@/lib/schemas";
import { exchangeAuthCode } from "@/lib/tokens";

const attempts = createRateLimit({ windowMs: 60_000, max: 10 });

/** Trades the one-time code from `ownsteps://auth` plus the PKCE verifier for a device token. */
export async function POST(request: Request) {
  return handle(async () => {
    if (!attempts(clientAddress(request.headers))) return problem("too_many_attempts");
    const input = parseInput(oidcExchangeSchema, await readJson(request));
    const { token, row } = await exchangeAuthCode(input.code, input.codeVerifier);
    const user = await getUserById(row.userId);
    return json({ token, user: userDto(user!) }, 201);
  });
}
