<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OwnSteps

Self-hosted travel journal (a Polarsteps replacement). One container, SQLite,
photos on disk. Several authors writing together on the same trips. Language
of code, comments, docs and commits: **English.** The user interface is still
German for now; English and German UI translations follow before the release
(see `docs/ROADMAP.md`).

> **Read `docs/ARCHITECTURE.md` before larger changes.** It covers the data
> model, the flows and above all the reasoning behind every decision –
> including what was deliberately *not* built. `docs/ROADMAP.md` holds the
> agreed plan for the API, the iOS app and the open source release.

## Layout

- `src/db/` – Drizzle schema and SQLite connection. Migrations are the
  `MIGRATIONS` array in `src/db/index.ts`.
- `src/lib/` – server logic (`server-only`): auth, OIDC, image processing,
  trip access. `view-types.ts`, `format.ts` and `limits.ts` are the boundary
  to the client and deliberately free of `server-only`.
- `src/components/TripView.tsx` – timeline plus map, used by both the
  signed-in view and the public share link.
- `src/app/(app)/` – everything behind sign-in, `src/app/s/[token]/` the share
  link, `src/app/api/` the route handlers.

## Hard rules

- **Pages that read the sign-in state need `dynamic = "force-dynamic"`.**
  Otherwise the build prerenders them and bakes in the state of the build
  database (that happened with `/setup` and made initial setup impossible).
  In the build output the route must be marked `ƒ`, not `○`.
- **Route handlers must check for themselves.** No layout sits above
  `src/app/api/` that checks sign-in – `getCurrentUser()` or
  `resolveTripAccess()` belongs in there explicitly. Under `/api/v1` that's
  `requireAuthor()` / `requireReadableTrip()` from `src/lib/api/principal.ts`,
  and every new route must also appear in `src/lib/api/openapi.ts` (a test
  checks both).
- **Writes to trips, steps, photos and comments go through the data-access
  functions**, which append to the change log. A write that bypasses them is
  invisible to the app's change feed.
- **Never serve photos via `/public`.** They live in `DATA_DIR/uploads` and go
  through `/api/photos/[id]/[variant]`, which checks access.
- **Take the files along when deleting.** `ON DELETE CASCADE` only removes
  database rows, not the folders under `uploads/`.
- **Only append to `MIGRATIONS`**, never change an existing entry – running
  installations have long since checked it off. A schema change in
  `schema.ts` always means a new migration entry too.
- **Keep maplibre-gl on v5.** In v6 the worker path points nowhere after
  bundling; the map then hangs without an error message.
- **The MapTiler key stays on the server.** Map requests go through
  `/api/map/[...path]`, see `src/lib/maptiler-rewrite.ts`.
- **`src/proxy.ts` must not touch `/api/upload`.** As soon as the proxy sees a
  request, Next buffers its body and caps it at 10 MB – every video upload
  then dies with `Failed to parse body as FormData`. Anyone building another
  path for large uploads must exclude it from the `matcher` as well.
- **The timeline shows newest first, the data stays chronological.**
  `getSteps()` sorts ascending; only `TripView` reverses the list when
  rendering. Reversing globally breaks day counting, date range and route
  line (see [E13]).
- **Don't introduce permission management.** That every signed-in account may
  do everything is intended (see [E2] in the architecture doc).

## Never checked in a browser

Map tiles, the Docker image and the OIDC flow against a real instance –
details in section 13 of `docs/ARCHITECTURE.md`. Whoever works on these
should actually look at the result and not trust the build.
