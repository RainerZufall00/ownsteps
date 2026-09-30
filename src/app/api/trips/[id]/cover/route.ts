import { db } from "@/db";
import { photos } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { processUpload } from "@/lib/images";
import { MAX_IMAGE_BYTES } from "@/lib/limits";
import { getTrip, updateTrip } from "@/lib/trips";

const ACCEPTED = /^image\/(jpeg|png|webp|avif|heic|heif|tiff)$/i;

/**
 * A trip's optional cover image. Like every large upload it deliberately runs
 * through its own route (not a Server Action) and is excluded from the proxy –
 * otherwise the body would be buffered and capped at 10 MB.
 *
 * The cover is the public showcase: `/api/photos` serves it without sign-in as
 * soon as the trip is shared. All other photos stay behind the share link.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/trips/[id]/cover">,
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { id } = await context.params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId)) {
    return Response.json({ error: "Reise nicht gefunden" }, { status: 400 });
  }
  const trip = await getTrip(tripId);
  if (!trip) return Response.json({ error: "Reise nicht gefunden" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Keine Datei erhalten" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Datei ist größer als 25 MB." }, { status: 400 });
  }
  if (file.type && !ACCEPTED.test(file.type)) {
    return Response.json({ error: "Kein unterstütztes Format." }, { status: 400 });
  }

  let meta;
  try {
    meta = await processUpload(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    console.error("[cover] failed", file.name, error);
    return Response.json(
      { error: "Bild konnte nicht verarbeitet werden." },
      { status: 422 },
    );
  }

  // The cover isn't attached to any step (step_id stays empty).
  const [photo] = await db
    .insert(photos)
    .values({
      tripId,
      stepId: null,
      storageKey: meta.storageKey,
      originalName: file.name,
      width: meta.width,
      height: meta.height,
      bytes: meta.bytes,
      placeholder: meta.placeholder,
      mediaType: "photo",
      sortOrder: -1,
    })
    .returning();

  await updateTrip(tripId, { coverPhotoId: photo.id });

  return Response.json({ ok: true, photoId: photo.id });
}
