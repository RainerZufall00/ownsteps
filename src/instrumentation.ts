/**
 * Läuft einmal beim Start des Servers – vor dem ersten Request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { seedAdminFromEnv } = await import("./lib/auth");
  const { cleanupStaleDrafts } = await import("./lib/trips");

  try {
    await seedAdminFromEnv();
    await cleanupStaleDrafts();
  } catch (error) {
    console.error("[start] Initialisierung fehlgeschlagen", error);
  }
}
