import { defineConfig } from "drizzle-kit";

for (const f of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* optional */
  }
}

// Only db/schema.ts is listed: db/auth-schema.ts holds pre-existing better-auth
// tables that drizzle-kit must never create, drop or alter.
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Own migration ledger: `drizzle.__drizzle_migrations` belongs to the old app
  // and its newer timestamps would make drizzle-kit skip this app's migrations.
  migrations: { table: "__drizzle_migrations", schema: "simple" },
});
