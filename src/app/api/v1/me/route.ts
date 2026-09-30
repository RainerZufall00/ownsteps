import { handle, json } from "@/lib/api/http";
import { requirePrincipal } from "@/lib/api/principal";
import { userDto, viewerDto } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/** Who the token belongs to – lets the app check a stored token is still valid. */
export async function GET(request: Request) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    return json(
      principal.kind === "author"
        ? { kind: "author", user: userDto(principal.user) }
        : { kind: "viewer", viewer: viewerDto(principal.device) },
    );
  });
}
