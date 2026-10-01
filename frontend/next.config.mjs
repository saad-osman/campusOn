const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build run alongside `next dev` (e.g. NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
};

export default nextConfig;
