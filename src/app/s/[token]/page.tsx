import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import LanguageSwitch from "@/components/LanguageSwitch";
import Logo from "@/components/Logo";
import TripHeading from "@/components/TripHeading";
import TripView from "@/components/TripView";
import { appJoinLink } from "@/lib/app-link";
import { APP_STORE_ID, SITE_NAME } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { plural } from "@/lib/i18n/text";
import { getMapStyle } from "@/lib/map";
import { getTripByShareToken, pageOrigin, resolveTripAccess, shareUrl } from "@/lib/share";
import { getSteps, summarizeSteps } from "@/lib/trips";
import { toViewStep, toViewTrip } from "@/lib/view-types";
import UnlockForm from "./UnlockForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const trip = await getTripByShareToken(token);
  const { t } = await getI18n();
  if (!trip) return { title: t.share.notFound };

  // Behind a password, the link preview (messengers, crawlers – they never
  // unlock) must not tell more than the locked page: no title, no summary,
  // no cover.
  if ((await resolveTripAccess(trip, token)).kind === "locked") {
    // What a password-protected trip is called until it's unlocked.
    return { title: t.share.lockedTitle, robots: { index: false, follow: false } };
  }

  const steps = await getSteps(trip.id);

  return {
    title: trip.title,
    description:
      trip.summary ?? plural(t.share.description, steps.length),
    // The link must not end up in any index.
    robots: { index: false, follow: false },
    // Smart App Banner in Safari; hands the link to the app when installed.
    ...(APP_STORE_ID
      ? { itunes: { appId: APP_STORE_ID, appArgument: shareUrl(await pageOrigin(), token) } }
      : {}),
    openGraph: {
      title: trip.title,
      description: trip.summary ?? undefined,
      type: "article",
      // Only the separately uploaded cover of a trip without password is
      // public; whether the trip has one is decided by the photo route
      // (otherwise it returns 403 and the preview simply stays empty). Other
      // photos never go to a crawler.
      images:
        trip.coverPhotoId && !trip.sharePasswordHash
          ? [`${await pageOrigin()}/api/photos/${trip.coverPhotoId}/medium`]
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

  const access = await resolveTripAccess(trip, token);
  if (access.kind === "denied") notFound();
  const { t } = await getI18n();

  if (access.kind === "locked") {
    return (
      <AuthShell title={t.share.lockedTitle} intro={t.share.lockedText}>
        <UnlockForm token={token} />
      </AuthShell>
    );
  }

  const steps = await getSteps(trip.id);
  const link = shareUrl(await pageOrigin(), token);

  const header = (
    <header className="mb-5">
      <div className="mb-4 flex items-center justify-between gap-2 text-ink-soft">
        <span className="flex items-center gap-2">
          <Logo className="h-5 w-5 text-accent" />
          <span className="text-sm font-medium">{SITE_NAME}</span>
        </span>
        <span className="flex items-center gap-2">
          {/* Only once the app is in the store, and hidden on large screens. */}
          {APP_STORE_ID && (
            <a
              href={appJoinLink(link)}
              className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent xl:hidden"
            >
              {t.common.openInApp}
            </a>
          )}
          <LanguageSwitch />
        </span>
      </div>

      <TripHeading trip={trip} stats={summarizeSteps(trip, steps)} />
    </header>
  );

  return (
    <TripView
      trip={toViewTrip(trip)}
      steps={steps.map(toViewStep)}
      mapStyle={getMapStyle()}
      mediaBase={`/api/share-media/${token}`}
      shareToken={token}
      header={header}
    />
  );
}
