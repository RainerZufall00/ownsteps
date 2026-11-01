# OwnSteps user guide

How OwnSteps works once it's running. To set up a server, see
[self-hosting](SELF-HOSTING.md).

## Features

- 📸 **Place and time automatically** – taken from the photos' EXIF data; a step is saved from the first photo on
- 🗺️ **Route on the map** – every step a stop, every trip a line; flip through the steps as stories
- 👨‍👩‍👧 **Readers without accounts** – a secret link or QR code is enough, in the browser or the app, optionally with a password
- 💬 **Comments and reach** – readers comment, authors see how many have seen each step
- 🔔 **News in the apps** – new comments and new steps, without a push service in between
- ✈️ **Made for the road** – mobile first, offline reading in the apps, uploads that wait for a connection, videos up to 400 MB
- 👥 **Several authors** – everyone with an account writes on every trip together
- 💾 **Keep it** – download a trip as an offline album (one page with all photos, texts and a map, no server needed), or send it to your Immich with the text in each photo's description
- 🔒 **Your photos stay with you** – images are only served to signed-in users or holders of a valid share link; nothing goes to third parties
- 📦 **One container, one file** – SQLite plus a folder of images, that's it

## How it works

1. **Create a trip** – only a name is required. The date range is optional and
   can be changed at any time.
2. **Add a step** – pick photos, done. Place and time come from the images;
   the step is saved from the first photo on, even if the text comes later.
3. **Share** – flip the switch in the share settings and send the link.
   Optionally with a password on top. A new link invalidates the old one, so
   OwnSteps asks before creating one.

## In detail

If a **date range** is set, it shows in the header and on the trip card – even
before the first step exists. It also determines the first trip day: whoever
leaves on July 1 and writes the first step on July 4 reads "day 4" there.
Without a date range, both follow the steps as before.

Besides photos, **videos** can be uploaded too (up to 400 MB). The poster
frame is created in the browser; the file itself is stored unchanged, nothing
is transcoded.

Uploads are streamed to disk, so even a 400 MB video doesn't need much RAM
on the server. The editor rejects larger files right when they're picked
instead of uploading them first. If a reverse proxy sits in front, it
must let large uploads through – for nginx e.g. `client_max_body_size 400m;`;
if an upload aborts without an entry in the container log, it's almost always
the proxy.

Whoever has the link can **comment** – type a name, write a text, no account.
Only signed-in authors can delete comments.

Authors see on every step **how many readers have seen it** – each reader
counted once, whether they follow in the app or read the share link.
Readers don't see the numbers, and authors aren't counted. To tell browsers
apart, the share page sets a random cookie (`ownsteps_visitor`); the server
stores only its hash and which steps it saw, no IP addresses.

The timeline shows the **newest step on top**. Day counting ("day 6") still
counts from the start of the trip, and the map naturally draws the route in
the direction traveled.

The **place** serves as the heading; there is no separate title. Each photo
**and each video** can carry a **caption**, shown below the medium in the
fullscreen view. There, tapping the right or left side pages onwards, a double
tap or two fingers zoom.

For a **video**, a tap belongs to playback. Moving on works by swiping across
the image or via the arrows left and right, which are shown for videos on
every device. Gestures on the video's control bar are reserved for scrubbing.
**Videos can't be zoomed** – they get big via the browser's fullscreen button.
Pinching and double-tapping deliberately do nothing there: otherwise the
browser zooms the whole page, and the only way out of that state is reloading.

Once the video is handed to the browser's own view via the fullscreen button,
the browser only shows the video – caption and arrows are back only after
leaving it.

The **map view** has a strip at the bottom for paging through the steps – the
map follows along. A second tap jumps to the step. It keeps its distance from
the bottom edge of the screen, because that's where the system's swipe area
sits on iPhone and iPad.

Timeline and map sit **side by side from 1280 pixels**. Below that – including
tablets in landscape – you switch between them; that way each view gets the
full width instead of two cramped columns.

Photos without GPS data don't get an automatic place. The editor offers three
ways: the **device location** button takes the position from the device, the
**place field searches** as you type (tapping a suggestion sets place and map
section), and as a last resort tapping the map sets the point.

A trip can only be deleted after typing its name as confirmation – photos and
steps are gone afterwards.

All accounts work together on all trips; there is deliberately no permission
system.

## The apps

The **iOS app** ([ios/](../ios/README.md)) and the **Android app**
([android/](../android/README.md)) are native and do the same: write steps on the
road (also straight from the share sheet), read trips offline, get news, and
follow other people's trips as a reader. Both can be signed in to several
servers at once.

Readers don't need a server of their own: *Follow a trip with a link* on the
welcome screen, or simply open the link on the phone.

## Languages

The web interface and the apps speak English and German. They follow the
device's language; a switch in the settings, on the sign-in page and on
shared trips overrides it.
