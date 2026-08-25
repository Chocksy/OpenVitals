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
export type InsightBody = LifestyleBody | RetestBody;
export type Metric = typeof metrics.$inferSelect;
export type Reading = typeof readings.$inferSelect;
export type Insight = typeof insights.$inferSelect;
