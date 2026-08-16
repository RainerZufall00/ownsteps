import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Der Pfad steht erst zur Laufzeit fest; ohne den Hinweis würde Turbopack
// versuchen, das ganze Projektverzeichnis mit ins Bundle zu spuren.
export const DATA_DIR = path.resolve(
  /* turbopackIgnore: true */ process.env.DATA_DIR ?? "./data",
);
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/**
 * Schema-Migrationen. Nur anhängen, nie bestehende Einträge ändern –
 * beim Start wird alles ausgeführt, was noch nicht in `_migrations` steht.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        oidc_subject TEXT UNIQUE,
        avatar_url TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        summary TEXT,
        start_date TEXT,
        end_date TEXT,
        cover_photo_id INTEGER,
        share_token TEXT NOT NULL UNIQUE,
        share_enabled INTEGER NOT NULL DEFAULT 0,
        share_password_hash TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        lat REAL,
        lon REAL,
        place_name TEXT,
        country_code TEXT,
        occurred_at INTEGER NOT NULL,
        published INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS steps_trip_idx ON steps(trip_id, occurred_at);

      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        step_id INTEGER REFERENCES steps(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL,
        original_name TEXT,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        taken_at INTEGER,
        lat REAL,
        lon REAL,
        placeholder TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS photos_step_idx ON photos(step_id, sort_order);
      CREATE INDEX IF NOT EXISTS photos_trip_idx ON photos(trip_id);
    `,
  },
  {
    name: "0002_captions_and_comments",
    sql: `
      ALTER TABLE photos ADD COLUMN caption TEXT;

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS comments_step_idx ON comments(step_id, created_at);
    `,
  },
  {
    name: "0003_videos",
    sql: `
      ALTER TABLE photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo';
      ALTER TABLE photos ADD COLUMN duration_ms INTEGER;
      ALTER TABLE photos ADD COLUMN video_mime TEXT;
    `,
  },
];

function isBusyError(error: unknown) {
  return /SQLITE_BUSY|database is locked/i.test(String(error));
}

/** Synchron warten – better-sqlite3 ist synchron, ein await hilft hier nicht. */
function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Beim Start können mehrere Prozesse gleichzeitig auf dieselbe Datei
 * zugreifen – Next startet für den Build mehrere Worker, und beim Neustart
 * eines Containers überlappen sich alt und neu. Gesperrte Zugriffe werden
 * deshalb wiederholt statt sofort aufzugeben.
 */
function retryWhileBusy<T>(fn: () => T, attempts = 12): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (error) {
      if (!isBusyError(error) || attempt >= attempts - 1) throw error;
      sleepSync(100 + attempt * 120);
    }
  }
}

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const sqlite = new Database(path.join(DATA_DIR, "ownsteps.db"));
  // Als Erstes: schon das Umschalten auf WAL braucht kurz eine exklusive Sperre.
  sqlite.pragma("busy_timeout = 15000");
  // Der Journal-Modus steht in der Datei und gilt danach für alle Verbindungen.
  // SQLite lässt den Wechsel scheitern, solange eine andere Verbindung aktiv
  // ist – der busy_timeout greift hier ausdrücklich nicht.
  try {
    retryWhileBusy(() => sqlite.pragma("journal_mode = WAL"), 6);
  } catch (error) {
    if (!isBusyError(error)) throw error;
    // Ein anderer Prozess war schneller; sein WAL-Modus gilt bereits.
  }
  sqlite.pragma("foreign_keys = ON");

  retryWhileBusy(() =>
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name TEXT PRIMARY KEY,
         applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
       )`,
    ),
  );

  // Die Migration läuft in einer sofort schreibsperrenden Transaktion, und der
  // Abgleich passiert darin – sonst sehen zwei Prozesse dieselbe Migration als
  // offen an und tragen sie beide ein.
  const migrate = sqlite.transaction(() => {
    const applied = new Set(
      sqlite
        .prepare("SELECT name FROM _migrations")
        .all()
        .map((row) => (row as { name: string }).name),
    );

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      sqlite.exec(migration.sql);
      sqlite
        .prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)")
        .run(migration.name);
      console.log(`[db] Migration angewendet: ${migration.name}`);
    }
  });
  retryWhileBusy(() => migrate.immediate());

  return drizzle(sqlite, { schema });
}

// Im Dev-Modus wird das Modul bei jedem Hot-Reload neu ausgewertet – ohne
// Singleton würde jedes Mal ein neuer SQLite-Handle geöffnet.
const globalForDb = globalThis as unknown as {
  __ownstepsDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__ownstepsDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__ownstepsDb = db;

export { schema };
