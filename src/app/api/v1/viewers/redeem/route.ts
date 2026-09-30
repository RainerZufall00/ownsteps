import { handle, json, readJson } from "@/lib/api/http";
import { redeemSchema } from "@/lib/api/schemas";
import { viewerDto } from "@/lib/api/serialize";
import { tripSummaryDto } from "@/lib/api/trips";
import { clientAddress } from "@/lib/rate-limit";
import { parseInput } from "@/lib/schemas";
import { redeemViewer } from "@/lib/services/viewers";

/**
 * Public: turns a share link into a viewer token for this one trip ([D17]).
 * The same link can be redeemed by any number of readers.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const input = parseInput(redeemSchema, await readJson(request));
    const { token, device, trip } = await redeemViewer(input, clientAddress(request.headers));
    const principal = { kind: "viewer" as const, device };
    return json(
      {
        token,
        viewer: viewerDto(device),
        trip: await tripSummaryDto(principal, trip, request),
      },
      201,
    );
  });
}
