import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import TripView from "@/components/TripView";
import { PUBLIC_URL, SITE_NAME } from "@/lib/env";
import { formatRange, pluralize } from "@/lib/format";
import { getMapStyle } from "@/lib/map";
import { getTripByShareToken, resolveTripAccess } from "@/lib/share";
import { getSteps } from "@/lib/trips";
import { toViewStep } from "@/lib/view-types";
import UnlockForm from "./UnlockForm";

export const dynamic = "force-dynamic";

async function baseUrl() {
  if (PUBLIC_URL) return PUBLIC_URL;
  const store = await headers();
  const proto = store.get("x-forwarded-proto") ?? "http";
  const host = store.get("host") ?? "localhost:2555";
  return `${proto}://${host}`;
}

export async function generateMetadata({
  params,
}: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const trip = await getTripByShareToken(token);
  if (!trip) return { title: "Nicht gefunden" };

  const steps = await getSteps(trip.id);
  const cover =
    steps.find((step) => step.photos.length > 0)?.photos[0] ?? null;

  return {
    title: trip.title,
    description:
      trip.summary ??
      `Eine Reise mit ${pluralize(steps.length, "Station", "Stationen")}.`,
    // Der Link soll nirgends im Index landen.
    robots: { index: false, follow: false },
    openGraph: {
      title: trip.title,
      description: trip.summary ?? undefined,
      type: "article",
      // Bei Passwortschutz kein Vorschaubild ausliefern.
      images:
        cover && !trip.sharePasswordHash
          ? [`${await baseUrl()}/api/photos/${cover.id}/medium`]
          : undefined,
    },
  };
}

export default async function SharedTripPage({
  params,
}: PageProps<"/s/[token]">) {
  const { token } = await params;
  const trip = await getTripByShareToken(token);
  if (!trip) notFound();

  const access = await resolveTripAccess(trip);
  if (access.kind === "denied") notFound();

  if (access.kind === "locked") {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="h-11 w-11 text-accent" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              {trip.title}
            </h1>
            <p className="mt-2 text-[15px] text-ink-soft">
              Diese Reise ist mit einem Passwort geschützt.
            </p>
          </div>
          <div className="card p-6">
            <UnlockForm token={token} />
          </div>
        </div>
      </main>
    );
  }

  const steps = await getSteps(trip.id);

  const header = (
    <header className="mb-5">
      <div className="mb-4 flex items-center gap-2 text-ink-soft">
        <Logo className="h-5 w-5 text-accent" />
        <span className="text-sm font-medium">{SITE_NAME}</span>
      </div>

      <h1 className="text-[28px] font-bold leading-tight tracking-tight">
        {trip.title}
      </h1>
      <p className="mt-1 text-[15px] text-ink-soft">
        {formatRange(
          steps[0]?.occurredAt ?? null,
          steps.at(-1)?.occurredAt ?? null,
        )}
        {steps.length > 0 && (
          <>
            {" · "}
            {pluralize(steps.length, "Station", "Stationen")}
          </>
        )}
      </p>
      {trip.summary && (
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">
          {trip.summary}
        </p>
      )}
    </header>
  );

  return (
    <TripView
      trip={{ id: trip.id, title: trip.title, summary: trip.summary }}
      steps={steps.map(toViewStep)}
      mapStyle={getMapStyle()}
      header={header}
    />
  );
}
