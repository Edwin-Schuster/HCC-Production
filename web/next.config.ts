import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/** This computer's own IPv4 addresses, so a phone on the same Wi-Fi can use the dev server. */
const ownAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4")
    .map((a) => a!.address);

const nextConfig: NextConfig = {
  // The dev server only serves its scripts to localhost by default. Without this, opening it as 127.0.0.1, by the
  // Mac's name (*.local) or from a phone on the same Wi-Fi shows the page but no button works. Development only.
  allowedDevOrigins: ["127.0.0.1", "*.local", ...ownAddresses(), ...(process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])],
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "pg", "playwright", "playwright-core"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
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
