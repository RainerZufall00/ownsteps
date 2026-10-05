/**
 * Runs once when the server starts – before the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // A weak secret makes share unlocks forgeable – better not to start at all.
  const { exitOnWeakAppSecret } = await import("./lib/env");
  exitOnWeakAppSecret();

  const { seedAdminFromEnv } = await import("./lib/auth");
  const { cleanupStaleDrafts } = await import("./lib/trips");
  const { cleanupOrphanedCovers } = await import("./lib/photos");

  try {
    await seedAdminFromEnv();
    await cleanupStaleDrafts();
    await cleanupOrphanedCovers();
  } catch (error) {
    console.error("[start] Initialization failed", error);
  }

  // A server runs for months; drafts left in the editor shouldn't wait for
  // the next restart to go.
  setInterval(() => {
    cleanupStaleDrafts().catch((error) => console.error("[cleanup] Drafts failed", error));
  }, 24 * 60 * 60 * 1000).unref();
}
