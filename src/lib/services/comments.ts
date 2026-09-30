import "server-only";

import type { Trip } from "@/db/schema";
import {
  addComment,
  deleteComment,
  mayComment,
  stepBelongsToTrip,
} from "@/lib/comments";
import { ServiceError } from "@/lib/errors";
import { commentInput, parseInput } from "@/lib/schemas";
import type { TripAccess } from "@/lib/share";
import { requireTrip } from "./trips";

/**
 * Whoever may see the trip may comment on it – no account needed. How access
 * is established (session, share cookie, later an API token) is the caller's
 * business, hence the resolver.
 */
export async function postComment(input: {
  tripId: number;
  stepId: number;
  raw: unknown;
  /** Identifies the sender for the rate limit, e.g. the client IP. */
  clientKey: string;
  resolveAccess: (trip: Trip) => Promise<TripAccess>;
}) {
  if (!Number.isInteger(input.tripId) || !Number.isInteger(input.stepId)) {
    throw new ServiceError("step_not_found");
  }
  const { authorName, body } = parseInput(commentInput, input.raw);

  const trip = await requireTrip(input.tripId);
  const access = await input.resolveAccess(trip);
  if (access.kind !== "owner" && access.kind !== "guest") {
    throw new ServiceError("trip_not_shared");
  }
  if (!(await stepBelongsToTrip(input.stepId, trip.id))) {
    throw new ServiceError("step_not_found");
  }
  if (!mayComment(input.clientKey)) {
    throw new ServiceError("comment_rate_limited");
  }

  const comment = await addComment({
    stepId: input.stepId,
    tripId: trip.id,
    authorName,
    body,
  });
  return { trip, comment };
}

/** Deleting is reserved for signed-in authors; the caller checks that. */
export async function removeComment(commentId: number) {
  if (!Number.isInteger(commentId)) throw new ServiceError("invalid_request");
  await deleteComment(commentId);
}
