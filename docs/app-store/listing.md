# App Store listing

Character limits from App Store Connect in brackets. Checked with
`python3 docs/app-store/check-lengths.py`.

No other app's name in name, subtitle, keywords or description – App Review
rejects metadata that names competitors (guideline 2.3.7). The README may
say where the idea came from; the store listing doesn't.

## Shared

- **Bundle ID:** `de.ownsteps.app` (Share Extension `de.ownsteps.app.ShareExtension`)
- **SKU:** `ownsteps`
- **Primary language:** German
- **Category:** Travel (secondary: Photo & Video)
- **Price:** Free, no in-app purchases
- **Age rating:** answer the questionnaire honestly – no objectionable
  content of its own, but readers can write comments (see "User-generated
  content" in the review notes below)
- **App Privacy:** "Data Not Collected" ([D25]; everything goes to the
  server the user signs in to, never to the developer)
- **Privacy Policy URL:** `https://rainerzufall00.github.io/ownsteps/privacy`
- **Support URL:** `https://rainerzufall00.github.io/ownsteps/support`
- **Marketing URL:** `https://github.com/RainerZufall00/ownsteps`
- **Copyright:** 2026 RainerZufall00
- **Export compliance:** set in the build (`ITSAppUsesNonExemptEncryption = NO`,
  only HTTPS)

---

## Deutsch (de-DE)

**Name** [30]
OwnSteps – Reisetagebuch

**Untertitel** [30]
Reiseblog auf eigenem Server

**Werbetext** [170]
Halte Familie und Freunde auf deinen Reisen auf dem Laufenden – mit Karte, Fotos und Geschichten. Alles bleibt auf deinem eigenen Server, kein Konto bei einer Firma.

**Schlüsselwörter** [100]
reise,travel,blog,karte,route,urlaub,fotos,tagebuch,selfhosted,familie,roadtrip,privat,weltreise,gps

**Beschreibung** [4000]
OwnSteps ist ein Reisetagebuch für deinen eigenen Server. Du lädst Fotos hoch, schreibst ein paar Zeilen – und alles landet automatisch auf einer Karte und in einer Zeitleiste. Wer mitlesen soll, bekommt einen Link. Ohne Konto, ohne Anmeldung, ohne dass deine Bilder bei einer Firma liegen.

FOTOS REIN, FERTIG
Wähle Fotos und Videos aus, und OwnSteps übernimmt Ort und Zeit aus den Bildern. Ein Beitrag ist ab dem ersten Foto gespeichert, der Text kann später kommen. Teilen geht auch direkt aus der Fotos-App.

DEINE ROUTE AUF DER KARTE
Jede Reise erscheint als Route auf der Karte, mit einer Station pro Ort. Darunter blätterst du durch die Beiträge, ein Tipp öffnet sie als Story – wischen nach oben und unten zwischen Tagen, zur Seite zwischen Fotos. Videos spielen wie Stories.

FAMILIE UND FREUNDE LESEN MIT
Schick einen Link oder zeig einen QR-Code. Wer ihn öffnet, liest im Browser oder in der App mit – ganz ohne eigenes Konto und ohne eigenen Server – und bekommt Neuigkeiten, wenn du etwas Neues schreibst. Leser können kommentieren, du siehst, wer mitliest und wie oft jeder Beitrag gesehen wurde.

UNTERWEGS GEDACHT
Beiträge ohne Netz werden gespeichert und hochgeladen, sobald wieder Verbindung da ist. Reisen sind offline lesbar. Fotovorschläge zeigen dir Bilder aus dem Reisezeitraum, die noch fehlen. Mehrere Autoren können gemeinsam an einer Reise schreiben.

DEINE FOTOS BLEIBEN BEI DIR
OwnSteps spricht nur mit dem Server, den du angibst. Kein Konto beim Entwickler, keine Werbung, kein Tracking. Am Ende der Reise exportierst du sie als Offline-Album oder schickst sie an dein Immich.

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
travel,trip,diary,blog,route,tracker,vacation,photos,selfhosted,family,road trip,private,itinerary

**Description** [4000]
OwnSteps is a travel journal for your own server. Upload photos, write a few lines – and everything lands on a map and in a timeline automatically. Whoever should follow along gets a link. No account, no sign-up, and your photos never sit with some company.

PICK PHOTOS, DONE
Choose photos and videos, and OwnSteps takes place and time from the pictures. A step is saved from the first photo on, the text can come later. You can also share straight from the Photos app.

YOUR ROUTE ON THE MAP
Every trip shows as a route on the map, with one stop per place. Below it you flip through the steps, and a tap opens them as a story – swipe up and down between days, sideways between photos. Videos play like stories.

FAMILY AND FRIENDS FOLLOW ALONG
Send a link or show a QR code. Whoever opens it reads along in the browser or in the app – without an account or a server of their own – and gets news when you post something new. Readers can comment, and you see who follows and how often each step was seen.

MADE FOR THE ROAD
Steps written without a connection are kept and uploaded once you're back online. Trips can be read offline. Photo suggestions show pictures from the trip's dates you haven't added yet. Several authors can write a trip together.

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
OwnSteps is a client for a self-hosted, open-source server (github.com/RainerZufall00/ownsteps). There are no accounts with the developer; every user runs their own server or follows a trip through a link from someone who does.

Demo server for review:
1. Open the app, enter the server address DEMO_SERVER_ADDRESS and tap Continue.
2. Sign in with the demo account below.
3. Open "Portugal Roadtrip" to see the map, the steps and the readers. The "+" button adds a step from the photo library.

Reading along without an account: on the welcome screen, tap "Follow a trip with a link" and paste DEMO_SHARE_LINK.

User-generated content: comments come only from people the author invited with a private link; the trip is not public or searchable. Authors can delete any comment and remove any reader (trip menu → Readers), which revokes that reader's access at once. All content lives on the user's own server.

The demo server is reset every night.

---

## Screenshots

Required: iPhone 6.9" (1320 × 2868) and iPad 13" (2064 × 2752), per language.
In `docs/app-store/screenshots/<en|de>/<iphone|ipad>/` (git-ignored), in
upload order:

| # | iPhone | iPad |
|---|---|---|
| 1 | Route on the map | Route on the map |
| 2 | Step as a story | Step as a story |
| 3 | Trip list | Trip list in the sidebar |
| 4 | New step, place and date from the photos | New step |
| 5 | Readers with QR code | Readers with QR code |
| 6 | News: comments from readers | – |
| 7 | Welcome screen | – |

How they were taken, to repeat them for a new version:

1. Start a dev server on an empty data directory with `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` and `PUBLIC_URL=https://trips.example.com`, then
   `node scripts/seed-demo.mjs --email … --password … --lang de|en`.
2. Simulators *iPhone 18 Pro Max* and *iPad Pro 13-inch (M5)*, system language
   set to the screenshot language (the iPad status bar shows the date),
   `xcrun simctl status_bar <device> override --time 9:41 --batteryState charged --batteryLevel 100`.
3. Debug build, launched with `-OwnStepsDebugServer http://localhost:2555`
   plus email and password (see `ios/README.md`).
4. For the new-step screen, add three geotagged photos to the simulator with
   `xcrun simctl addmedia` and pick them – don't save the step.
5. For the news list, post a few reader comments after signing in, then send
   the app to the background and back.
6. `xcrun simctl io <device> screenshot <file>.png`.
