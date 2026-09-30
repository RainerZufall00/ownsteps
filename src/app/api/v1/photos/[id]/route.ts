import { handle, idParam, json, readJson } from "@/lib/api/http";
import { requireAuthor } from "@/lib/api/principal";
import { photoPatchSchema } from "@/lib/api/schemas";
import { photoDto } from "@/lib/api/serialize";
import { parseInput } from "@/lib/schemas";
import { removePhoto, updateCaption } from "@/lib/services/media";

export async function PATCH(request: Request, context: RouteContext<"/api/v1/photos/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    const photoId = idParam((await context.params).id, "photo_not_found");
    const { caption } = parseInput(photoPatchSchema, await readJson(request));
    return json(photoDto(await updateCaption(photoId, caption)));
  });
}

/** Idempotent: deleting a photo that's already gone also answers 204. */
export async function DELETE(request: Request, context: RouteContext<"/api/v1/photos/[id]">) {
  return handle(async () => {
    await requireAuthor(request);
    const photoId = idParam((await context.params).id, "photo_not_found");
    await removePhoto(photoId);
    return new Response(null, { status: 204 });
  });
}
