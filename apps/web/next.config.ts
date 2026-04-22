import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  // Pin the workspace root so Turbopack doesn't mis-detect a stray lockfile
  // from a parent directory (which causes tailwindcss resolution to fail).
  turbopack: {
    root: path.join(thisDir, "..", ".."),
  },
  transpilePackages: [
    "@openvitals/common",
    "@openvitals/database",
    "@openvitals/blob-storage",
    "@openvitals/ai",
    "@openvitals/events",
    "@openvitals/sharing",
  ],
};

export default nextConfig;
