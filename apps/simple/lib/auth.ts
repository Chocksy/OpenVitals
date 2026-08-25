import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users, sessions, accounts, verifications } from "@/db/auth-schema";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  baseURL,
  trustedOrigins: [baseURL],
  emailAndPassword: { enabled: true },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
});

export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

/** The single admin, by email, or null when ADMIN_EMAIL is unset. */
export async function isAdmin(): Promise<boolean> {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return false;
  return (await currentUser())?.email === admin;
}

/** Server-component/route guard: returns the user id or bounces to /login. */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect("/login");
  return id;
}
