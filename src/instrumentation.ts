/**
 * Runs once when the server starts – before the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // A wrong setting – a weak secret, a half OIDC setup, a typo in a switch –
  // stops the server with a clear message before anything else runs.
  // Imported before anything that opens the database.
  const { checkConfigOrExit } = await import("./lib/config-check");
  checkConfigOrExit();

  const { seedAdminFromEnv } = await import("./lib/auth");
  const { cleanupStaleDrafts } = await import("./lib/trips");
  const { cleanupOrphanedCovers } = await import("./lib/photos");
  const { clearTmp } = await import("./lib/multipart");

  try {
    await seedAdminFromEnv();
    await cleanupStaleDrafts();
    await cleanupOrphanedCovers();
    // Uploads cut off by a restart; no request runs yet.
    await clearTmp();
  } catch (error) {
    console.error("[start] Initialization failed", error);
  }

  // A server runs for months; drafts left in the editor shouldn't wait for
  // the next restart to go.
  setInterval(() => {
    cleanupStaleDrafts().catch((error) => console.error("[cleanup] Drafts failed", error));
  }, 24 * 60 * 60 * 1000).unref();
}
