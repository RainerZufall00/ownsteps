/**
 * Links into the iOS app. Universal Links would need every self-hosted
 * domain baked into the app, so the app registers the custom scheme
 * `ownsteps://` instead ([D18]). Deliberately without `server-only`.
 */
const APP_SCHEME = "ownsteps";

/** Opens the app and lets it follow the trip behind a share link. */
export function appJoinLink(shareUrl: string) {
  return `${APP_SCHEME}://join?url=${encodeURIComponent(shareUrl)}`;
}
