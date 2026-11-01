import { handle, json, readJson } from "@/lib/api/http";
import { requireAuthor, requirePrincipal } from "@/lib/api/principal";
import { userDto, viewerDto } from "@/lib/api/serialize";
import { renameAccount } from "@/lib/services/accounts";

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

/** The author's name, here and on everything they commented. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const { user } = await requireAuthor(request);
    return json(userDto(await renameAccount(user, await readJson(request))));
  });
}
