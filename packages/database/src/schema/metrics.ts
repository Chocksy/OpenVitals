import {
  pgTable,
  varchar,
  text,
  real,
  integer,
  jsonb,
  serial,
  unique,
  index,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ── Metric Definitions ─────────────────────────────────────────────────────────

export const metricDefinitions = pgTable("metric_definitions", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  loincCode: varchar("loinc_code", { length: 20 }),
  snomedCode: varchar("snomed_code", { length: 20 }),
  aliases: jsonb("aliases"),
  referenceRangeLow: real("reference_range_low"),
  referenceRangeHigh: real("reference_range_high"),
  referenceRangeText: text("reference_range_text"),
  description: text("description"),
  displayPrecision: integer("display_precision"),
  sortOrder: integer("sort_order").default(0),
});

// ── Reference Ranges ──────────────────────────────────────────────────────────

export const referenceRanges = pgTable(
  "reference_ranges",
  {
    id: serial("id").primaryKey(),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    sex: varchar("sex", { length: 10 }),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    rangeLow: real("range_low"),
    rangeHigh: real("range_high"),
    rangeText: text("range_text"),
    source: varchar("source", { length: 100 }),
  },
  (table) => [
    unique("reference_ranges_metric_sex_age_uniq").on(
      table.metricCode,
      table.sex,
      table.ageMin,
      table.ageMax,
    ),
    index("reference_ranges_metric_code_idx").on(table.metricCode),
  ],
);

// ── Optimal Ranges ───────────────────────────────────────────────────────────

export const optimalRanges = pgTable(
  "optimal_ranges",
  {
    id: serial("id").primaryKey(),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    sex: varchar("sex", { length: 10 }),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    rangeLow: real("range_low"),
    rangeHigh: real("range_high"),
    rangeText: text("range_text"),
    source: varchar("source", { length: 255 }),
    sourceUrl: text("source_url"),
  },
  (table) => [
    unique("optimal_ranges_metric_sex_age_uniq").on(
      table.metricCode,
      table.sex,
      table.ageMin,
      table.ageMax,
    ),
    index("optimal_ranges_metric_code_idx").on(table.metricCode),
  ],
);

// ── User Optimal Range Overrides ─────────────────────────────────────────────

export const userOptimalRanges = pgTable(
  "user_optimal_ranges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    rangeLow: real("range_low"),
    rangeHigh: real("range_high"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("user_optimal_ranges_user_metric_uniq").on(
      table.userId,
      table.metricCode,
    ),
  ],
);

// ── Unit Conversions ───────────────────────────────────────────────────────────

export const unitConversions = pgTable(
  "unit_conversions",
  {
    id: serial("id").primaryKey(),
    fromUnit: varchar("from_unit", { length: 50 }).notNull(),
    toUnit: varchar("to_unit", { length: 50 }).notNull(),
    metricCode: varchar("metric_code", { length: 50 }).references(
      () => metricDefinitions.id,
    ),
    multiplier: real("multiplier").notNull(),
    offset: real("offset").notNull().default(0),
  },
  (table) => [
    unique("unit_conversions_from_to_metric_uniq").on(
      table.fromUnit,
      table.toUnit,
      table.metricCode,
    ),
  ],
);
