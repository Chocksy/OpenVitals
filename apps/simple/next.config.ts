import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Phase 30: twenty-four routes fold into five destinations. Every old URL
 * keeps working as a permanent redirect, so a bookmark, an iOS deep link or
 * a link inside an old AI answer still lands on the page that now owns the
 * content. The site map is `docs/plans/2026-09-02-phase29-design-system-spec.md`.
 */
const folded = [
  // Body
  ["/today", "/body?tab=today"],
  ["/feel", "/body?tab=feel"],
  ["/trends", "/body?tab=trends"],
  ["/history", "/body?tab=history"],
  // Blood
  ["/labs", "/blood?tab=draws"],
  ["/labs/phone", "/blood?tab=phone"],
  ["/biomarkers", "/blood?tab=markers"],
  ["/uploads", "/blood?tab=uploads"],
  ["/uploads/:id", "/blood/uploads/:id"],
  ["/m/:code", "/blood/m/:code"],
  // Plan: /protocol, /goals, /insights, /review and /patterns/:id redirect
  // once slice 30d gives /plan their tabs; until then the old pages stay live.
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  ),
  turbopack: {
    root: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  },
  serverExternalPackages: ["pdfjs-dist", "pg"],
  redirects: async () =>
    folded.map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    })),
};

export default nextConfig;
