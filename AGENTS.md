<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OwnSteps

Selbst gehostetes Reisetagebuch (Polarsteps-Ersatz). Ein Container, SQLite,
Fotos auf der Platte. Zwei Autoren, die gemeinsam an denselben Reisen
schreiben. Sprache im Code, in Kommentaren und in der Oberfläche: **Deutsch.**

> **Vor größeren Änderungen `docs/ARCHITEKTUR.md` lesen.** Dort stehen das
> Datenmodell, die Abläufe und vor allem die Begründungen zu allen
> Entscheidungen – inklusive dem, was bewusst *nicht* gebaut wurde.

## Aufbau

- `src/db/` – Drizzle-Schema und SQLite-Verbindung. Migrationen sind das Array
  `MIGRATIONS` in `src/db/index.ts`.
- `src/lib/` – Serverlogik (`server-only`): Auth, OIDC, Bildverarbeitung,
  Zugriff auf Reisen. `view-types.ts`, `format.ts` und `limits.ts` sind die
  Grenze zum Client und bewusst frei von `server-only`.
- `src/components/TripView.tsx` – Timeline plus Karte, wird sowohl von der
  angemeldeten Ansicht als auch vom öffentlichen Share-Link benutzt.
- `src/app/(app)/` – alles hinter dem Login, `src/app/s/[token]/` der
  Share-Link, `src/app/api/` die Route Handler.

## Harte Regeln

- **Seiten, die den Anmeldestand lesen, brauchen `dynamic = "force-dynamic"`.**
  Sonst rendert der Build sie vor und backt den Zustand der Bau-Datenbank ein
  (war bei `/setup` so und machte die Ersteinrichtung unmöglich). In der
  Build-Ausgabe muss vor der Route ein `ƒ` stehen, kein `○`.
- **Route Handler müssen selbst prüfen.** Über `src/app/api/` liegt kein
  Layout, das die Anmeldung kontrolliert – dort gehört `getCurrentUser()`
  bzw. `resolveTripAccess()` explizit hinein.
- **Fotos nie über `/public` ausliefern.** Sie liegen in `DATA_DIR/uploads` und
  laufen über `/api/photos/[id]/[variant]`, das den Zugriff prüft.
- **Beim Löschen die Dateien mitnehmen.** `ON DELETE CASCADE` räumt nur
  Datenbankzeilen ab, nicht die Ordner unter `uploads/`.
- **`MIGRATIONS` nur anhängen**, nie einen bestehenden Eintrag ändern – bei
  laufenden Installationen ist er längst abgehakt. Schemaänderung in
  `schema.ts` heißt immer auch: neuer Migrationseintrag.
- **maplibre-gl auf v5 halten.** In v6 zeigt der Worker-Pfad nach dem Bündeln
  ins Leere; die Karte bleibt dann ohne Fehlermeldung stehen.
- **Der MapTiler-Key bleibt auf dem Server.** Kartenabrufe gehen über
  `/api/map/[...path]`, siehe `src/lib/maptiler-rewrite.ts`.
- **`src/proxy.ts` darf `/api/upload` nicht anfassen.** Sobald der Proxy eine
  Anfrage sieht, puffert Next deren Rumpf und kappt ihn bei 10 MB – jeder
  Video-Upload stirbt dann an `Failed to parse body as FormData`. Wer einen
  weiteren Weg für große Uploads baut, nimmt ihn ebenfalls aus dem `matcher`.
- **Die Timeline zeigt neueste zuerst, die Daten bleiben chronologisch.**
  `getSteps()` sortiert aufsteigend; nur `TripView` dreht die Liste beim
  Rendern. Global umzudrehen zerlegt Tageszählung, Zeitraum und Routenlinie
  (siehe [E13]).
- **Keine Rechteverwaltung einführen.** Dass jeder angemeldete Account alles
  darf, ist so gewollt (siehe [E2] in der Architekturdoku).

## Was nie im Browser geprüft wurde

Kartenkacheln, das Docker-Image und der OIDC-Fluss gegen eine echte Instanz –
Einzelheiten in Abschnitt 13 von `docs/ARCHITEKTUR.md`. Wer daran arbeitet,
sollte das Ergebnis wirklich ansehen und nicht auf den Build vertrauen.
