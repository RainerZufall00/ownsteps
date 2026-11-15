# App Store listing

Character limits from App Store Connect in brackets. Checked with
`python3 docs/app-store/check-lengths.py`.

No other app's name in name, subtitle, keywords or description – App Review
rejects metadata that names competitors (guideline 2.3.7). The README may
say where the idea came from; the store listing doesn't.

Keywords: comma-separated without spaces, and no word that's already in the
name or subtitle – those count anyway, repeating them only costs characters.
Nothing that promises what the app doesn't do (no "tracker" or "gps": OwnSteps
takes places from photos and the current location, it doesn't record a track).

## Shared

- **Bundle ID:** `de.ownsteps.app` (Share Extension `de.ownsteps.app.ShareExtension`)
- **SKU:** `ownsteps`
- **Primary language:** German
- **Category:** Travel (secondary: Photo & Video)
- **Price:** Free, no in-app purchases
- **Age rating:** answer the questionnaire honestly – no objectionable
  content of its own. Under *User-generated content*: yes, readers can write
  comments, but only people the author invited with a private link, and the
  author can delete comments and remove readers (see the review notes below).
  No messaging between strangers, no web browsing, no ads. Expect 4+/9+
  depending on how Apple weighs the comments.
- **App Privacy:** "Data Not Collected" ([D25]; everything goes to the
  server the user signs in to, never to the developer)
- **Privacy Policy URL:** `https://rainerzufall00.github.io/ownsteps/privacy`
- **Support URL:** `https://rainerzufall00.github.io/ownsteps/support`
- **Marketing URL:** `https://github.com/RainerZufall00/ownsteps`
- **Copyright:** 2026 RainerZufall00
- **Export compliance:** set in the build (`ITSAppUsesNonExemptEncryption = NO`,
  only HTTPS)
- **Content rights:** no third-party content of its own (the demo photos
  are only on the review instance and in the screenshots, Unsplash License).
- **Accessibility (App Store Connect → Accessibility):** optional; only claim
  what was tried on a device. Likely candidates: *Dark Interface* and
  *Larger Text* (system fonts throughout; four places use fixed sizes –
  check them at the largest size), *VoiceOver* once a pass through sign-in,
  trip, story and composer works. Not *Reduced Motion*: the app doesn't react
  to that setting yet.

---

## Deutsch (de-DE)

**Name** [30]
OwnSteps – Reisetagebuch

**Untertitel** [30]
Reiseblog auf eigenem Server

**Werbetext** [170]
Halte Familie und Freunde auf deinen Reisen auf dem Laufenden – mit Karte, Fotos und Geschichten. Alles bleibt auf deinem eigenen Server, kein Konto bei einer Firma.

**Schlüsselwörter** [100]
karte,route,urlaub,fotos,familie,roadtrip,privat,weltreise,backpacking,camper,travel,selfhosted

**Beschreibung** [4000]
OwnSteps ist ein Reisetagebuch für deinen eigenen Server. Du wählst Fotos aus, schreibst ein paar Zeilen – und alles landet automatisch auf einer Karte und in einer Zeitleiste. Wer mitlesen soll, bekommt einen Link. Ohne Konto, ohne Anmeldung, ohne dass deine Bilder bei einer Firma liegen.

FOTOS REIN, FERTIG
Wähle Fotos und Videos aus, und OwnSteps übernimmt Ort und Datum aus den Bildern. Ein Beitrag ist ab dem ersten Foto gespeichert, der Text kann später kommen. Teilen geht auch direkt aus der Fotos-App, und eine kleine Anzeige oben zeigt, was gerade hochgeladen wird.

DEINE ROUTE AUF DER KARTE
Jede Reise erscheint als Route auf der Karte, mit einer Station pro Ort. Darunter blätterst du durch die Beiträge, ein Tipp öffnet sie als Story – nach oben und unten zwischen den Tagen, zur Seite zwischen den Fotos. Videos spielen wie Stories.

FAMILIE UND FREUNDE LESEN MIT
Schick einen Link oder zeig einen QR-Code. Wer ihn öffnet, liest im Browser oder in der App mit – ganz ohne eigenes Konto und ohne eigenen Server – und sieht in der App, was neu ist. Leser können kommentieren, du antwortest direkt darunter; die Glocke sammelt neue Kommentare, und du siehst, wer mitliest und wie oft jeder Beitrag gesehen wurde.

