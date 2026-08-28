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
  primaryKey,
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

/**
 * One row per lab file, whether it came through `/api/upload` or the legacy
 * import (then `id` is the old `source_artifacts.id`, so re-imports are
 * idempotent).
 * `status`: pending | extracting | done | needs_review | failed | deleted.
 */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name"),
  status: text("status").default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  /** The text layer (or the OCR answer), kept so a re-analyze works without the PDF. */
  rawText: text("raw_text"),
  /** Where the PDF sits: a local path here, a `file:///data/blobs/...` URL for legacy rows. */
  blobPath: text("blob_path"),
  sha256: text("sha256"),
  pages: integer("pages"),
  /** Denormalised count, refreshed after every extraction. */
  readingsCount: integer("readings_count"),
  /** `upload` | `legacy`. */
  source: text("source").default("upload"),
  // ponytail: the spec wants deleted rows hidden after a day, which needs a
  // timestamp; `created_at` cannot say when the delete happened.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Upload = typeof uploads.$inferSelect;

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

/**
 * One answered thing about the person that no lab prints: sex, birth year,
 * family history, screening dates. One row per (user, key), overwritten on
 * every new answer.
 */
export const profileFacts = pgTable(
  "profile_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    source: text("source").default("user").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("profile_facts_user_key").on(t.userId, t.key)],
);

/**
 * One optimal band per (user, metric), decided by the app and always carrying
 * its provenance. It wins over `SEX_RANGES` and over the shared
 * `metrics.optimal*` columns, which stay as the catalog-wide fallback so two
 * users can never overwrite each other's band.
 */
export const optimalOverrides = pgTable(
  "optimal_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricCode: text("metric_code")
      .notNull()
      .references(() => metrics.code),
    low: real("low"),
    high: real("high"),
    unit: text("unit"),
    /** A named guideline, a named author, "user", or "lab range". */
    source: text("source"),
    /** `science` when a guideline or meta-analysis is cited, else `opinion`. */
    basis: text("basis"),
    rationale: text("rationale"),
    sex: text("sex"),
    ageBand: text("age_band"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("optimal_overrides_user_metric_key").on(t.userId, t.metricCode),
  ],
);

export type OptimalOverride = typeof optimalOverrides.$inferSelect;

/** One generated plan. Every version is kept. */
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),
  body: jsonb("body").$type<ReportBody>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type ActionKind =
  | "supplement"
  | "food"
  | "exercise"
  | "sleep"
  | "test"
  | "doctor"
  | "stop"
  | "habit";

export type Basis = "science" | "opinion" | "anecdotal";

export interface ReportAction {
  title: string;
  kind: ActionKind;
  weight: 1 | 2 | 3 | 4 | 5;
  basis: Basis;
  why: string;
  /** opinion: the exact values and facts used; empty otherwise. */
  reasoning: string;
  dose?: {
    amount: string;
    form?: string;
    schedule: string;
    duration?: string;
    ceiling?: string;
  };
  timing?: string;
  interactions?: { with: string; rule: string }[];
  targets: {
    code: string;
    direction: "up" | "down";
    expect: string;
    measureAfterWeeks: number;
  }[];
  evidence: {
    kind: "guideline" | "meta" | "rct" | "observational" | "anecdotal";
    title: string;
    source?: string;
  }[];
  followUp: { afterDays: number; ask: string }[];
  /** The back-and-forth about this one action: question, reply, when. */
  notes?: { q: string; a: string; at: string }[];
}

export interface ReportBody {
  /** 3 lines at most, plain. */
  summary: string[];
  /** Two sentences, one metaphor. */
  eli5: string;
  systems: {
    id: string;
    name: string;
    verdict: string;
    eli5: string;
    priority: 1 | 2 | 3;
  }[];
  actions: ReportAction[];
  questions: { key: string; text: string; why: string; options?: string[] }[];
  /** One entry per matched pattern, filled by the model. Inside the jsonb. */
  patterns?: { id: string; stage?: string; verdict: string }[];
}

export type Report = typeof reports.$inferSelect;
export type ProfileFact = typeof profileFacts.$inferSelect;

