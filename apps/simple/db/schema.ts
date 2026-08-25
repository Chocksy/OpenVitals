import {
  pgTable,
  text,
  uuid,
  real,
  integer,
  jsonb,
  date,
  timestamp,
  index,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./auth-schema";

export const metrics = pgTable("metrics", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit"),
  aliases: jsonb("aliases").$type<string[]>(),
  optimalLow: real("optimal_low"),
  optimalHigh: real("optimal_high"),
  sortOrder: integer("sort_order").default(0),
  /** Where the optimal range came from: "Attia/Outlive", "AHA", ... */
  optimalSource: text("optimal_source"),
  /** The curator asked about this metric and was told to stop asking. */
  needsReview: boolean("needs_review").default(false).notNull(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name"),
  status: text("status").default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const readings = pgTable(
  "readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id").references(() => uploads.id, {
      onDelete: "cascade",
    }),
    metricCode: text("metric_code")
      .notNull()
      .references(() => metrics.code),
    value: real("value"),
    valueText: text("value_text"),
    unit: text("unit"),
    refLow: real("ref_low"),
    refHigh: real("ref_high"),
    observedAt: date("observed_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    /** Curator breadcrumbs: tag strings plus, after a conversion, the original. */
    flags: jsonb("flags").$type<ReadingFlag[]>(),
  },
  (t) => [
    index("readings_user_metric_observed_idx").on(
      t.userId,
      t.metricCode,
      t.observedAt,
    ),
  ],
);

// ponytail: named `simple_insights`, not `insights`. A pre-existing `insights`
// table with an incompatible shape (type/content NOT NULL) already lives in this
// database and the brief forbids ALTER/DROP on pre-existing tables.
export const insights = pgTable("simple_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: jsonb("body").$type<InsightBody>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const checkins = pgTable("checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  insightId: uuid("insight_id")
    .notNull()
    .references(() => insights.id, { onDelete: "cascade" }),
  itemIndex: integer("item_index"),
  answer: text("answer"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** One open question for the user about their own data. */
export const reviewItems = pgTable("review_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  subject: jsonb("subject").$type<ReviewSubject>().notNull(),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  answer: text("answer"),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const curatorRuns = pgTable("curator_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  stats: jsonb("stats").$type<CuratorStats>(),
  error: text("error"),
});

/* ------------------------------------------------------------------ *
 * The self-improvement loop: one row a day, the protocol, and goals.
 * ------------------------------------------------------------------ */

/** One row per user per day. Everything is optional; the day is the key. */
export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    sleepHours: real("sleep_hours"),
    weightKg: real("weight_kg"),
    steps: integer("steps"),
    exerciseMin: integer("exercise_min"),
    alcoholUnits: real("alcohol_units"),
    energy: integer("energy"),
    mood: integer("mood"),
    fastingHours: real("fasting_hours"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("daily_logs_user_day_key").on(t.userId, t.day)],
);

/** A thing the user has decided to do, usually adopted from a lifestyle plan. */
export const protocolItems = pgTable("protocol_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  why: text("why"),
  metricCodes: jsonb("metric_codes").$type<string[]>(),
  sourceInsightId: uuid("source_insight_id").references(() => insights.id, {
    onDelete: "set null",
  }),
  cadence: text("cadence").default("daily").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const habitLogs = pgTable(
  "habit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => protocolItems.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    done: boolean("done").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("habit_logs_item_day_key").on(t.itemId, t.day)],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricCode: text("metric_code")
      .notNull()
      .references(() => metrics.code),
    targetLow: real("target_low"),
    targetHigh: real("target_high"),
    due: date("due"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
  },
  (t) => [unique("goals_user_metric_key").on(t.userId, t.metricCode)],
);

/** A plain tag, or the pre-conversion value kept for the audit trail. */
export type ReadingFlag =
  | string
  | { orig: { value: number | null; unit: string | null } };

export interface ReviewSubject {
  /** Dedupe handle: one question per (kind, key). */
  key: string;
  readingId?: string;
  metricCode?: string;
  targetCode?: string;
  fromUnit?: string | null;
  toUnit?: string | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  source?: string | null;
  /** foreign_reading: enough of the row to describe it after it is gone. */
  value?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  observedAt?: string;
  detail?: string;
}

export type CuratorStats = Record<
  string,
  { checked: number; fixed: number; queued: number }
>;

export type LifestyleBody = {
  items: { text: string; why: string; metricCodes: string[] }[];
};
export type RetestGroup = {
  domain: string;
  priority: "high" | "medium" | "low";
  reason: string;
  rationale?: string;
  metrics: string[];
};
export type RetestBody = {
  summary: string;
  dueAt: string;
  groups: RetestGroup[];
  optional?: { reason: string; metrics: string[] };
  newSuggestions?: { name: string; code: string; reason: string }[];
};
/** `kind = 'weekly'`. No schema change, just a third shape for `body`. */
export type WeeklyBody = {
  summary: string;
  wins: string[];
  concerns: string[];
  nextWeek: string[];
  adherencePct: number;
  metricNotes: { code: string; note: string }[];
};
export type InsightBody = LifestyleBody | RetestBody | WeeklyBody;
export type Metric = typeof metrics.$inferSelect;
export type Reading = typeof readings.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type ProtocolItem = typeof protocolItems.$inferSelect;
export type Goal = typeof goals.$inferSelect;
