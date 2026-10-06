import "server-only";

import { PUBLIC_URL } from "@/lib/env";
import { ServiceError } from "@/lib/errors";
import { publicOrigin } from "@/lib/origin";
import { shareUrl } from "@/lib/share";
import { getPhoto } from "@/lib/photos";
import { getSteps, listTrips, summarizeSteps, type TripSummary } from "@/lib/trips";
import { countStepViews } from "@/lib/views";
import type { Trip } from "@/db/schema";
import type { Principal } from "./principal";
import { tripDetailDto, tripDto } from "./serialize";

/** Share settings go to authors only; viewers never see the link's secrets. */
function shareFor(principal: Principal, trip: Trip, request: Request) {
  if (principal.kind !== "author") return null;
  return { url: shareUrl(publicOrigin(request, PUBLIC_URL), trip.shareToken) };
}

export function summaryDto(principal: Principal, summary: TripSummary, request: Request) {
  return tripDto(
    summary,
    {
      coverPhotoId: summary.coverPhoto?.id ?? null,
      stepCount: summary.stepCount,
      photoCount: summary.photoCount,
      firstStepAt: summary.firstStepAt,
      lastStepAt: summary.lastStepAt,
    },
    shareFor(principal, summary, request),
    summary.coverPhoto,
  );
}

export async function tripSummaryDto(principal: Principal, trip: Trip, request: Request) {
  const [summary] = await listTrips({ ids: [trip.id] });
  // Only missing if the trip was deleted in the meantime.
  if (!summary) throw new ServiceError("trip_not_found");
  return summaryDto(principal, summary, request);
}

export async function tripDetailFor(principal: Principal, trip: Trip, request: Request) {
  const steps = await getSteps(trip.id);
  const coverId = summarizeSteps(trip, steps).coverPhotoId;
  // A cover uploaded in the trip settings belongs to no step.
  const cover =
    steps.flatMap((step) => step.photos).find((photo) => photo.id === coverId) ??
    (coverId ? await getPhoto(coverId) : null);
  const viewCounts =
    principal.kind === "author" ? await countStepViews(steps.map((step) => step.id)) : undefined;
  return tripDetailDto(trip, steps, shareFor(principal, trip, request), cover, viewCounts);
}
