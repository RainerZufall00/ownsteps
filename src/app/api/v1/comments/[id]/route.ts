import { handle, idParam, noContent } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { removeComment } from "@/lib/services/comments";

/** Deleting comments is reserved for authors. */
export async function DELETE(request: Request, context: RouteContext<"/api/v1/comments/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    const commentId = idParam((await context.params).id, "comment_not_found");
    await removeComment(commentId);
    return noContent();
  });
}
