import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The tests import app modules that use the `@/` alias Next resolves from
// tsconfig paths. Vitest needs to be told about it separately.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.dirname(fileURLToPath(import.meta.url)),
    },
  },
});
