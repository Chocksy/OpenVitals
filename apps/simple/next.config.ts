import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  // Monorepo root, otherwise Next guesses wrong and misses hoisted deps.
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  ),
  turbopack: {
    root: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  },
  serverExternalPackages: ["pdfjs-dist", "pg"],
};

export default nextConfig;
