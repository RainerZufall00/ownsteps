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
  // For every response. The Content-Security-Policy is set per request in
  // src/proxy.ts, because it carries a fresh nonce for the scripts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Uploaded files are served with the type the uploader named – a
          // browser must not guess something else (e.g. HTML) from the bytes.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Share links carry their secret in the path: never hand it to
          // another site as referrer.
          { key: "Referrer-Policy", value: "same-origin" },
          // No framing (clickjacking on settings and delete buttons). The
          // CSP's frame-ancestors says the same for current browsers.
          { key: "X-Frame-Options", value: "DENY" },
          // Location only for the step editor's "use my location".
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Browsers only honor it over HTTPS, so plain-HTTP LAN setups stay
          // reachable. No includeSubDomains: other services may share the domain.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
