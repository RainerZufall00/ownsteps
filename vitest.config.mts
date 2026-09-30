import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "src")}/` },
      // The marker package throws outside the "react-server" condition; the
      // tests exercise server code directly, so it's a no-op here.
      {
        find: /^server-only$/,
        replacement: path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Every test file gets its own process and with it its own database.
    pool: "forks",
  },
});
