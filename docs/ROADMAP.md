# OwnSteps – Roadmap: API, iOS app, open source release

Agreed on 2026-09-30. This file records **what** gets built, in **which order**,
and the decisions behind it. Once a phase is done, its decisions move into the
architecture doc and the phase is ticked off here.

---

## Decisions

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Server license | **AGPL-3.0** |
| D2 | Tenancy | Unchanged: **one instance per household/group**, every account may do everything ([E2] stays). Documented in the README. |
| D3 | Project language | **English** for code, comments, docs and new commits (supersedes [E11]). Existing git history stays German. |
| D4 | UI languages | Web and app in **English and German**, default **English**. Web: `Accept-Language` plus a manual switch (cookie). App: String Catalogs, iOS per-app language. |
| D5 | Order of work | English switch → tests → API → iOS app → code review → release prep → open source |
| D6 | App technology | **Native SwiftUI**, iOS only (Android is not a goal), **iOS 26** minimum |
| D7 | App storage | **GRDB** (SQLite, explicit migrations) |
| D8 | App map | **Apple MapKit**, no MapTiler in the app |
| D9 | App distribution | **Public App Store**. The user enters the server URL. No central infrastructure run by the maintainer. |
| D10 | App license, repo | **Monorepo** (`ios/` next to `src/`). App under **MPL-2.0**, server under AGPL. |
| D11 | API shape | **REST/JSON under `/api/v1`**, logic lives in a **service layer** shared by Server Actions and API. OpenAPI generated from **Zod** schemas (`zod-openapi`). |
| D12 | API conventions | `Authorization: Bearer`, errors as `application/problem+json` (RFC 9457, stable `type`), cursor pagination, ISO-8601 dates |
| D13 | Compatibility | `/api/v1` is only extended, never broken. `GET /api/v1/info` returns `version`, `minAppVersion`, `features[]`, auth methods and whether setup is done. The app hides what the server lacks and says clearly when the server is too old. |
| D14 | Author login | **OIDC preferred**, password as a secondary option. OIDC in the app: `ASWebAuthenticationSession` → server-side OIDC flow → one-time code via `ownsteps://auth?code=…` → exchanged for a device token. New env var `PASSWORD_LOGIN=false` disables password login everywhere. First-time setup stays web-only. |
| D15 | Device tokens | New table `api_tokens` (hash, device name, last used). Revocable in web settings, plus "sign out this device" in the app. |
| D16 | Push | **No push relay.** The app polls via `BGAppRefreshTask` and shows local notifications. Authors: new comments. Viewers: new steps. Can be turned off per trip. Server endpoint: `GET /api/v1/changes?since=<cursor>`. |
| D17 | Viewers | **Registered viewer devices, no accounts.** Redeeming the share link plus a name returns a per-trip viewer token. Any number of people may redeem one link. The share password is asked once. A new share link or a new share password signs all of them out (changed on 2026-10-02; before, a new link kept them). Disabling sharing locks all of them out, and re-enabling lets them back in. Authors can remove devices one by one or all at once. One app can follow trips on **several instances**. |
| D18 | Invite link | Derived from the **instance's own domain** (the existing share link). The share page shows a Smart App Banner, an "Open in app" button (`ownsteps://…`) and a QR code in the web UI. No Universal Links. |
| D19 | Offline | **Only new content offline** (new steps, new media). Editing existing steps needs a connection. Steps and media carry a **client-generated UUID** so that retries are idempotent. Conflict detection comes later. |
| D20 | Media from the app | The app converts **HEIC → JPEG** (full resolution, EXIF including GPS kept). Video poster frame via `AVAssetImageGenerator`. **Live Photos: still image only.** Videos are **compressed to 1080p** by default, with an "original quality" toggle. Plain multipart upload, resumable uploads come later. |
| D21 | App v1 scope (authors) | In the app: create and edit trips (title, dates, cover), create/edit/delete steps, media from the library and the Share Extension (with a caption per photo), read and delete comments, invite viewers (link/QR) and remove them, delete trips (typing the name, like the web; added 2026-10-07). **Web only:** accounts, setup, share password, token rotation, revoking tokens. |
| D22 | Convenience in v1 | Trips **readable offline** (cached steps plus `medium` photos). **Photo suggestions** (library photos from the trip period not uploaded yet; uploaded `PHAsset` IDs are tracked locally only). **Share sheet** for trip and step links. Later: widget. Not planned: in-app camera. |
| D23 | Tests | **Vitest** against in-memory SQLite, written **before** the refactor |
| D24 | Maps without a key | Before the release: **OpenFreeMap** tiles and **Nominatim/Photon** geocoding by default (throttled to ≤ 1 req/s, own User-Agent). MapTiler stays optional. |
| D25 | App Store review | **Demo instance** on the maintainer's VPS, reset nightly. Privacy label: "Data Not Collected". |
| D26 | Transport | App: **HTTPS only**, plus `NSAllowsLocalNetworking` for LAN instances |
| D27 | Polarsteps import | **After** the release, filed as a "help wanted" issue |
| D28 | View counts | Authors see per step how many **readers** saw it (each counted once: app device, or share-link visitor by cookie); authors aren't counted, readers don't see the numbers. Seen = on screen for a second. Not in the change log. Details in [E17]. (Was O5.) |
| D29 | App trip screen | Like Polarsteps: map fills the screen, steps as **horizontal glass cards** below it (trip card with cover first, then oldest → newest, opening on the newest), a tapped card **pushes the step's page** (grouped list, actions in the toolbars) with sideways paging. Same layout on iPhone and iPad. The vertical timeline is gone. System idioms over web ones: no drop shadows or gradient heroes, no inline text buttons. (Was O6.) |

