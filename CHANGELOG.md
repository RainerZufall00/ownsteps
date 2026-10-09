# Changelog

All notable changes to OwnSteps. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): a new major version means you
have to do something when updating – read its notes first.

Server and apps share one history; entries say which part they concern
where it isn't obvious.

## [Unreleased]

### Added

- Upload status in the apps: a small capsule at the top shows what's on its
  way, on every screen – sending, "Uploading 2/5" with progress, processing
  on the server, no connection, failed – and briefly "Uploaded". A tap opens
  the trip.

### Changed

- Apps: videos play like stories instead of in the system player. They start
  by themselves, muted and looping, while they're the page in view, and stop
  when paged away or in the background; a tap switches the sound, a thin bar
  shows the position, and a small button opens the full player for
  scrubbing. The poster shows until the first frame, muted videos don't
  interrupt music, and with video autoplay (iOS) or animations (Android)
  switched off a play button waits instead.

### Fixed

- Android: tall photos and videos in a step no longer overflow their room –
  photos could be cropped, and videos covered the day and place at the top.

### Security

- The warning about a missing `PUBLIC_URL` now also says that the address
  otherwise comes from headers a client can set. `.env.example` and the
  README explain that Docker publishes ports past ufw, and when to bind to
  `127.0.0.1` instead.
- source-map-js 1.2.2 (GHSA-68fv-2mgg-jv7q). Only used at build time.

## [0.4.0] – 2026-10-09

### Added

- Android app (`android/`): native Kotlin and Jetpack Compose with Material 3,
  Android 10 and newer, English and German. Same features as the iOS app –
  several servers, OIDC or password sign-in, following trips as a reader,
  map with step cards and stories, writing steps offline with an upload queue,
  sharing photos from other apps, photo suggestions, readers and invitations,
  notifications, album export and Immich. Needs Google Play Services.

### Changed

- The map runs on maplibre-gl 6 (was 5). Its worker is now a file served
  from `_next/static/media` instead of a `blob:` URL, so the CSP no longer
  allows `blob:` workers. Browsers need WebGL 2.

### Security

- maplibre-gl 6 fixes GHSA-jrc7-96c5-q579 (attribution HTML sanitizer
  bypass), which OwnSteps had only mitigated so far.

## [0.3.0] – 2026-10-08

### Added

- Map and place names without a MapTiler key: the map comes from
  OpenFreeMap (`MAP_STYLE=liberty`, `bright` or `positron`), place search
  and names from OpenStreetMap (Photon, Nominatim). Before, the map was a
  plain OpenStreetMap layer and steps got no place names. With a key,
  nothing changes. `GEOCODING=off` keeps every lookup on your server.

### Changed

- The settings in `.env` are checked at startup. A wrong value – a typo in
  true/false, half an OIDC setup, a password sign-in switched off without
  OIDC, a public address with a path – stops OwnSteps with a message that
  names the setting; leftovers from the template are warned about.
  Switches accept true/false, yes/no and 1/0.

## [0.2.0] – 2026-10-08

### Added

- Keep a trip: download it as an offline album – a ZIP with one page, all
  photos and videos, texts, captions, comments and a map of the route,
  that opens in any browser without a server. In the trip settings, on the
  web and in the app.
- Send a trip to Immich as an album. Each photo's description holds its
  caption, the day and place, and the day's text on its first photo.
  Connect Immich in the settings, on the web or in the app (address and API
  key). Needs migration
  `0006_immich`, applied on startup.

### Changed

- App: the step cards over the map are solid instead of see-through glass,
  so they stand out from the map.
- App: a step opens as a story, like a WhatsApp status – all photos equal
  and full screen, swiped or tapped through, captions per photo, the text
  at the bottom. The next entry comes from below, like reels. Long texts
  end in "… more" and open in a reading sheet; steps without photos become a text
  story. Pinch to zoom. Days change only by swiping up and down; photos
  swipe like in the Photos app.
- App: a blue day bar above the step cards shows how far into the trip the
  step in view is; drag it to scrub through the days.

## [0.1.1] – 2026-10-07

### Added

- App: delete a trip – after typing its name, like on the web
  (`DELETE /api/v1/trips/{id}`).
- App: a caption for every photo and video when writing a step (`caption`
  with the upload).
- App: choose where a step goes on the map – from a photo (preselected),
  your current location, or a place picked on the map. Photos from
  different places are offered as a choice; videos bring their recording
  location.

### Fixed

- App: iOS killed the app while photos were uploading (watchdog
  `0x8BADF00D`). Upload progress arrived hundreds of times a second and
  flooded the main thread with view updates; it's now passed on once per
  percent. Converting photos to JPEG no longer runs on the main thread
  either, which froze the composer for a second or two per photo.
  The trip also reloaded after every single finished photo, rebuilding map
  and cards each time, and a new step's card vanished and came back when it
  reached the server; now one reload follows a burst of uploads and the
  card keeps its place.

### Changed

- A step written in the app takes the position chosen there instead of the
  first photo that happens to arrive; the server names positions that come
  without a name.

## [0.1.0] – 2026-10-06

The first public version.

### Server and web

- Trips with steps: photos and videos, text, place and date. Place and time
  come from the photos' EXIF data; without GPS the place can be searched or
  set on the map.
- Timeline (newest step on top) and map with the route, side by side on wide
  screens; fullscreen viewer with zoom, swiping and captions.
- Several authors work on all trips together; no permission system by
  design.
- Sharing through a secret link, optionally with a password. Readers comment
  without an account. Locked links reveal nothing about the trip.
- Authors see on every step how many readers have seen it, each counted
  once.
- Sign-in with password or OIDC (e.g. Pocket ID); password sign-in can be
  switched off.
- English and German user interface, following the browser or a switch.
- Brakes against password guessing, a nonce-based Content Security Policy,
  photos only served through access-checked routes.
- REST API under `/api/v1` with an OpenAPI description, device tokens for
  authors, reader tokens per trip, a change feed and idempotent uploads.
- One container with SQLite and the photos on disk; schema changes migrate
  on startup. Images for amd64 and arm64 on the GitHub Container Registry.

### iOS app

- Native SwiftUI app for iOS 26: sign in to several servers, by password or
  OIDC.
- Trips on a map with the steps as cards side by side and the trip at a
  glance above the map; each step on its own page, swiping sideways to the
  next.
- Write steps offline; photos and videos upload in the background, also
  after the app was closed. HEIC becomes JPEG, videos are reduced to 1080p
  unless switched off.
- Share Extension for photos from other apps, suggestions of library photos
  that are missing from a trip, share links and QR codes.
- Follow trips as a reader through an invitation link, with notifications
  about new steps; authors hear about new comments.

[Unreleased]: https://github.com/RainerZufall00/ownsteps/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/RainerZufall00/ownsteps/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/RainerZufall00/ownsteps/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/RainerZufall00/ownsteps/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/RainerZufall00/ownsteps/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/RainerZufall00/ownsteps/releases/tag/v0.1.0
