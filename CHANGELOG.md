# Changelog

All notable changes to OwnSteps. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): a new major version means you
have to do something when updating – read its notes first.

Server and iOS app share one history; entries say which part they concern
where it isn't obvious.

## [Unreleased]

### Changed

- App: the step cards over the map are solid instead of see-through glass,
  so they stand out from the map.
- App: a step opens as a story, like a WhatsApp status – all photos equal
  and full screen, swiped or tapped through, captions per photo, the text
  at the bottom. The next entry comes from below, like reels. Long texts
  get "Read more" with a reading sheet; steps without photos become a text
  story. Pinch to zoom.

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

[Unreleased]: https://github.com/RainerZufall00/ownsteps/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/RainerZufall00/ownsteps/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/RainerZufall00/ownsteps/releases/tag/v0.1.0