/** A plain tag, or the pre-fix state kept for the audit trail. */
export type ReadingFlag =
  | string
  | { orig: { value: number | null; unit: string | null } }
  /** ref_scale: the lab range was in another decimal scale than the value. */
  | { ref_rescaled: { factor: number; orig: [number | null, number | null] } }
  /** raw_verify: the row before the lab sheet corrected it, and the line. */
  | {
      raw_verified: {
        orig: {
          value: number | null;
          refLow: number | null;
          refHigh: number | null;
        };
        sheet: string;
      };
    }
  /** urine_text / split_measurand: where the reading came from. */
  | {
      moved: {
        from: string;
        refLow: number | null;
        refHigh: number | null;
      };
    };

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
  /** range_impact: the lab range the user can fall back to. */
  labLow?: number | null;
  labHigh?: number | null;
  /** confirm_value: the lab-sheet line the curator read, or null. */
  sheet?: string | null;
  /** foreign_reading: enough of the row to describe it after it is gone. */
  value?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  observedAt?: string;
  detail?: string;
  /** profile_question: which `profile_facts.key` the answer writes to. */
  factKey?: string;
  options?: string[];
  free?: boolean;
  /** check_in: which action of which report asked. */
  reportId?: string;
  actionIndex?: number;
  ask?: string;
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

/* ── the hypothesis knowledge base ─────────────────────────────────────
 *
 * The catalog `lib/hypotheses.ts` holds in code, as rows. `lib/hkb-seed.ts`
 * writes it, `lib/hkb.ts` reads it back into the same `Hypothesis[]` the
 * engine already consumes, so the engine itself never learns about the
 * database. Types are structural here on purpose: the db layer stays a leaf
 * and does not import the model.
 */

/** One story the engine can tell. Later: MONDO ids and their parents. */
export const hkbConditions = pgTable("hkb_conditions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  management: text("management").notNull(),
  parentId: text("parent_id"),
  /** The MONDO term this condition is, so an ontology import can join to it. */
  mondoId: text("mondo_id"),
  /** Why it is in the catalog at all: the burden source, in one line. */
  why: text("why"),
  /** Disability-adjusted life years, once GBD is imported (phase 11). */
  burdenDaly: real("burden_daly"),
  inCatalog: boolean("in_catalog").default(true).notNull(),
  lenses: jsonb("lenses").$type<Record<string, { w: number; grade: string }>>().notNull(),
  appliesTo: jsonb("applies_to").$type<{
    sex?: string;
    minAge?: number;
    maxAge?: number;
  }>(),
  requires: jsonb("requires").$type<{ condition: string; minState: number }>(),
  confirmAtLrPos: real("confirm_at_lr_pos"),
  patternId: text("pattern_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** Anything a rule can read: `metric:ferritin`, `derived:tgHdl`, `fact:sex`. */
export const hkbFeatures = pgTable("hkb_features", {
  id: text("id").primaryKey(),
  /** symptom | sign | lab | derived | fact | event | hypothesis */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  unit: text("unit"),
  howTo: text("how_to"),
});

/** The base rate. One row per (condition, country, sex, age band). */
export const hkbPriors = pgTable(
  "hkb_priors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conditionId: text("condition_id")
      .notNull()
      .references(() => hkbConditions.id, { onDelete: "cascade" }),
    country: text("country"),
    sex: text("sex"),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    prevalence: real("prevalence").notNull(),
    source: text("source").notNull(),
  },
  (t) => [
    // The seed's row is the all-null one, so the key has to treat NULLs as
    // equal or every run would insert it again.
    unique("hkb_priors_key")
      .on(t.conditionId, t.country, t.sex, t.ageMin, t.ageMax)
      .nullsNotDistinct(),
  ],
);

/** What multiplies the base rate before any evidence is read. */
export const hkbPriorModifiers = pgTable(
  "hkb_prior_modifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conditionId: text("condition_id")
      .notNull()
      .references(() => hkbConditions.id, { onDelete: "cascade" }),
    featureId: text("feature_id")
      .notNull()
      .references(() => hkbFeatures.id),
    conditionOn: jsonb("condition_on").$type<Record<string, unknown>>().notNull(),
    times: real("times").notNull(),
    why: text("why").notNull(),
    grade: text("grade"),
    source: text("source"),
  },
  (t) => [
    unique("hkb_prior_modifiers_key").on(
      t.conditionId,
      t.featureId,
      t.conditionOn,
    ),
  ],
);

