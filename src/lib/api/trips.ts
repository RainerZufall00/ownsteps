import "server-only";

import { PUBLIC_URL } from "@/lib/env";
import { publicOrigin } from "@/lib/origin";
import { getSteps, listTrips, type TripSummary } from "@/lib/trips";
import type { Trip } from "@/db/schema";
import type { Principal } from "./principal";
import { tripDetailDto, tripDto } from "./serialize";

/** Share settings go to authors only; viewers never see the link's secrets. */
export function shareFor(principal: Principal, trip: Trip, request: Request) {
  if (principal.kind !== "author") return null;
  return { url: `${publicOrigin(request, PUBLIC_URL)}/s/${trip.shareToken}` };
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
  );
}

export async function tripSummaryDto(principal: Principal, trip: Trip, request: Request) {
  const summary = (await listTrips()).find((t) => t.id === trip.id);
  return summary
    ? summaryDto(principal, summary, request)
    : tripDto(
        trip,
        { coverPhotoId: trip.coverPhotoId, stepCount: 0, photoCount: 0, firstStepAt: null, lastStepAt: null },
        shareFor(principal, trip, request),
      );
}

export async function tripDetailFor(principal: Principal, trip: Trip, request: Request) {
  return tripDetailDto(trip, await getSteps(trip.id), shareFor(principal, trip, request));
}