---

## Phases

### Phase 0 – Switch to English
- [x] Translate identifiers, comments and log/error messages in `src/` (a pure refactor, no behavior change). UI strings stay German until phase 6.
- [x] `docs/ARCHITEKTUR.md` → `docs/ARCHITECTURE.md`. Add a decision entry that supersedes [E11].
- [x] Translate `AGENTS.md` and `README.md`, including all hard rules.
- [x] Check: `npm run build` passes, and the route table is unchanged (`ƒ` for dynamic routes).

### Phase 1 – Safety net
- [x] Vitest setup with a throwaway SQLite database per test file, `MIGRATIONS` applied (`npm test`).
- [x] Tests for `resolveTripAccess` (every branch: owner, guest, locked, denied, wrong unlock cookie, disabled share).
- [x] Tests for `processUpload` (EXIF/GPS, orientation, video poster, size limits).
- [x] Tests for the auth basics (session create/expire, timing-safe password check).

### Phase 2 – Service layer
- [x] Move the logic out of `src/app/(app)/actions.ts` and `settings/actions.ts` into `src/lib/services/*`, with Zod schemas as input validation.
- [x] Server Actions become thin wrappers. Phase 1 tests stay green.

### Phase 3 – API v1
- [x] Migrations (append only):
  - `api_tokens`
  - `viewer_devices` (trip, name, token hash, last seen)
  - `client_uuid` on `steps` and `photos`
  - one-time codes for the app OIDC flow
  - whatever the changes feed needs (see open point O3)
- [x] Auth:
  - `POST /api/v1/auth/token` (password)
  - OIDC app flow with one-time code
  - `PASSWORD_LOGIN`
  - Bearer check as a single helper next to `resolveTripAccess`
- [x] `GET /api/v1/info`, `GET /api/v1/openapi.json`
- [x] Trips, steps, media upload, comments, viewers (redeem, list, remove), `changes`.
- [x] Take the upload route **out of the `src/proxy.ts` matcher** (10 MB cap otherwise).
- [x] Guard test: every `/api/v1` route without a token answers 401/404.
- [x] Web UI:
  - device token list in settings
  - viewer device management in trip settings
  - Smart App Banner and "Open in app" on the share page (both only once `APP_STORE_ID` is set), QR code and app link in the trip settings

### Phase 4 – iOS app (`ios/`)
- [x] **4a Skeleton:**
  - Xcode project with Swift client generated from `openapi.json` (`swift-openapi-generator`)
  - enter the server URL, `/info` check
  - login (OIDC first, password second)
  - token in the Keychain
- [x] **4b Read:**
  - trip list, timeline (newest first, like the web; see [E13]), MapKit map, photo viewer
  - GRDB cache, offline reading
- [x] **4c Write:**
  - offline step creation, upload queue on a background `URLSession`
  - HEIC → JPEG, video compression and poster frame, Live Photo still
  - trip create/edit
- [x] **4d Convenience:** Share Extension, photo suggestions, share sheet
- [x] **4e Viewers:**
  - redeem the invite via `ownsteps://`
  - several instances in one app
  - `BGAppRefreshTask` plus local notifications for authors and viewers
