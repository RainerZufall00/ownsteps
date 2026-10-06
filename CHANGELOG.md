# Changelog

All notable changes to OwnSteps. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/): a new major version means you
have to do something when updating – read its notes first.

Server and iOS app share one history; entries say which part they concern
where it isn't obvious.

## [Unreleased]

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

[Unreleased]: https://github.com/RainerZufall00/ownsteps/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RainerZufall00/ownsteps/releases/tag/v0.1.0
