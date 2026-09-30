import { handle, problem } from "@/lib/api/http";
import { requirePrincipal } from "@/lib/api/principal";
import { removeViewer } from "@/lib/services/viewers";

/** A reader unsubscribes: the viewer token used for the request is removed. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const principal = await requirePrincipal(request);
    if (principal.kind !== "viewer") return problem("invalid_request");
    await removeViewer(principal.device.id);
    return new Response(null, { status: 204 });
  });
}
