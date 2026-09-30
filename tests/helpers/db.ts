import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Empties all tables but keeps the schema, so every test starts clean. */
export function resetDatabase() {
  for (const table of ["comments", "photos", "steps", "sessions", "trips", "users"]) {
    db.run(sql.raw(`DELETE FROM ${table}`));
  }
}
