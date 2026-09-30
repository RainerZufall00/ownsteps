import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import ShareQr from "@/components/ShareQr";
import { appJoinLink } from "@/lib/app-link";
import { PUBLIC_URL } from "@/lib/env";
import { formatDateShort } from "@/lib/format";
import { listViewerDevices } from "@/lib/tokens";
import { originFromHeaders } from "@/lib/origin";
import { getTrip } from "@/lib/trips";
import { removeAllViewersAction, removeViewerAction } from "../../../actions";
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
  const viewers = await listViewerDevices(trip.id);

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
          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-surface-muted p-4">
            <ShareQr url={shareUrl} className="h-28 w-28 shrink-0 overflow-hidden rounded-xl" />
            <div className="min-w-0 text-[14px] text-ink-soft">
              <p className="font-medium text-ink">In der App folgen</p>
              <p className="mt-1">
                Mit der Kamera scannen oder den Link verschicken. Wer die
                OwnSteps-App hat, folgt der Reise dort, alle anderen im Browser.
              </p>
              <a href={appJoinLink(shareUrl)} className="mt-2 inline-block font-semibold text-accent">
                Auf diesem Gerät in der App öffnen
              </a>
            </div>
          </div>
        )}

        {trip.shareEnabled && (
          <RotateShareForm key={trip.shareToken} tripId={trip.id} />
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="text-lg font-semibold">Lesende in der App</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Wer den Link in der App geöffnet hat. Ein neuer Link wirft sie nicht
          hinaus; ist das Teilen aus, sehen sie nichts mehr.
        </p>
        {viewers.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-faint">Noch niemand.</p>
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {viewers.map((viewer) => (
                <li
                  key={viewer.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {viewer.name}
                      {viewer.deviceName ? ` (${viewer.deviceName})` : ""}
                    </span>
                    <span className="block truncate text-[13px] text-ink-soft">
                      seit {formatDateShort(viewer.createdAt)}
                      {viewer.lastSeenAt
                        ? ` · zuletzt da ${formatDateShort(viewer.lastSeenAt)}`
                        : ""}
                    </span>
                  </span>
                  <form action={removeViewerAction}>
                    <input type="hidden" name="viewerId" value={viewer.id} />
                    <button
                      type="submit"
                      className="shrink-0 text-sm font-semibold text-ink-soft transition hover:text-accent"
                    >
                      Entfernen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={removeAllViewersAction} className="mt-3">
              <input type="hidden" name="tripId" value={trip.id} />
              <button type="submit" className="btn btn-ghost px-4 py-2 text-sm">
                Alle entfernen
              </button>
            </form>
          </>
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
