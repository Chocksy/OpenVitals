/**
 * Pre-existing better-auth tables, mirrored EXACTLY from
 * packages/database/src/schema/users.ts. No new columns.
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
} from "drizzle-orm/pg-core";

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
