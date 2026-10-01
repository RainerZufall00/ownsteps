/**
 * Writes the API description to the iOS package, where
 * swift-openapi-generator builds the app's client from it:
 *
 *   npm run openapi:export
 *
 * Loads the TypeScript source through Vite with the test config, so the
 * `@/` alias and the `server-only` stub work as in the tests. A test fails
 * when the committed file and the server drift apart.
 */
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

const OUT = "ios/Packages/OwnStepsKit/Sources/OwnStepsAPI/openapi.json";

const server = await createServer({
  configFile: "vitest.config.mts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});
try {
  const { buildOpenApiDocument } = await server.ssrLoadModule("/src/lib/api/openapi.ts");
  writeFileSync(OUT, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
  console.log(`Wrote ${OUT}`);
} finally {
  await server.close();
}
