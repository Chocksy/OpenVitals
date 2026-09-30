/**
 * Pre-existing better-auth tables, mirrored EXACTLY from
 * packages/database/src/schema/users.ts. Two columns of this app's own:
 * `users.setup` (phase 43A) and `users.checkin` (phase 44B), added by the
 * hand-written migrations `drizzle/0031_users_setup.sql` and
 * `drizzle/0032_users_checkin.sql`.
 *
 * This file is deliberately NOT referenced by drizzle.config.ts so drizzle-kit
 * never emits CREATE/ALTER/DROP for these tables. It is imported only by the
 * better-auth adapter and by db/schema.ts for foreign-key targets.
 */
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import type { CheckinState } from "@/lib/checkin";
import type { SetupState } from "@/lib/setup";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  preferredUnits: varchar("preferred_units", { length: 20 }).default("metric"),
  aiModel: varchar("ai_model", { length: 100 }).default("claude-sonnet-4"),
  dateOfBirth: date("date_of_birth"),
  biologicalSex: varchar("biological_sex", { length: 10 }),
  bloodType: varchar("blood_type", { length: 5 }),
  showOptimalRanges: boolean("show_optimal_ranges").default(true),
  onboardingStep: integer("onboarding_step").default(0).notNull(),
  /** Phase 43A: where the setup flow stands; null until it is first posted. */
  setup: jsonb("setup").$type<SetupState | null>(),
  /** Phase 44B: where the check-in stands; null until it is first read. */
  checkin: jsonb("checkin").$type<CheckinState | null>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
