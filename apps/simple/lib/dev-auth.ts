/**
 * Screenshot harness, phase 40. NEVER in a production build.
 *
 * `next.config.ts` aliases `@/lib/auth` to this file only when
 * `OV_DEV_AS` is set and NODE_ENV is not "production" (so `next build` and
 * the Docker image never see it). It signs nobody in and writes nothing:
 * `currentUser()` reads the user row for the email in `OV_DEV_AS`, so a
 * headless browser with its own profile can render the owner's pages for
 * the phase-40 screenshots without a session row.
 *
 *   OV_DEV_AS=owner@example.com pnpm dev
 */
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/auth-schema";
import * as real from "./auth";

export const auth = real.auth;

export async function currentUser() {
  const email = process.env.OV_DEV_AS;
  if (!email || process.env.NODE_ENV === "production")
    return real.currentUser();
  const [u] = await getDb().select().from(users).where(eq(users.email, email));
  return u ?? null;
}

export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return false;
  return (await currentUser())?.email === admin;
}

export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect("/login");
  return id;
}
