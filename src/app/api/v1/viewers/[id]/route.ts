import { handle, idParam, noContent } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { removeViewer } from "@/lib/services/viewers";

/** An author removes a single reader's device. */
export async function DELETE(request: Request, context: RouteContext<"/api/v1/viewers/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    await removeViewer(idParam((await context.params).id, "viewer_not_found"));
    return noContent();
  });
}