- [x] String Catalogs en/de from day one (kept up to date with every app change).
- [x] **4f Feedback from first use (requested and built 2026-10-06):**
  - View counts per step for authors, web and app (D28, [E17]).
  - Polarsteps-style trip screen in the app: map on top, steps as glass
    cards side by side, a tapped card pushes the step's page with sideways
    paging; made more iOS-native the same day (D29). Written without Xcode;
    compiled, fixed and run in the simulator and on devices on 2026-10-07.
  - Bug fixed: the app showed no cover. The trip screen had no place for it
    (now the first card), and after choosing a new cover the list card kept
    the old image or none until a pull to refresh.

### Phase 5 – Code review ("strangers run this now")
- [x] Security review of the whole server, with focus on `/api/v1`, tokens and viewer devices (2026-10-02). Fixed: brakes on every password check (per address from the right end of `X-Forwarded-For`, plus per account and per trip), share passwords ≥ 8 characters, OIDC only matches verified emails, security headers and a nonce CSP, readers signed out on a new link or password. Accepted: setup stays open until the first account exists.
- [x] Rate limiting on the password login and token endpoints.
- [x] `APP_SECRET`: refuse to start with a weak value, and document how to generate one. (Missing stays allowed: one is generated into the data directory.)
- [x] Review of the whole repo and app (2026-10-05). Fixed: guests need the share token (comments were possible on every shared trip via sequential IDs), no open redirect after OIDC sign-in, the map proxy only forwards map assets, a password change is braked and signs out other web sessions, the entrypoint drops root's groups, uploads stream to disk, images are decoded once, orphaned upload files and covers are removed, the OSM fallback map works under the CSP, and the app keeps unsent steps across signing in again or being signed out by the server.
- [x] Rest of the reviews (2026-10-05): locked share pages and their link preview show neither title, summary nor cover; `docker-entrypoint.js` no longer follows symlinks when fixing ownership; a password change also signs out all app devices; map attributions are sanitized against the maplibre v5 advisory (O4).
- [ ] Review defaults and env vars, and fail with clear startup errors.
- [ ] Check HEIC handling in the web upload path (sharp prebuilds likely cannot decode HEVC-HEIC).

### Phase 6 – Release prep
- [x] Web i18n (en default, de): cookie switch plus `Accept-Language`, no locale URLs, see [E16] in ARCHITECTURE.md (2026-10-05).
- [ ] Maps and geocoding without a key (D24).
- [x] `LICENSE` (AGPL-3.0) at the root, `ios/LICENSE` (MPL-2.0) (2026-10-06).
- [x] English README: quick start, example `docker-compose.yml`, backup, upgrade, OIDC setup.
- [x] GHCR image for amd64 and arm64, semver tags, `CHANGELOG.md`. The workflow (`.github/workflows/docker.yml`) runs on `v*.*.*` tags; `v0.1.0` is the first (2026-10-06). Still open: making the package public on GitHub, together with the repo. Installations update with `docker compose pull` – `deploy.sh` (git pull and build on the server) is gone.
- [x] `SECURITY.md`, `CONTRIBUTING.md` (2026-10-06). Reports go through GitHub's private vulnerability reporting – switch it on in the repository settings when going public.
- [ ] Demo instance for App Review, then App Store submission. Put the App Store ID into the Smart App Banner.

### Phase 7 – Open source
- [ ] Make the repo public, tag the first release.
- [ ] Issues: Polarsteps importer (help wanted), resumable uploads, offline editing with conflict detection, widget.

---

## Open points (decide when the phase is reached)

- ~~**O1 – App name and bundle ID**~~ – decided: "OwnSteps", prefix `de.ownsteps` (app `de.ownsteps.app`, Share Extension `de.ownsteps.app.ShareExtension`, app group `group.de.ownsteps.app`), set in `ios/Config/Base.xcconfig`; the team ID lives in the ignored `Secrets.xcconfig`. URL scheme `ownsteps://`.
- **O2 – Release details:** Issues and Discussions on, a CLA is not needed (D10 avoids it), versioning scheme.
- ~~**O3 – Changes feed design**~~ – decided: an append-only change log (table `changes`, cursor = `seq`), see ARCHITECTURE.md section 5.
- ~~**O4 – maplibre-gl advisory vs. [E9]**~~ – mitigated: the only HTML that
  reaches MapLibre is source attribution, and `/api/map` sanitizes it
  (`sanitizeAttributions`, see [E9]). `npm audit` keeps reporting the
  advisory until v6; whether a v6 upgrade with a fixed worker URL works is
  still worth a try – in a real browser.
- ~~**O5 – What counts as a view**~~ – decided as D28.
- ~~**O6 – Trip screen layout in the app**~~ – decided as D29.
