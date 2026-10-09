# OwnSteps

A travel journal for your own server: upload photos, write a few lines, and
everything lands on a map and in a timeline automatically. Whoever should
follow along gets a secret link – no account, no sign-up.

- **Mobile first** – for uploading on the road as much as for reading on the couch.
- **Place and time automatically** – taken from the photos' EXIF data.
- **Your photos stay with you** – nothing is handed to third parties; images
  are only served to signed-in users or holders of a valid share link.
- **One container, one file** – SQLite plus a folder of images, that's it.
- **Keep it** – download a trip as an offline album (one page with all photos,
  texts and a map, no server needed), or send it to your Immich with the text
  in each photo's description.

> The user interface speaks English and German. It follows the browser's
> language; a switch in the settings, on the sign-in page and on shared trips
> overrides it.

## Quick start

OwnSteps runs as a ready-made Docker image; all you need is Docker with the
compose plugin. Fetch the compose file and the configuration template into
a folder of their own:

```bash
mkdir ownsteps && cd ownsteps
curl -fsSLO https://raw.githubusercontent.com/RainerZufall00/ownsteps/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/RainerZufall00/ownsteps/main/.env.example
```

Edit `.env` – at least `PUBLIC_URL` and `MAPTILER_KEY`. Then:

```bash
docker compose up -d
```

The image is published for amd64 and arm64 (e.g. a Raspberry Pi 4/5). The
app runs on port 2555. On the first visit, `/setup` walks you through
creating the first account (skipped if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are
set in `.env` or sign-in runs through OIDC).

## Setting up the map

The map and place names work out of the box, without an account anywhere:

