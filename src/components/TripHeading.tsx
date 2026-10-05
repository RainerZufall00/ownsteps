import type { Trip } from "@/db/schema";
import { formatTripRange } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { plural } from "@/lib/i18n/text";
import type { TripStats } from "@/lib/trips";

/**
 * A trip's title, date range, counts and summary – the same on the author's
 * page and on the share link.
 */
export default async function TripHeading({
  trip,
  stats,
  showPhotoCount = false,
}: {
  trip: Pick<Trip, "title" | "summary" | "startDate" | "endDate">;
  stats: TripStats;
  showPhotoCount?: boolean;
}) {
  const { locale, t } = await getI18n();
  return (
    <>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">{trip.title}</h1>
      <p className="mt-1 text-[15px] text-ink-soft">
        {formatTripRange(trip, stats.firstStepAt, stats.lastStepAt, locale) ?? t.range.noSteps}
        {stats.stepCount > 0 && (
          <>
            {" · "}
            {plural(t.counts.steps, stats.stepCount)}
            {showPhotoCount && (
              <>
                {" · "}
                {plural(t.counts.photos, stats.photoCount)}
              </>
            )}
          </>
        )}
      </p>
      {trip.summary && (
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">{trip.summary}</p>
      )}
    </>
  );
}
