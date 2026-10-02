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

  try {
    await seedAdminFromEnv();
    await cleanupStaleDrafts();
  } catch (error) {
    console.error("[start] Initialization failed", error);
  }
}
