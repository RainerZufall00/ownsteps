import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // For the Docker build: produces .next/standalone with minimal node_modules.
  output: "standalone",
  // Native modules must not be bundled.
  serverExternalPackages: ["better-sqlite3", "sharp", "exifr"],
  experimental: {
    // Server Actions only carry form text here. Everything large – photos and
    // videos – goes through /api/upload, which deliberately bypasses the
    // proxy (see src/proxy.ts): as soon as the proxy touches a request, Next
    // buffers its body and caps it at 10 MB.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
