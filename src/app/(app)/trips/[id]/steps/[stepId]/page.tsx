import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getMapStyle } from "@/lib/map";
import { getStep, getTrip } from "@/lib/trips";
import { toViewPhoto } from "@/lib/view-types";
import StepEditor from "./StepEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.stepEditor.title };
}

export default async function StepEditorPage({
  params,
}: PageProps<"/trips/[id]/steps/[stepId]">) {
  const { id, stepId } = await params;
  const tripId = Number(id);
  const step = await getStep(Number(stepId));

  // The step must really belong to this trip.
  if (!step || step.tripId !== tripId) notFound();
  if (!(await getTrip(tripId))) notFound();

  return (
    <StepEditor
      mapStyle={getMapStyle()}
      step={{
        id: step.id,
        tripId: step.tripId,
        body: step.body,
        lat: step.lat,
        lon: step.lon,
        placeName: step.placeName,
        occurredAt: step.occurredAt,
        published: step.published,
        photos: step.photos.map(toViewPhoto),
      }}
    />
  );
}
