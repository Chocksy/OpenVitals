import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

const g = globalThis as unknown as { __simplePool?: Pool };

export function pool() {
  g.__simplePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  return g.__simplePool;
}

export function getDb() {
  return drizzle(pool(), { schema: { ...schema, ...authSchema } });
}

export * from "./schema";
