# Contributing

Thanks for wanting to help with OwnSteps! Bug reports, ideas and pull
requests are all welcome.

## Before you start

- **Bugs:** open an issue with what you did, what you expected and what
  happened – plus the version and, for the web UI, the browser.
- **Security problems** go through [SECURITY.md](SECURITY.md), not an issue.
- **Larger changes:** open an issue first and describe the idea. OwnSteps
  deliberately leaves things out (permissions, multiple tenants, a central
  push service …); [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains why,
  and [docs/ROADMAP.md](docs/ROADMAP.md) shows what's planned.

## Server and web

You need Node.js 22.

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:2555
npm test           # Vitest against a throwaway SQLite database
npm run build      # what the Docker image runs
```

The ground rules are in [AGENTS.md](AGENTS.md) – written for coding agents,
but they apply to everyone. The ones that trip people up most:

- **Migrations are append-only.** A change in `src/db/schema.ts` always means
  a new entry at the end of `MIGRATIONS` in `src/db/index.ts`; never edit an
  existing one.
- **Writes to trips, steps, photos and comments go through the data-access
  functions**, so the app's change feed sees them.
- **Route handlers check access themselves** – nothing above `src/app/api/`
  does it for them. New `/api/v1` routes also go into
  `src/lib/api/openapi.ts`; afterwards run `npm run openapi:export` so the iOS
  client is generated from the same description (a test checks both).
- **No text inline in components.** Every visible string goes into both
  `src/lib/i18n/en.ts` and `de.ts`.
- **Limits live in `src/lib/limits.ts`** and nowhere else.

## iOS app

See [ios/README.md](ios/README.md) for building. You need Xcode 26. Logic
that can be tested belongs in the `OwnStepsKit` package
(`cd ios/Packages/OwnStepsKit && swift test`); new strings go into the String
Catalogs with an English and a German entry.

## Pull requests

- One topic per pull request, with tests for what changed where it's
  testable.
- `npm test` and `npm run build` pass; for the app, it builds and the package
  tests pass.
- Code, comments, docs and commit messages in English. Commit messages say
  what changed in the imperative ("Count step views for authors").
- If a change alters a decision documented in `docs/ARCHITECTURE.md`, update
  it there – the reasoning matters as much as the code.
- User-visible changes get a line in [CHANGELOG.md](CHANGELOG.md) under
  *Unreleased*.

## License

The server and web UI are licensed under the
[GNU AGPL v3](LICENSE), the iOS app (everything under `ios/`) under the
[Mozilla Public License 2.0](ios/LICENSE). By contributing you agree that
your contribution is licensed under the license of the part it changes.
There's no contributor license agreement.
