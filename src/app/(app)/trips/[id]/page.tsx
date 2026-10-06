import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import Fab from "@/components/Fab";
import TripHeading from "@/components/TripHeading";
import TripView from "@/components/TripView";
import { getI18n } from "@/lib/i18n/server";
import { getMapStyle } from "@/lib/map";
import { getSteps, getTrip, summarizeSteps } from "@/lib/trips";
import { toViewStep, toViewTrip } from "@/lib/view-types";
import { countStepViews } from "@/lib/views";
import { startStepAction } from "../../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/trips/[id]">): Promise<Metadata> {
  const { id } = await params;
  const trip = await getTrip(Number(id));
  const { t } = await getI18n();
  return { title: trip?.title ?? t.trip.fallbackTitle };
}

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId)) notFound();

  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const steps = await getSteps(tripId);
  const { t } = await getI18n();
  const views = await countStepViews(steps.map((step) => step.id));

  const header = (
    <header className="mb-5">
      <BackLink href="/" className="mb-4">
        {t.common.allTrips}
      </BackLink>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <TripHeading trip={trip} stats={summarizeSteps(trip, steps)} showPhotoCount />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/trips/${trip.id}/settings`}
            className="btn btn-secondary px-4 py-2.5 text-sm"
          >
            {trip.shareEnabled ? t.trip.shared : t.trip.share}
          </Link>
          <form action={startStepAction} className="hidden sm:block">
            <input type="hidden" name="tripId" value={trip.id} />
            <button type="submit" className="btn btn-primary px-4 py-2.5 text-sm">
              {t.trip.addStep}
            </button>
          </form>
        </div>
      </div>
    </header>
  );

  return (
    <>
      <TripView
        trip={toViewTrip(trip)}
        steps={steps.map(toViewStep)}
        mapStyle={getMapStyle()}
        editable
        // A private trip that never had readers would only say "0 views".
        viewCounts={trip.shareEnabled || views.size > 0 ? Object.fromEntries(views) : undefined}
        header={header}
      />
      <Fab label={t.trip.addStep} action={startStepAction} fields={{ tripId: trip.id }} />
    </>
  );
}
