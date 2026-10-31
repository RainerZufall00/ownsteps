# iOS release checklist

## GitHub

- [x] Repository public.
- [ ] Settings → Pages → *Deploy from a branch* → `main` / `docs`. Privacy
      policy and support page are then at
      `https://rainerzufall00.github.io/ownsteps/privacy` and `…/support`.
      (Everything else in `docs/` is published too – it's public in the repo
      anyway.)
- [ ] Optional: enable Discussions, switch on private vulnerability reporting
      (see `SECURITY.md`).

## Apple Developer Program

- [x] Team ID in `ios/Config/Secrets.xcconfig` (`DEVELOPMENT_TEAM`).
- [ ] Identifiers: `de.ownsteps.app` and `de.ownsteps.app.ShareExtension`,
      both with the App Group `group.de.ownsteps.app`. Xcode's automatic
      signing creates them on the first archive.
- [ ] App Store Connect → Business: EU trader status. A free app without
      in-app purchases can usually be offered as a non-trader.

## Demo instance for App Review ([D25])

- [ ] Run an OwnSteps instance on the VPS, e.g. `demo.<your-domain>`, with
      `ADMIN_EMAIL`/`ADMIN_PASSWORD` set and `GEOCODING` left on.
- [ ] Fill it: `node scripts/seed-demo.mjs --server https://demo.… --email … --password …`
      (three trips with Unsplash photos, five readers with comments; the
      Portugal trip is shared).
- [ ] Reset it nightly: stop the container, replace `data/` with a copy taken
      right after seeding, start it again (cron).
- [ ] Put address, account and share link into the review notes in
      `listing.md`.

## App Store Connect

- [ ] New app: name *OwnSteps – Reisetagebuch*, bundle ID `de.ownsteps.app`,
      SKU `ownsteps`, primary language German. Add English (U.S.).
- [ ] Texts in German and English from `listing.md`
      (`python3 docs/app-store/check-lengths.py`).
- [ ] App Privacy: *Data Not Collected*. Privacy Policy URL from GitHub Pages.
- [ ] Age rating questionnaire.
- [ ] Screenshots: iPhone 6.9" and iPad 13", German and English, from
      `docs/app-store/screenshots/` (see `listing.md`).
- [ ] App Review information: demo account, notes, contact details.

## Build (Xcode Cloud)

- [ ] Xcode → Integrate → Create Workflow on `ios/OwnSteps.xcodeproj`: start
      condition *branch changes* on `main` (or manual), action
      *Archive – iOS*, post-action *TestFlight Internal Testing*. Grant
      access to the GitHub repository. `ios/ci_scripts/ci_post_clone.sh`
      writes `Secrets.xcconfig` and lets the OpenAPI build plugin run.
- [ ] Bump `MARKETING_VERSION` for a new version (1.0 for the first one).
      The build number is set by Xcode Cloud.
- [ ] Test on a real device: sign-in with password and OIDC, upload photos
      and a video over mobile data, the Share Extension from Photos, follow a
      trip by link, notifications after a day in the background, German and
      English.
- [ ] TestFlight: internal testing first, then a small external group (needs
      a short beta review).
- [ ] Submit for review.

## After approval

- [ ] Set `APP_STORE_ID` on your instances so shared trips offer to open in
      the app (Smart App Banner).
- [ ] Put the App Store link into the README (two places marked `TODO`).
- [ ] Tick the release off in `docs/ROADMAP.md`, phase 6.
