import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import ListRow, { RowAction } from "@/components/ListRow";
import ShareQr from "@/components/ShareQr";
import { appJoinLink } from "@/lib/app-link";
import { formatDateShort } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/text";
import { pageOrigin, shareUrl as shareUrlFor } from "@/lib/share";
import { listViewerDevices } from "@/lib/tokens";
import { getTrip } from "@/lib/trips";
import { removeAllViewersAction, removeViewerAction } from "../../../actions";
import DeleteTripForm from "./DeleteTripForm";
import RotateShareForm from "./RotateShareForm";
import ShareSettings from "./ShareSettings";
import TripDetailsForm from "./TripDetailsForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.tripSettings.title };
}

export default async function TripSettingsPage({
  params,
}: PageProps<"/trips/[id]/settings">) {
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId)) notFound();

  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const shareUrl = shareUrlFor(await pageOrigin(), trip.shareToken);
  const viewers = await listViewerDevices(trip.id);
  const { locale, t } = await getI18n();

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-5">
      <BackLink href={`/trips/${trip.id}`} className="mb-5">
        {trip.title}
      </BackLink>

      <h1 className="text-[26px] font-bold leading-tight tracking-tight">
        {t.tripSettings.title}
      </h1>

      <section className="card mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">{t.tripSettings.shareHeading}</h2>
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
            <ShareQr
              url={shareUrl}
              label={t.tripSettings.qrLabel}
              className="h-28 w-28 shrink-0 overflow-hidden rounded-xl"
            />
            <div className="min-w-0 text-[14px] text-ink-soft">
              <p className="font-medium text-ink">{t.tripSettings.followHeading}</p>
              <p className="mt-1">
                {t.tripSettings.followText}
              </p>
              <a href={appJoinLink(shareUrl)} className="mt-2 inline-block font-semibold text-accent">
                {t.tripSettings.openHere}
              </a>
            </div>
          </div>
        )}

        {trip.shareEnabled && (
          <RotateShareForm key={trip.shareToken} tripId={trip.id} />
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="text-lg font-semibold">{t.tripSettings.readersHeading}</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          {t.tripSettings.readersText}
        </p>
        {viewers.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-faint">{t.tripSettings.noReaders}</p>
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {viewers.map((viewer) => (
                <ListRow
                  key={viewer.id}
                  title={viewer.deviceName ? `${viewer.name} (${viewer.deviceName})` : viewer.name}
                  detail={
                    fill(t.tripSettings.readerSince, {
                      date: formatDateShort(viewer.createdAt, locale),
                    }) +
                    (viewer.lastSeenAt
                      ? fill(t.tripSettings.readerLastSeen, {
                          date: formatDateShort(viewer.lastSeenAt, locale),
                        })
                      : "")
                  }
                >
                  <RowAction action={removeViewerAction} name="viewerId" value={viewer.id}>
                    {t.common.remove}
                  </RowAction>
                </ListRow>
              ))}
            </ul>
            <form action={removeAllViewersAction} className="mt-3">
              <input type="hidden" name="tripId" value={trip.id} />
              <button type="submit" className="btn btn-ghost px-4 py-2 text-sm">
                {t.tripSettings.removeAll}
              </button>
            </form>
          </>
        )}
      </section>

      <section className="card mt-5 p-6">
        <h2 className="mb-4 text-lg font-semibold">{t.tripSettings.detailsHeading}</h2>
        <TripDetailsForm
          tripId={trip.id}
          title={trip.title}
          summary={trip.summary ?? ""}
          startDate={trip.startDate ?? ""}
          endDate={trip.endDate ?? ""}
        />
      </section>

      <section className="mt-5 rounded-3xl border border-line p-6">
        <h2 className="text-lg font-semibold">{t.tripSettings.deleteHeading}</h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          {t.tripSettings.deleteText}
        </p>
        <div className="mt-4">
          <DeleteTripForm tripId={trip.id} title={trip.title} />
        </div>
      </section>
    </main>
  );
}
