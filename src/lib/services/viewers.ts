import "server-only";

import { ServiceError } from "@/lib/errors";
import { createRateLimit } from "@/lib/rate-limit";
import { getTripByShareToken } from "@/lib/share";
import {
  createViewerDevice,
  getViewerDevice,
  listViewerDevices,
  removeAllViewerDevices,
  removeViewerDevice,
} from "@/lib/tokens";
import { NAME_MAX_LENGTH } from "@/lib/limits";
import { checkSharePassword } from "./share";
import { requireTrip } from "./trips";

/** Devices registered per address – no matter the password. */
const redeemsPerClient = createRateLimit("redeem-client", { windowMs: 60_000, max: 10 });

/** Accepts the full share link or just its token. */
export function shareTokenFrom(shareLink: string) {
  const trimmed = shareLink.trim();
  const match = /\/s\/([^/?#]+)/.exec(trimmed);
  return match ? decodeURIComponent(match[1]) : trimmed;
}

/**
 * Registers a reader's device for a trip ([D17]): no account, just a name.
 * Any number of people may redeem the same link; the share password, if
 * set, is asked once here and never again.
 */
export async function redeemViewer(
  input: { shareLink: string; password?: string; name: string; deviceName?: string },
  clientKey: string,
) {
  if (!redeemsPerClient.allow(clientKey)) throw new ServiceError("too_many_attempts");

  const name = input.name.trim();
  if (name.length < 2) throw new ServiceError("comment_name_missing");
  if (name.length > NAME_MAX_LENGTH) throw new ServiceError("comment_name_too_long");

  const trip = await getTripByShareToken(shareTokenFrom(input.shareLink));
  if (!trip) throw new ServiceError("share_link_invalid");
  // Same brakes as the web unlock: guessing through the app gains nothing.
  await checkSharePassword(trip, input.password ?? "", clientKey);

  const { token, device } = await createViewerDevice({
    trip,
    name,
    deviceName: input.deviceName?.trim() || null,
  });
  return { token, device, trip };
}

export async function viewersOf(tripId: number) {
  await requireTrip(tripId);
  return listViewerDevices(tripId);
}

export async function removeViewer(viewerId: number) {
  const device = Number.isInteger(viewerId) ? await getViewerDevice(viewerId) : null;
  if (!device) throw new ServiceError("viewer_not_found");
  await removeViewerDevice(viewerId);
  return device;
}

export async function removeAllViewers(tripId: number) {
  await requireTrip(tripId);
  await removeAllViewerDevices(tripId);
}
