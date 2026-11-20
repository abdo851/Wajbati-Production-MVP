import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Production keeps cacheComponents for route `instant` segments.
  // Dev disables it to avoid a Turbopack Fast-Refresh full-reload loop.
  ...(process.env.NODE_ENV === "production"
    ? { cacheComponents: true, partialPrefetching: true }
    : {}),
  // Cursor/browser often opens http://127.0.0.1 while `next dev` advertises
  // localhost — blocked HMR then falls back to full page reloads in a loop.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
