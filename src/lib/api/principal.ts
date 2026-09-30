import "server-only";

import type { Trip, User, ViewerDevice } from "@/db/schema";
import { ServiceError } from "@/lib/errors";
import {
  isAuthorToken,
  isViewerToken,
  resolveApiToken,
  resolveViewerToken,
} from "@/lib/tokens";
import { getTrip } from "@/lib/trips";

/**
 * Who is calling `/api/v1`. Only bearer tokens count here – no cookies, so
 * there's no CSRF surface and the web session stays a web session.
 */
export type Principal =
  | { kind: "author"; user: User; tokenId: string }
  | { kind: "viewer"; device: ViewerDevice };

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function getPrincipal(request: Request): Promise<Principal | null> {
  const token = bearer(request);
  if (!token) return null;
  if (isAuthorToken(token)) {
    const resolved = await resolveApiToken(token);
    return resolved ? { kind: "author", ...resolved } : null;
  }
  if (isViewerToken(token)) {
    const device = await resolveViewerToken(token);
    return device ? { kind: "viewer", device } : null;
  }
  return null;
}

export async function requirePrincipal(request: Request) {
  const principal = await getPrincipal(request);
  if (!principal) throw new ServiceError("not_signed_in");
  return principal;
}

/** Everything that changes content is reserved for authors ([E2]). */
export async function requireAuthor(request: Request) {
  const principal = await requirePrincipal(request);
  if (principal.kind !== "author") throw new ServiceError("author_only");
  return principal;
}

/**
 * The API's counterpart to `resolveTripAccess`: authors see every trip,
 * a viewer only the trip it redeemed, and only while sharing is on ([D17]).
 * Trips a viewer may not see answer 404, like unshared web links.
 */
export async function requireReadableTrip(principal: Principal, tripId: number): Promise<Trip> {
  const trip = await getTrip(tripId);
  if (!trip) throw new ServiceError("trip_not_found");
  if (principal.kind === "author") return trip;
  if (principal.device.tripId !== trip.id) throw new ServiceError("trip_not_found");
  if (!trip.shareEnabled) throw new ServiceError("trip_not_shared");
  return trip;
}
