import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  // `next dev` and `next build` must never share an output folder: a build that
  // rewrites .next under a running dev server deletes the chunks it is serving
  // ("Cannot find module './948.js'", surfaced as "Jest worker encountered 2 child
  // process exceptions"). Dev writes to .next-dev; build/start use .next.
  // NEXT_DIST_DIR still overrides both.
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
  // The browser talks only to this origin; Next proxies API calls to FastAPI.
  // Keeping the session cookie first-party avoids cross-port cookie quirks
  // (browser tracking protection, SameSite edge cases) that can break login.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/feed.xml", destination: `${BACKEND_URL}/feed.xml` },
    ];
  },
  experimental: {
    // AI drafting and Semantic Scholar lookups can take longer than the 30 s default.
    proxyTimeout: 120_000,
  },
});

export default nextConfig;
