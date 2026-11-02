# Self-hosting OwnSteps

Everything about running your own server. For using the app, see the
[user guide](USER-GUIDE.md); every setting is also listed in
[`.env.example`](../.env.example).

## Install

OwnSteps runs as a ready-made Docker image; all you need is Docker with the
compose plugin. Fetch the compose file and the configuration template into
a folder of their own:

```bash
mkdir ownsteps && cd ownsteps
curl -fsSLO https://raw.githubusercontent.com/RainerZufall00/ownsteps/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/RainerZufall00/ownsteps/main/.env.example
```

Edit `.env` – at least `PUBLIC_URL`. Then:

```bash
docker compose up -d
```

The image is published for amd64 and arm64 (e.g. a Raspberry Pi 4/5). The
app runs on port 2555. On the first visit, `/setup` walks you through
creating the first account (skipped if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are
set in `.env` or sign-in runs through OIDC).

When the iOS app is in the App Store, set `APP_STORE_ID` so shared trips
offer to open in the app.

## Map and place names

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
This matters even behind a firewall: Docker publishes ports past ufw. If the
proxy runs on another server, allow the port only from it in your provider's
firewall instead.

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

## API

The apps talk to `/api/v1`, a versioned REST API with bearer tokens. The
description is served at `/api/v1/openapi.json`; `/api/v1/info` tells clients
which sign-in methods and features the server offers. Signed-in app devices
show up under *Settings* and can be signed out there; readers who follow a
trip in the app are listed in the trip's settings. Details in
[ARCHITECTURE.md](ARCHITECTURE.md), section 5.

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

## Known quirks

- **HEIC from iPhones:** Safari usually converts photos to JPEG on upload. If
  that doesn't happen, set *Settings → Camera → Formats* to "Most Compatible"
  on the iPhone. The iOS app converts by itself.
- **Place names come from OpenStreetMap or MapTiler:** coordinates from your
  photos are sent to one of them to name the place, unless `GEOCODING=off`.