/** One likelihood ratio: this condition, that feature, under this condition. */
export const hkbEvidence = pgTable(
  "hkb_evidence",
  {
    /** The rule id the engine and the page print, e.g. `ir_insulin`. */
    id: text("id").primaryKey(),
    conditionId: text("condition_id")
      .notNull()
      .references(() => hkbConditions.id, { onDelete: "cascade" }),
    featureId: text("feature_id")
      .notNull()
      .references(() => hkbFeatures.id),
    conditionOn: jsonb("condition_on").$type<Record<string, unknown>>().notNull(),
    lrPos: real("lr_pos").notNull(),
    lrNeg: real("lr_neg"),
    grade: text("grade").notNull(),
    source: text("source").notNull(),
    population: text("population"),
    confoundedBy: jsonb("confounded_by").$type<string[]>(),
    /** seed | proposed | accepted | rejected */
    status: text("status").default("accepted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("hkb_evidence_key").on(t.conditionId, t.featureId, t.conditionOn),
  ],
);

/** A test that could be ordered, with what it would say either way. */
export const hkbTests = pgTable("hkb_tests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Metric codes the test writes. */
  featureIds: jsonb("feature_ids").$type<string[]>().notNull(),
  /** 1 cheap blood, 2 special blood, 3 imaging/functional, 4 invasive. */
  cost: integer("cost").notNull(),
  costByCountry: jsonb("cost_by_country").$type<Record<string, number>>(),
  invasiveness: integer("invasiveness"),
  lrPos: real("lr_pos").notNull(),
  lrNeg: real("lr_neg").notNull(),
  /** Keyed by metric code, so a multi-marker test can carry one value each. */
  typicalPos: jsonb("typical_pos").$type<Record<string, number>>(),
  typicalNeg: jsonb("typical_neg").$type<Record<string, number>>(),
  repeatable: boolean("repeatable").default(false).notNull(),
  howTo: text("how_to"),
});

/** Which test discriminates which condition. */
export const hkbConditionTests = pgTable(
  "hkb_condition_tests",
  {
    conditionId: text("condition_id")
      .notNull()
      .references(() => hkbConditions.id, { onDelete: "cascade" }),
    testId: text("test_id")
      .notNull()
      .references(() => hkbTests.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.conditionId, t.testId] })],
);

/**
 * One ontology term, HPO or MONDO. Imported wholesale by
 * `scripts/hkb-import-ontology.ts`; nothing scores off it directly, it is what
 * the annotations and our own `mondo_id` values join through.
 */
export const hkbTerms = pgTable(
  "hkb_terms",
  {
    /** "HP:0001945", "MONDO:0005044" */
    id: text("id").primaryKey(),
    /** HP | MONDO */
    ontology: text("ontology").notNull(),
    name: text("name").notNull(),
    synonyms: jsonb("synonyms").$type<string[]>(),
    parents: jsonb("parents").$type<string[]>(),
    /** OMIM and Orphanet ids, so HPOA rows can be joined to a MONDO term. */
    xrefs: jsonb("xrefs").$type<string[]>(),
  },
  (t) => [index("hkb_terms_ontology_idx").on(t.ontology)],
);

/** One HPOA row: this disease shows this phenotype, this often. */
export const hkbAnnotations = pgTable(
  "hkb_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "OMIM:143100", "ORPHA:98897" */
    diseaseId: text("disease_id").notNull(),
    diseaseName: text("disease_name"),
    hpoId: text("hpo_id").notNull(),
    /** "HP:0040282", "12/25" or "30%", exactly as the file says it */
    frequency: text("frequency"),
    onset: text("onset"),
    source: text("source"),
  },
  (t) => [
    unique("hkb_annotations_key").on(t.diseaseId, t.hpoId, t.frequency),
    index("hkb_annotations_disease_idx").on(t.diseaseId),
  ],
);

/** One importer run, so /hkb can say when the tables were last filled. */
export const hkbImportRuns = pgTable("hkb_import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  script: text("script").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow(),
  rows: jsonb("rows").$type<Record<string, number>>(),
  notes: text("notes"),
});

export type HkbTerm = typeof hkbTerms.$inferSelect;
export type HkbAnnotation = typeof hkbAnnotations.$inferSelect;
export type HkbImportRun = typeof hkbImportRuns.$inferSelect;
export type HkbCondition = typeof hkbConditions.$inferSelect;
export type HkbFeature = typeof hkbFeatures.$inferSelect;
export type HkbPrior = typeof hkbPriors.$inferSelect;
export type HkbPriorModifier = typeof hkbPriorModifiers.$inferSelect;
export type HkbEvidence = typeof hkbEvidence.$inferSelect;
export type HkbTest = typeof hkbTests.$inferSelect;
export type HkbConditionTest = typeof hkbConditionTests.$inferSelect;
