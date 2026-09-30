import { handle, idParam } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { ServiceError } from "@/lib/errors";
import { getComment } from "@/lib/comments";
import { removeComment } from "@/lib/services/comments";

/** Deleting comments is reserved for authors. */
export async function DELETE(request: Request, context: RouteContext<"/api/v1/comments/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    const commentId = idParam((await context.params).id, "comment_not_found");
    if (!(await getComment(commentId))) throw new ServiceError("comment_not_found");
    await removeComment(commentId);
    return new Response(null, { status: 204 });
  });
}
