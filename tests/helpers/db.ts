import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Empties all tables but keeps the schema, so every test starts clean. */
export function resetDatabase() {
  for (const table of [
    "immich_albums",
    "step_views",
    "changes",
    "auth_codes",
    "viewer_devices",
    "api_tokens",
    "comments",
    "photos",
    "steps",
    "sessions",
    "trips",
    "users",
  ]) {
    db.run(sql.raw(`DELETE FROM ${table}`));
  }
}
