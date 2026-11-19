import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Production keeps cacheComponents for route `instant` segments.
  // Dev disables it to avoid a Turbopack Fast-Refresh full-reload loop.
  ...(process.env.NODE_ENV === "production"
    ? { cacheComponents: true, partialPrefetching: true }
    : {}),
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
