import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für den Docker-Build: erzeugt .next/standalone mit minimalem node_modules.
  output: "standalone",
  // Native Module dürfen nicht gebündelt werden.
  serverExternalPackages: ["better-sqlite3", "sharp", "exifr"],
  experimental: {
    // Server Actions übertragen hier nur Formulartexte. Alles Große – Fotos
    // und Videos – läuft über /api/upload, das bewusst am Proxy vorbeigeht
    // (siehe src/proxy.ts): Sobald der Proxy eine Anfrage anfasst, puffert
    // Next deren Rumpf und kappt ihn bei 10 MB.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