UNTERWEGS GEDACHT
Beiträge ohne Netz werden gespeichert und hochgeladen, sobald wieder Verbindung da ist. Reisen sind offline lesbar. Fotovorschläge zeigen dir Bilder aus dem Reisezeitraum, die noch fehlen. Mehrere Autoren schreiben gemeinsam an einer Reise.

FÜR IPHONE, IPAD UND IPHONE DUO
Auf dem iPad und dem aufgeklappten iPhone Duo stehen deine Reisen und die Karte nebeneinander. Beim Auf- und Zuklappen bleibt alles, wo es war – auch ein Beitrag, den du gerade schreibst.

DEINE FOTOS BLEIBEN BEI DIR
OwnSteps spricht nur mit dem Server, den du angibst. Kein Konto beim Entwickler, keine Werbung, kein Tracking. Am Ende der Reise speicherst du sie als Offline-Album oder schickst sie an dein Immich.

VORAUSSETZUNGEN
Zum Schreiben brauchst du einen eigenen OwnSteps-Server. Er ist kostenlos, Open Source und läuft als einzelner Docker-Container, z. B. auf einem NAS oder Raspberry Pi. Anleitung auf GitHub: github.com/RainerZufall00/ownsteps
Zum Mitlesen reicht ein Link von den Reisenden.

**Neu in dieser Version** [4000]
Erste Version.

---

## English (en-US)

**Name** [30]
OwnSteps – Travel Journal

**Subtitle** [30]
Self-hosted travel blog & map

**Promotional text** [170]
Keep family and friends posted on your travels – with a map, photos and stories. Everything stays on your own server, no account with any company.

**Keywords** [100]
trip,diary,route,vacation,photos,family,roadtrip,private,itinerary,holiday,camper,album,backpacking

**Description** [4000]
OwnSteps is a travel journal for your own server. Pick photos, write a few lines – and everything lands on a map and in a timeline automatically. Whoever should follow along gets a link. No account, no sign-up, and your photos never sit with some company.

PICK PHOTOS, DONE
Choose photos and videos, and OwnSteps takes place and date from the pictures. A step is saved from the first photo on, the text can come later. You can also share straight from the Photos app, and a small indicator at the top shows what's uploading.

YOUR ROUTE ON THE MAP
Every trip shows as a route on the map, with one stop per place. Below it you flip through the steps, and a tap opens them as a story – swipe up and down between days, sideways between photos. Videos play like stories.

FAMILY AND FRIENDS FOLLOW ALONG
Send a link or show a QR code. Whoever opens it reads along in the browser or in the app – without an account or a server of their own – and sees in the app what's new. Readers can comment and you reply right below; the bell collects new comments, and you see who follows and how often each step was seen.

MADE FOR THE ROAD
Steps written without a connection are kept and uploaded once you're back online. Trips can be read offline. Photo suggestions show pictures from the trip's dates you haven't added yet. Several authors can write a trip together.

FOR IPHONE, IPAD AND IPHONE DUO
On iPad and on an unfolded iPhone Duo, your trips and the map sit side by side. Opening or closing the phone keeps everything in place – even a step you're in the middle of writing.

YOUR PHOTOS STAY WITH YOU
OwnSteps only talks to the server you enter. No account with the developer, no ads, no tracking. At the end of a trip, keep it as an offline album or send it to your Immich.

REQUIREMENTS
To write, you need your own OwnSteps server. It's free, open source and runs as a single Docker container, e.g. on a NAS or a Raspberry Pi. Setup on GitHub: github.com/RainerZufall00/ownsteps
To read along, a link from the travellers is all you need.

**What's New** [4000]
First release.

---

## App Review information

App Review needs a server to sign in to – the demo instance from [D25]
(`scripts/seed-demo.mjs` fills it; reset it nightly). Fill in the address
and account below and paste the notes into App Store Connect →
*App Review Information*. Sign-in required: yes, with the demo account.

**Notes** [4000]
OwnSteps is a client for a self-hosted, open-source server (github.com/RainerZufall00/ownsteps). There are no accounts with the developer. Travellers (authors) sign in to their own server; family and friends (readers) follow a trip through a private link, without an account. We run a demo server for review, reset every night, so feel free to add, change and delete anything.

