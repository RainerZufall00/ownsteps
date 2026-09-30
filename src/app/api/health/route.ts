import { sql } from "drizzle-orm";
import { db } from "@/db";

/** For the healthcheck in Docker Compose. */
export async function GET() {
  try {
    await db.get(sql`SELECT 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
