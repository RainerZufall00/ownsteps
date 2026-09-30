import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PUBLIC_URL } from "@/lib/env";
import { originFromHeaders } from "@/lib/origin";
import { getTrip } from "@/lib/trips";
import DeleteTripForm from "./DeleteTripForm";
import RotateShareForm from "./RotateShareForm";
import ShareSettings from "./ShareSettings";
import TripDetailsForm from "./TripDetailsForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reise verwalten" };

async function baseUrl() {
  return originFromHeaders(await headers(), PUBLIC_URL, "http://localhost:2555");
}

export default async function TripSettingsPage({
  params,
}: PageProps<"/trips/[id]/settings">) {
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId)) notFound();

  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const shareUrl = `${await baseUrl()}/s/${trip.shareToken}`;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-5">
      <Link
        href={`/trips/${trip.id}`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
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
        {trip.title}
      </Link>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        Reise verwalten
      </h1>

      <section className="card mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">Teilen</h2>
        <ShareSettings
          tripId={trip.id}
          shareUrl={shareUrl}
          shareEnabled={trip.shareEnabled}
          hasPassword={Boolean(trip.sharePasswordHash)}
        />

        {/* The token as `key`: as soon as a new link exists, React rebuilds
            the component and the confirmation collapses by itself. */}
        {trip.shareEnabled && (
          <RotateShareForm key={trip.shareToken} tripId={trip.id} />
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="mb-4 text-lg font-semibold">Name, Zeitraum, Beschreibung</h2>
        <TripDetailsForm
          tripId={trip.id}
          title={trip.title}
          summary={trip.summary ?? ""}
          startDate={trip.startDate ?? ""}
          endDate={trip.endDate ?? ""}
        />
      </section>

      <section className="mt-5 rounded-3xl border border-line p-6">
        <h2 className="text-lg font-semibold">Reise löschen</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Entfernt alle Beiträge und Fotos dieser Reise unwiderruflich vom
          Server. Es gibt danach kein Zurück – außer über eine Sicherung.
        </p>
        <div className="mt-4">
          <DeleteTripForm tripId={trip.id} title={trip.title} />
        </div>
      </section>
    </main>
  );
}