Demo server: DEMO_SERVER_ADDRESS
Demo account: DEMO_EMAIL / DEMO_PASSWORD
Share link of the demo trip: DEMO_SHARE_LINK

A. AS AN AUTHOR (signed in)
1. On the welcome screen, enter the server address and tap Continue, then sign in with the demo account.
2. Open "Portugal Roadtrip". The route is on the map, the steps are listed below it. Tap a step to open it as a story: swipe up and down between steps, sideways between photos.
3. Tap "+" (New step) and pick a few photos from the library. Place and date are taken from the photos' metadata; if a photo has none, tap "My location" or "On the map". Add a text and save. Photos are only uploaded when they are added to a step.
4. In a story, tap the speech bubble to see the readers' comments. Swipe left on a comment (or touch and hold it) for "Delete comment". "Reply" answers a comment.
5. Trip menu (… at the top right) → Readers: shows who follows the trip in the app, with the link and a QR code for inviting someone. Swipe left on a reader and tap "Remove" to revoke that reader's access at once.
6. In the trip list, the bell (News) collects new comments and steps.

B. AS A READER (no account)
1. Either sign out first (trip list → gear icon → Settings → Sign out) or delete and reinstall the app. On the welcome screen, tap "Follow a trip with a link".
   Alternatively, while signed in, tap "+" in the trip list → "Follow a trip …" – the followed trip then appears next to your own.
2. Paste the share link above and enter any name, e.g. "Reviewer". This name is shown to the authors and under your comments.
3. Read the trip on the map and as stories. Readers cannot add, edit or delete steps.
4. Open a step's comments, write a comment and send it.
5. If you are also signed in as the author (step B.1 alternative), you will see the new comment in the author's view and can delete it or remove the reader "Reviewer" there – this shows the moderation tools from step A.4 and A.5.
6. Trip menu → "Stop following" removes the trip and its offline copy from the device.

