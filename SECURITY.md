# Security

OwnSteps holds private photos and the places people have been. Security
problems are taken seriously – thank you for reporting them responsibly.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
*Security* tab of this repository → *Report a vulnerability*. Include what
an attacker can do, the steps to reproduce it, and the version (or commit)
you tested.

You'll get an answer as soon as possible, usually within a week. Once a fix
is released, the advisory is published, crediting you unless you prefer
otherwise.

## Supported versions

Fixes go into the newest release only. Keep your installation current –
`docker compose pull && docker compose up -d`.

The iOS app is supported in its newest App Store version.

## What counts

In scope, for example:

- Reaching a trip, step, photo or comment without being signed in and
  without the share link (or its password).
- Anything that makes an author's account or device token, a reader's token
  or the `APP_SECRET` reachable.
- Getting around the brakes against password guessing.
- Script injection into the web UI or the share page.
- Reading or writing files outside the data directory.

Known and accepted, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- **Every signed-in account may do everything** – there are no roles by
  design ([E2]).
- **Setup stays open until the first account exists.** Start a fresh
  instance and create the account right away, or set `ADMIN_EMAIL` and
  `ADMIN_PASSWORD`.
- **Whoever has a share link can read the trip and comment** – that's what
  the link is for. A new link or a new password shuts everyone out again.
- **View counts can be inflated** by someone with the link who clears
  cookies ([E17]); they only fool the authors about their own audience.

## Running it safely

- Serve it over HTTPS behind a reverse proxy, and set `PUBLIC_URL`.
- Set `TRUSTED_PROXIES` to the number of proxies in front of it – otherwise
  the brakes count the wrong addresses (see `.env.example`).
- Leave `APP_SECRET` empty (one is generated) or use at least 32 random
  characters; the server refuses weaker ones.
- Back up the `data/` folder – it holds the database, the photos and the
  generated secret.
