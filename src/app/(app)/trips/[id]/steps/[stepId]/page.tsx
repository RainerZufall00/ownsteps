import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMapStyle } from "@/lib/map";
import { getStep, getTrip } from "@/lib/trips";
import StepEditor from "./StepEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Beitrag" };

export default async function StepEditorPage({
  params,
}: PageProps<"/trips/[id]/steps/[stepId]">) {
  const { id, stepId } = await params;
  const tripId = Number(id);
  const step = await getStep(Number(stepId));

  // Der Beitrag muss wirklich zu dieser Reise gehören.
  if (!step || step.tripId !== tripId) notFound();
  if (!(await getTrip(tripId))) notFound();

  return (
    <StepEditor
      mapStyle={getMapStyle()}
      step={{
        id: step.id,
        tripId: step.tripId,
        title: step.title,
        body: step.body,
        lat: step.lat,
        lon: step.lon,
        placeName: step.placeName,
        occurredAt: step.occurredAt,
        published: step.published,
        photos: step.photos.map((photo) => ({
          id: photo.id,
          width: photo.width,
          height: photo.height,
          placeholder: photo.placeholder,
          caption: photo.caption,
        })),
      }}
    />
  );
}