Permissions: Photos (to read place and date and suggest photos from the trip's dates), Location only when tapping "My location", Local Network to reach a server at home, Notifications for new comments and steps (the app checks the servers in the background; there is no push service).

User-generated content: comments come only from readers the author invited with a private link; trips are not public or searchable, and there is no messaging between users. Authors can delete any comment and remove any reader, which ends that reader's access at once. All content lives on the author's own server, never with the developer.

Contact for review: feedback@mail.mueller.ad

---

## Screenshots

Framed for the store: a headline on the app's accent gradient, the raw
screenshot below it in a device bezel. Upload the framed sets; the raw
captures are kept next to them for the README and for re-framing.

Required: iPhone 6.9" (1320 × 2868) and iPad 13" (2064 × 2752), per language.
App Store Connect may also ask for iPhone 6.1"/6.3" (1206 × 2622); those are
scaled down from the framed 6.9" set and live in `iphone-6.3/` – the 6.9"
files are refused in that slot.

Two wide pieces of artwork go with them, per language: the product page
header (`header/`, 5244 × 2950 or 3840 × 1646) and the search results
(`search-results/`, 5244 × 2950 or 3840 × 2560; 1920 × 1280 is allowed
too). Both show iPad, the open iPhone Duo and iPhone side by side on the
accent gradient, without text, since the store lays its own over them;
check against Apple's templates ("Vorlagen durchsuchen" / "Browse
templates") that nothing important sits under it. Upload one size per slot.
iPhone Duo has two sets of its own, outer display (1398 × 2034) and inner
display (2853 × 2007): optional for now and what earns the "Made for iPhone
Duo" badge, required from April 2027 for builds with the iOS 27.1 SDK. They
can't be scaled from the other sets – the inner display shows the sidebar
layout at another aspect ratio. See "iPhone Duo" below.

All of it is git-ignored, under `docs/app-store/screenshots/`:

- `<de|en>/<iphone|iphone-6.3|iphone-duo-outer|iphone-duo-inner|ipad>/` –
  framed, in upload order, no alpha channel
- `<de|en>/<header|search-results>/` – the wide artwork, named by size
- `raw/<de|en>/<device>/` – the simulator captures
- `tools/` – `render.py` (captions, order, sizes), `frame.swift` (the
  layout), `hero.swift` (the wide artwork), `news.py` (readers and their comments), `reply.py` (the
  author's name and a reply), `geotag.cjs` (photos for the composer)

| # | Screen | Headline (de) | Headline (en) |
|---|---|---|---|
| 1 | Route on the map | Deine Reise auf der Karte | Your trip on the map |
| 2 | Step as a story | Jeder Tag eine Story | Every day a story |
| 3 | New step, place and date from the photos | Fotos rein, fertig | Pick photos, done |
| 4 | Readers with QR code | Familie und Freunde lesen mit | Family and friends follow along |
| 5 | Comments with a reply from the author | Grüße von zu Hause | Messages from home |
| 6 | Trip list | Alle Reisen an einem Ort | All your trips in one place |
| 7 | Welcome screen | Dein Server, deine Fotos | Your server, your photos |

The news bell stays out on purpose: it leans on notifications, which aren't
reliable yet, and comments show the same thing without that promise. The
iPad set has 1–4 and 6; the iPhone and both Duo sets have all seven.
Sublines are in `tools/render.py`.

How they were taken, to repeat them for a new version:

1. Start a dev server on an empty data directory with `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` and `PUBLIC_URL=https://trips.example.com`, then
   `node scripts/seed-demo.mjs --email … --password … --lang de|en`.
2. Simulators of their own (*iPhone 18 Pro Max*, *iPad Pro 13-inch (M5)*,
   iPhone Duo – see below), so another session's app doesn't turn up on
   them. System language set to the screenshot language
   (`xcrun simctl spawn <device> defaults write -g AppleLanguages -array de-DE`,
   then reboot), and
   `xcrun simctl status_bar <device> override --time 9:41 --dataNetwork wifi --batteryState charged --batteryLevel 100`.
3. Debug build, launched with `-OwnStepsDebugServer http://localhost:2555`
   plus email and password (see `ios/README.md`). Run step 5 *before*
   signing in: the app keeps the account's name from sign-in, so "Comment
   as …" would otherwise still say "demo".
4. For the new-step screen, `node tools/geotag.cjs .demo-photos <dir>` writes
   three photos from the Algarve on 18 September (Sagres, Cabo de São
   Vicente, Lagos); add them with `xcrun simctl addmedia` and pick them –
   don't save the step. Dismiss the photo suggestion banner on the map
   first ("Not now"): those photos fall into the trip's dates.
5. For readers and comments, `python3 tools/news.py <de|en> <password>`
   (four readers in the app, each commenting on the Portugal trip), then
   `python3 tools/reply.py <de|en> <password>`: names the author "Anna"
   and answers Lena's comment on Lagos. The comments screenshot is the
   Lagos story with its comment sheet pulled up all the way. Start from a
   fresh data directory rather than cleaning up – the apps keep news
   locally, so deleted comments linger there.
6. `xcrun simctl io <device> screenshot <file>.png` into `raw/…`. A text
   cursor blinks: take a few and keep one without it. On the iPad it can
   stay lit; then paint it over in the field's colour. Typing into the
   composer through the simulator's paste didn't take, so the text field
   shows its placeholder.
7. `python3 tools/render.py raw .` frames everything, drops the alpha
   channel, scales the 6.3" set and draws the wide artwork. It needs
   `tools/frame` and `tools/hero`, compiled with
   `swiftc -O -o tools/frame tools/frame.swift` (likewise `hero`).

### iPhone Duo

Needs Xcode 27.1 or later and its iOS simulator runtime for iPhone Duo, a
separate download. Xcode 27.0 has no iPhone Duo simulator, and a build with
its SDK isn't the layout that ships.

1. Create a device of its own (the runtime's name follows the installed
   Xcode, see `xcrun simctl list runtimes`):
   `xcrun simctl create "OwnSteps Screenshots Duo" com.apple.CoreSimulator.SimDeviceType.iPhone-Duo com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4`.
   A boot status of "Data Migration Failed" did no harm.
2. Use the same steps as above, switching poses with the buttons in Device
   Hub (`simctl` has no pose command).
3. Screenshots are per display:
   `xcrun simctl io <device> screenshot --display=primary <file>.png` for the
   outer one, `--display=primary-1` for the inner one. Right after booting
   they can come out black for a few minutes.
4. Check on the inner display: sidebar with a trip, a story, a sheet; on the
   outer one the vertical bars right of the content. Then open and close the
   phone with a story and with the step composer open – both have to stay.
   The simulator's *Closed* button didn't always take; a device booted fresh
   starts closed, which is enough for the outer screenshots.
