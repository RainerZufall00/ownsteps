import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für den Docker-Build: erzeugt .next/standalone mit minimalem node_modules.
  output: "standalone",
  // Native Module dürfen nicht gebündelt werden.
  serverExternalPackages: ["better-sqlite3", "sharp", "exifr"],
  experimental: {
    // Fotos werden in Originalgröße hochgeladen (Handy-Kameras: 5-15 MB).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
