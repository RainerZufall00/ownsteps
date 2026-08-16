import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { photos, steps } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { reverseGeocode } from "@/lib/geocode";
import { processUpload } from "@/lib/images";
import { deletePhoto } from "@/lib/photos";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|avif|heic|heif|tiff)$/i;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

  const form = await request.formData();
  const stepId = Number(form.get("stepId"));
  if (!Number.isInteger(stepId)) {
    return Response.json({ error: "Beitrag fehlt" }, { status: 400 });
  }

  const stepRows = await db
    .select()
    .from(steps)
    .where(eq(steps.id, stepId))
    .limit(1);
  const step = stepRows[0];
  if (!step) return Response.json({ error: "Beitrag fehlt" }, { status: 404 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "Keine Datei erhalten" }, { status: 400 });
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${photos.sortOrder}), -1)` })
    .from(photos)
    .where(eq(photos.stepId, stepId));

  const created = [];
  const failed: { name: string; reason: string }[] = [];
  let nextOrder = maxOrder + 1;

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      failed.push({ name: file.name, reason: "Datei ist größer als 25 MB." });
      continue;
    }
    if (file.type && !ACCEPTED.test(file.type)) {
      failed.push({ name: file.name, reason: "Kein unterstütztes Bildformat." });
      continue;
    }

    try {
      const meta = await processUpload(
        Buffer.from(await file.arrayBuffer()),
      );
      // Nachvollziehbar machen, was aus dem Bild gelesen wurde – ohne das
      // rät man bei "kein GPS gefunden" nur herum.
      console.log(
        `[upload] ${file.name} (${file.type || "unbekannt"}, ` +
          `${Math.round(file.size / 1024)} kB): ` +
          `Ort ${meta.lat !== null ? `${meta.lat.toFixed(5)},${meta.lon?.toFixed(5)}` : "keiner"}, ` +
          `Zeit ${meta.takenAt ? new Date(meta.takenAt).toISOString() : "keine"}`,
      );
      const [photo] = await db
        .insert(photos)
        .values({
          tripId: step.tripId,
          stepId: step.id,
          storageKey: meta.storageKey,
          originalName: file.name,
          width: meta.width,
          height: meta.height,
          bytes: meta.bytes,
          takenAt: meta.takenAt,
          lat: meta.lat,
          lon: meta.lon,
          placeholder: meta.placeholder,
          sortOrder: nextOrder++,
        })
        .returning();
      created.push(photo);
    } catch (error) {
      console.error("[upload] fehlgeschlagen", file.name, error);
      failed.push({
        name: file.name,
        reason:
          "Bild konnte nicht verarbeitet werden (bei iPhone-Fotos hilft das Format „Maximale Kompatibilität“).",
      });
    }
  }

  // Ort und Zeit des Beitrags aus den Fotos übernehmen, solange nichts gesetzt ist.
  const withGps = created.find((p) => p.lat !== null && p.lon !== null);
  const patch: Record<string, unknown> = {};
  if (withGps && step.lat === null) {
    patch.lat = withGps.lat;
    patch.lon = withGps.lon;
    if (!step.placeName) {
      const place = await reverseGeocode(withGps.lat!, withGps.lon!);
      if (place.placeName) patch.placeName = place.placeName;
      if (place.countryCode) patch.countryCode = place.countryCode;
    }
  }
  const earliest = created
    .map((p) => p.takenAt)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b)[0];
  if (earliest && !step.published) {
    patch.occurredAt = earliest;
  }

  // Sobald ein Foto drin ist, wird der Beitrag sichtbar – sonst wäre die
  // Arbeit weg, wenn jemand den Editor ohne Speichern verlässt.
  if (created.length > 0 && !step.published) {
    patch.published = true;
  }

  if (Object.keys(patch).length > 0) {
    await db
      .update(steps)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(steps.id, step.id));
  }

  return Response.json({
    photos: created.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      placeholder: p.placeholder,
      lat: p.lat,
      lon: p.lon,
      takenAt: p.takenAt,
    })),
    failed,
    derived: {
      lat: (patch.lat as number | undefined) ?? null,
      lon: (patch.lon as number | undefined) ?? null,
      occurredAt: (patch.occurredAt as number | undefined) ?? null,
      placeName: (patch.placeName as string | undefined) ?? null,
    },
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const photoId = Number(searchParams.get("photoId"));
  if (!Number.isInteger(photoId)) {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  await deletePhoto(photoId);
  return Response.json({ ok: true });
}
