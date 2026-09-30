import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TripView from "@/components/TripView";
import { formatTripRange, pluralize } from "@/lib/format";
import { getMapStyle } from "@/lib/map";
import { getSteps, getTrip } from "@/lib/trips";
import { toViewStep } from "@/lib/view-types";
import { startStepAction } from "../../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/trips/[id]">): Promise<Metadata> {
  const { id } = await params;
  const trip = await getTrip(Number(id));
  return { title: trip?.title ?? "Reise" };
}

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId)) notFound();

  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const steps = await getSteps(tripId);
  const photoCount = steps.reduce((sum, step) => sum + step.photos.length, 0);

  const header = (
    <header className="mb-5">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            d="m15 5-7 7 7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        Alle Reisen
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">
            {trip.title}
          </h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            {formatTripRange(
              trip,
              steps[0]?.occurredAt ?? null,
              steps.at(-1)?.occurredAt ?? null,
            )}
            {steps.length > 0 && (
              <>
                {" · "}
                {pluralize(steps.length, "Station", "Stationen")}
                {" · "}
                {pluralize(photoCount, "Foto", "Fotos")}
              </>
            )}
          </p>
          {trip.summary && (
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">
              {trip.summary}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/trips/${trip.id}/settings`}
            className="btn btn-secondary px-4 py-2.5 text-sm"
          >
            {trip.shareEnabled ? "Geteilt" : "Teilen"}
          </Link>
          <form action={startStepAction} className="hidden sm:block">
            <input type="hidden" name="tripId" value={trip.id} />
            <button type="submit" className="btn btn-primary px-4 py-2.5 text-sm">
              Beitrag hinzufügen
            </button>
          </form>
        </div>
      </div>
    </header>
  );

  return (
    <>
      <TripView
        trip={{
          id: trip.id,
          title: trip.title,
          summary: trip.summary,
          startDate: trip.startDate,
        }}
        steps={steps.map(toViewStep)}
        mapStyle={getMapStyle()}
        editable
        header={header}
      />

      {/* On phones, adding stays within thumb's reach. */}
      <form
        action={startStepAction}
        className="fixed bottom-6 right-5 z-40 sm:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <input type="hidden" name="tripId" value={trip.id} />
        <button
          type="submit"
          aria-label="Beitrag hinzufügen"
          className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-float transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </form>
    </>
  );
}
