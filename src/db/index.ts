import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// The path is only known at runtime; without the hint Turbopack would try to
// trace the whole project directory into the bundle.
export const DATA_DIR = path.resolve(
  /* turbopackIgnore: true */ process.env.DATA_DIR ?? "./data",
);
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/**
 * Schema migrations. Append only, never change existing entries – on startup
 * everything not yet listed in `_migrations` is executed.
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
  {
    name: "0004_api",
    sql: `
      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        last_used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens(user_id);

      CREATE TABLE IF NOT EXISTS viewer_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        device_name TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        last_seen_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS viewer_devices_trip_idx ON viewer_devices(trip_id);

      CREATE TABLE IF NOT EXISTS auth_codes (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_challenge TEXT NOT NULL,
        device_name TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      ALTER TABLE steps ADD COLUMN client_uuid TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS steps_client_uuid_idx ON steps(client_uuid);
      ALTER TABLE photos ADD COLUMN client_uuid TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS photos_client_uuid_idx ON photos(client_uuid);

      CREATE TABLE IF NOT EXISTS changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        op TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE INDEX IF NOT EXISTS changes_trip_idx ON changes(trip_id, seq);
    `,
  },
  {
    name: "0005_step_views",
    sql: `
      CREATE TABLE IF NOT EXISTS step_views (
        step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
        viewer TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        PRIMARY KEY (step_id, viewer)
      );
    `,
  },
];

function isBusyError(error: unknown) {
  return /SQLITE_BUSY|database is locked/i.test(String(error));
}

/** Wait synchronously – better-sqlite3 is synchronous, an await won't help here. */
function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * On startup several processes may access the same file at once – Next
 * starts multiple workers for the build, and when a container restarts the
 * old and new one overlap. Locked accesses are therefore retried instead of
 * failing right away.
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
  // First thing: even switching to WAL briefly needs an exclusive lock.
  sqlite.pragma("busy_timeout = 15000");
  // The journal mode is stored in the file and then applies to all
  // connections. SQLite fails the switch while another connection is active –
  // busy_timeout explicitly does not apply here.
  try {
    retryWhileBusy(() => sqlite.pragma("journal_mode = WAL"), 6);
  } catch (error) {
    if (!isBusyError(error)) throw error;
    // Another process was faster; its WAL mode is already in effect.
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

  // Migrating runs in an immediately write-locking transaction, and the check
  // happens inside it – otherwise two processes see the same migration as
  // pending and both record it.
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
      console.log(`[db] Migration applied: ${migration.name}`);
    }
  });
  retryWhileBusy(() => migrate.immediate());

  return drizzle(sqlite, { schema });
}

// In dev mode the module is re-evaluated on every hot reload – without a
// singleton a new SQLite handle would be opened each time.
const globalForDb = globalThis as unknown as {
  __ownstepsDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__ownstepsDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__ownstepsDb = db;

export { schema };
