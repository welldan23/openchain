import path from "node:path";
import type { NextConfig } from "next";

/**
 * Alamat API backend dari sisi server Next.js. Permintaan browser ke `/api/*`
 * diteruskan ke sini (cookie sesi ikut), jadi browser selalu bicara ke satu
 * origin. Di produksi, reverse proxy di depan (Caddy) juga meneruskan `/api`
 * langsung ke backend.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Server mandiri untuk image Docker; akar monorepo dipakai untuk menelusuri dependency.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
};

export default nextConfig;
