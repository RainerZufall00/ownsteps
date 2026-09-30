# OwnSteps

A travel journal for your own server: upload photos, write a few lines, and
everything lands on a map and in a timeline automatically. Whoever should
follow along gets a secret link – no account, no sign-up.

- **Mobile first** – for uploading on the road as much as for reading on the couch.
- **Place and time automatically** – taken from the photos' EXIF data.
- **Your photos stay with you** – nothing is handed to third parties; images
  are only served to signed-in users or holders of a valid share link.
- **One container, one file** – SQLite plus a folder of images, that's it.

> The user interface is currently German only. English and German UI
> translations are planned before the first public release (see
> [docs/ROADMAP.md](docs/ROADMAP.md)).

## Quick start

```bash
git clone <your-repo> ownsteps && cd ownsteps
cp .env.example .env
```

Then edit `.env` – at least `PUBLIC_URL` and `MAPTILER_KEY`. Then:

```bash
docker compose up -d --build
```

The app runs on port 2555. On the first visit, `/setup` walks you through
creating the first account (skipped if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are
set in `.env` or sign-in runs through OIDC).

## Setting up the map

OwnSteps uses MapTiler as its map source. The free tier is plenty for private
use:

1. Create a key at [cloud.maptiler.com](https://cloud.maptiler.com/account/keys/).
2. Put `MAPTILER_KEY=...` into `.env`.

The key stays on the server: all map requests go through `/api/map`, so it
never shows up in shared links. Without a key the app shows a basic
OpenStreetMap map – it works, but looks considerably plainer.

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

Once OIDC works, `PASSWORD_LOGIN=false` switches password sign-in off in the
web UI and the app alike.

## API and app

The iOS app talks to `/api/v1`, a versioned REST API with bearer tokens. The
description is served at `/api/v1/openapi.json`; `/api/v1/info` tells clients
which sign-in methods and features the server offers. Signed-in app devices
show up under *Einstellungen* and can be signed out there; readers who follow a
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

The 400 MB are a memory limit, not a format limit: the server reads the file
in one piece and briefly needs about twice as much RAM for it. On a small VPS
that is the real limit. The editor rejects larger files right when they're
picked instead of uploading them first. If a reverse proxy sits in front, it
must let large uploads through – for nginx e.g. `client_max_body_size 400m;`;
if an upload aborts without an entry in the container log, it's almost always
the proxy.

Whoever has the link can **comment** – type a name, write a text, no account.
Only signed-in authors can delete comments.

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
./deploy.sh
```

The script fetches the changes, rebuilds the image and waits until the
container reports healthy; otherwise it prints the last log lines. By hand it
works the same way:

```bash
git pull && docker compose up -d --build
```

Schema changes are applied automatically on startup. `.env` and `data/` are
not in the repository and stay untouched by an update.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Without `DATA_DIR`, database and photos go into the `./data` folder.

## Tech

Next.js 16 (App Router) · SQLite via Drizzle · sharp for the image sizes ·
exifr for GPS and capture time · MapLibre GL for the map · Tailwind CSS v4.

If you work on the code, **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** has
the data model, the flows behind upload, access control and sign-in, and the
reasoning behind every decision made.

## Known quirks

- **HEIC from iPhones:** Safari usually converts photos to JPEG on upload. If
  that doesn't happen, set *Settings → Camera → Formats* to "Most Compatible"
  on the iPhone.
- **No geocoding without a MapTiler key:** place names like "Bergen, Norway"
  are looked up via MapTiler. Without a key the field stays empty and can be
  filled in by hand.