- **Map:** [OpenFreeMap](https://openfreemap.org) – free vector maps. Pick a
  style with `MAP_STYLE=liberty` (default), `bright` or `positron`.
- **Place names and place search:** OpenStreetMap's
  [Nominatim](https://nominatim.org) and [Photon](https://photon.komoot.io),
  at most one request per second each, as their usage policies ask.

With a [MapTiler](https://cloud.maptiler.com/account/keys/) key
(`MAPTILER_KEY=...` in `.env`, free tier is plenty) both come from MapTiler
instead, and `MAP_STYLE` takes MapTiler's styles – `hybrid` (satellite with
labels, the default then), `satellite`, `streets-v2`, `outdoor-v2` … The key
stays on the server: all map requests go through `/api/map`, so it never
shows up in shared links.

`GEOCODING=off` keeps every place lookup on your server; place names are then
typed by hand.

## Sign-in via OIDC (e.g. Pocket ID)

Create an OIDC client with your provider using the callback URL:

```
https://your-domain.com/api/auth/oidc/callback
```

Then set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` in `.env`.
The sign-in page then shows a button for the provider (label configurable via
`OIDC_BUTTON_LABEL`).

Whoever signs in via OIDC with the same email address as an existing account
ends up in that account automatically. Password sign-in stays active as a
fallback in case the provider is unreachable.

If not everyone on your identity provider should get access, use
`OIDC_ALLOWED_EMAILS=you@example.com,partner@example.com`.

Accounts are only matched or created by an email address the provider marks
as verified (`email_verified`). If yours checks addresses but doesn't send that
claim, set `OIDC_TRUST_EMAIL=true`.

Once OIDC works, `PASSWORD_LOGIN=false` switches password sign-in off in the
web UI and the app alike.

## API and app

The iOS app ([ios/](ios/README.md)) and the Android app ([android/](android/README.md)) talk to `/api/v1`, a versioned REST API with bearer tokens. The
description is served at `/api/v1/openapi.json`; `/api/v1/info` tells clients
which sign-in methods and features the server offers. Signed-in app devices
show up under *Settings* and can be signed out there; readers who follow a
trip in the app are listed in the trip's settings. Details in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), section 5.

When the app is in the App Store, set `APP_STORE_ID` so shared trips offer to
open in the app.

## Reverse proxy

Behind Caddy, Traefik or nginx, restrict the port in `docker-compose.yml` to
`127.0.0.1:${HOST_PORT:-2555}:2555` so the container isn't directly reachable
from the network. Example for Caddy:

```
trips.example.com {
    reverse_proxy 127.0.0.1:2555
}
```

Inside the container the app always runs on 2555; `HOST_PORT` in `.env` only
changes the outside port. `PORT` does **not** belong there – it would change
the container port while the mapping stays the same.

**Set `PUBLIC_URL` to the public address.** Share links, preview images and
the OIDC callback URL are built from it. Without it, OwnSteps derives the
address from the `Host` header – behind a proxy an internal address can then
easily end up in a link you send out.

**Never use the container IP** from `docker inspect` as the proxy target: it
changes on every restart, and forwarding is dead afterwards. Depending on how
the proxy is set up, there are two clean ways:

**Proxy or tunnel client in the host network** (e.g. Pangolin's `newt`, or
Caddy and nginx directly on the server): the target is `127.0.0.1:2555`, i.e.
the port mapped on the host. Then additionally set

```
BIND_ADDRESS=127.0.0.1
```

in `.env` so the port is only reachable locally and not open to the network.

**Proxy as a container in a bridge network** (Traefik, nginx-proxy-manager):
attach both containers to the same network and use the container name
`http://ownsteps:2555` as the target. The scaffolding for that is commented
out in `docker-compose.yml`. Container names only resolve inside bridge
networks – this doesn't work for a proxy in the host network.

Important: `X-Forwarded-Proto` must be passed through (Caddy and Traefik do
this by default) so share links are created with `https://`. Alternatively set
`PUBLIC_URL` explicitly – it always takes precedence.

**`TRUSTED_PROXIES`** (default `1`) tells OwnSteps how many proxies append to
`X-Forwarded-For` – the brakes against password guessing count per client
address. One proxy (Caddy, nginx, Traefik, Pangolin): leave it. Two, e.g.
Cloudflare in front of Caddy: `2`. Reachable directly without a proxy: `0`.

The proxy must let large uploads through: 25 MB is enough for photos, videos
can be up to 400 MB (nginx: `client_max_body_size 400m;`). Its timeout should
be generous too – a video over a mobile connection takes a while.

## How it works

1. **Create a trip** – only a name is required. The date range is optional and
   can be changed at any time.
2. **Add a step** – pick photos, done. Place and time come from the images;
   the step is saved from the first photo on, even if the text comes later.
3. **Share** – flip the switch in the share settings and send the link.
   Optionally with a password on top. A new link invalidates the old one, so
   OwnSteps asks before creating one.

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

## Backups

Everything important lives in the `data/` folder:

```
data/
├── ownsteps.db      # trips, steps, accounts
├── .secret          # signing secret for share links
└── uploads/         # photos in all sizes
```

A backup is a copy of this folder – ideally with the container stopped, so the
database is at rest:

```bash
docker compose stop
tar czf ownsteps-backup-$(date +%F).tar.gz data/
docker compose start
```

Every photo is stored as `thumb` (480px), `medium` (1280px) and `large`
(2400px) in WebP format, plus the unchanged original. The app always shows the
web sizes; the original is only kept as a safeguard under
`data/uploads/<id>/original` and can be copied from there. To save space, set
`KEEP_ORIGINALS=false` – then only the web sizes remain.

## Updating

```bash
docker compose pull && docker compose up -d
```

This fetches the newest image and restarts the container with it. Schema
changes are applied automatically on startup; `.env` and `data/` stay
untouched. Making a backup first (see above) doesn't hurt.

`docker-compose.yml` follows `latest`, i.e. every release. To decide yourself
when to move on, pin a version there instead – `:1` takes every 1.x release,
`:1.2.3` exactly that one. The releases and what changed are listed on the
[releases page](https://github.com/RainerZufall00/ownsteps/releases).

## Development

```bash
git clone https://github.com/RainerZufall00/ownsteps.git && cd ownsteps
npm install
cp .env.example .env
npm run dev
```

Without `DATA_DIR`, database and photos go into the `./data` folder.
`npm test` runs the tests. To try your own Docker image, build it with
`docker build -t ownsteps .` and put `image: ownsteps` into
`docker-compose.yml`.

A new release is a version tag: `git tag v1.2.3 && git push --tags` builds the
image for both architectures and publishes it to the GitHub Container
Registry (`.github/workflows/docker.yml`).

## Tech

Next.js 16 (App Router) · SQLite via Drizzle · sharp for the image sizes ·
exifr for GPS and capture time · MapLibre GL for the map · Tailwind CSS v4.

If you work on the code, **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** has
the data model, the flows behind upload, access control and sign-in, and the
reasoning behind every decision made.

## Contributing

Bug reports and pull requests are welcome – see
[CONTRIBUTING.md](CONTRIBUTING.md). Security problems please report
privately, as described in [SECURITY.md](SECURITY.md). What changed between
versions is in [CHANGELOG.md](CHANGELOG.md).

## Known quirks

- **HEIC from iPhones:** Safari usually converts photos to JPEG on upload. If
  that doesn't happen, set *Settings → Camera → Formats* to "Most Compatible"
  on the iPhone.
- **Place names come from OpenStreetMap or MapTiler:** coordinates from your
  photos are sent to one of them to name the place, unless `GEOCODING=off`.

## License

The server and web UI are free software under the
[GNU Affero General Public License v3.0](LICENSE): if you run a modified
version for others, you have to offer them its source code. The iOS app in
`ios/` and the Android app in `android/` are under the
[Mozilla Public License 2.0](ios/LICENSE).
