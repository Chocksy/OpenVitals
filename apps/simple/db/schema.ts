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
  serial,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  /** What kind of file this is: `lab` | `genome` | `document`. */
  kind: text("kind").default("lab"),
  /** Document header the extractor read: type, date, institution, specialty. */
  docMeta: jsonb("doc_meta").$type<DocMeta>(),
  // ponytail: the spec wants deleted rows hidden after a day, which needs a
  // timestamp; `created_at` cannot say when the delete happened.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Upload = typeof uploads.$inferSelect;

/** The header of a medical document, kept next to the file it came from. */
export interface DocMeta {
  docType: string;
  date?: string;
  institution?: string;
  specialty?: string;
}

/**
 * One catalog SNP this person carries, kept per (user, rsid). The rest of the
 * ~600k rows in a consumer array are dropped at parse time: nothing outside
 * `GENOME_CATALOG` is ever stored.
 */
export const genomeVariants = pgTable(
  "genome_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rsid: text("rsid").notNull(),
    /** Alleles, sorted, e.g. `CT`. */
    genotype: text("genotype").notNull(),
    chromosome: text("chromosome"),
    position: integer("position"),
    uploadId: uuid("upload_id").references(() => uploads.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("genome_variants_user_rsid_key").on(t.userId, t.rsid)],
);

export type GenomeVariant = typeof genomeVariants.$inferSelect;

/**
 * One thing an extractor read out of a medical document. Everything lands
 * `proposed`; nothing enters inference until the user accepts it.
 * `kind`: finding | measurement | diagnosis | medication | recommendation | event.
 * `status`: proposed | accepted | rejected.
 */
export const documentItems = pgTable(
  "document_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    excerpt: text("excerpt"),
    status: text("status").default("proposed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("document_items_upload_idx").on(t.uploadId, t.kind)],
);

export type DocumentItem = typeof documentItems.$inferSelect;

/** The timeline: a surgery, a hospitalisation, an illness, with its dates. */
export const lifeEvents = pgTable("life_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  startedAt: date("started_at"),
  endedAt: date("ended_at"),
  source: text("source"),
  uploadId: uuid("upload_id").references(() => uploads.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type LifeEvent = typeof lifeEvents.$inferSelect;

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

/**
 * What the engine believed at one moment: `{conditionId: {p, state}}`. Written
 * after an upload's curator run, an answered question, an adopted or dismissed
 * action, and at most once a day from the home page, so the ledger can say
 * "was unlikely, now possible".
 */
export const beliefSnapshots = pgTable(
  "belief_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    beliefs: jsonb("beliefs").$type<BeliefSnapshotBeliefs>().notNull(),
    /**
     * The `hkb_revisions.id` the knowledge base was at when this was computed.
     * Two snapshots on the same revision differ because the person's data
     * changed; two on different revisions may differ because we learned
     * something. `lib/ledger.ts` says which in "what changed".
     */
    kbRevision: integer("kb_revision"),
  },
  (t) => [index("belief_snapshots_user_at_idx").on(t.userId, t.computedAt)],
);

/** `state` is an `HState`; typed loosely here so `db` never imports `lib`. */
export type BeliefSnapshotBeliefs = Record<
  string,
  { p: number; state: string }
>;

export type BeliefSnapshot = typeof beliefSnapshots.$inferSelect;

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
 * Every value a fact ever held, with the dates it held them between.
 *
 * `profile_facts` stays the current view; this is the timeline behind it.
 * Two kinds of edit, and the difference is the whole point:
 *  - `changed`: a new value from a date. The old row keeps its period
 *    (`valid_to` = the day before) because it was true then.
 *  - `corrected`: the old value never held. Its row is marked `corrected` and
 *    the new one opens at the old row's `valid_from`.
 */
export const profileFactHistory = pgTable(
  "profile_fact_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    /** initial | changed | corrected */
    changeKind: text("change_kind").notNull(),
    note: text("note"),
    /** user | document | genome | system */
    source: text("source").default("user").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("profile_fact_history_user_key_idx").on(t.userId, t.key, t.validFrom),
  ],
);

export type ProfileFactHistory = typeof profileFactHistory.$inferSelect;

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
  /**
   * How settled the evidence behind it is, from `hkb_interventions`: A/B are
   * "established", C is "early", D and E are "experimental" and only ever
   * offered with a measurement plan.
   */
  tier?: "established" | "early" | "experimental";
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
  /**
   * 1 = scored for everyone, 2 = dormant until a trigger wakes it for one
   * person (`user_conditions`), 3 = a name in `hkb_terms` and nothing else, so
   * no row here at all. Phase 17.
   */
  ring: integer("ring").default(1).notNull(),
  lenses: jsonb("lenses")
    .$type<Record<string, { w: number; grade: string }>>()
    .notNull(),
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
  /**
   * The cut-off a serology is read against when the lab printed no range, so
   * `statusOf` can call a tTG of 68 red instead of gray. Mirrors
   * `DEFAULT_REF_HIGH` in lib/vectors.ts, which is what the engine reads.
   */
  defaultRefHigh: real("default_ref_high"),
  /** The DOI of the paper that made the research run mint this feature. */
  mintedFrom: text("minted_from"),
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
    conditionOn: jsonb("condition_on")
      .$type<Record<string, unknown>>()
      .notNull(),
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
    conditionOn: jsonb("condition_on")
      .$type<Record<string, unknown>>()
      .notNull(),
    lrPos: real("lr_pos").notNull(),
    lrNeg: real("lr_neg"),
    /**
     * The unit the numbers in `condition_on` are in, after the importer
     * converted them to the feature's own unit. Null for a rule with no
     * numeric cut-off. Phase 18: without it nobody could tell a mmol/L
     * threshold filed against a mg/dL feature.
     */
    thresholdUnit: text("threshold_unit"),
    grade: text("grade").notNull(),
    source: text("source").notNull(),
    population: text("population"),
    confoundedBy: jsonb("confounded_by").$type<string[]>(),
    /**
     * Markers that measure the same thing, so two rules in one group are one
     * fact read twice: `glycaemia`, `iron_panel`, `lipid_panel`,
     * `thyroid_axis`, `bp`, `liver_enzymes`. The engine counts the strongest
     * at full weight and every other one at `lr ** CORR_DAMP`. Phase 17.
     */
    correlationGroup: text("correlation_group"),
    /** seed | proposed | accepted | rejected */
    status: text("status").default("accepted").notNull(),
    /**
     * The acceptance policy let it score but wants a human to look: a pair of
     * verified rows that disagree by more than 3x, or an LR outside 0.01..100
     * with no meta-analysis behind it. It is a chip on /hkb, never a gate.
     */
    needsLook: boolean("needs_look").default(false).notNull(),
    /** Why the admin accepted or rejected it, in one line. */
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** The paper a research proposal came from, so /hkb can link to it. */
    paper: jsonb("paper").$type<HkbPaper>(),
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

/** The paper a research proposal came from, kept next to the row it made. */
export interface HkbPaper {
  pmid: string | null;
  doi: string | null;
  title: string;
  year: number | null;
  journal: string | null;
  url: string;
  quote: string;
}

/**
 * One thing a paper says helps a condition: a treatment, a supplement, a
 * protocol. Grades A–E exactly like `hkb_evidence`; A/B are candidate actions,
 * C is early, D and E are the horizon and only ever offered with a measurement
 * plan. Nothing here multiplies a probability.
 */
export const hkbInterventions = pgTable(
  "hkb_interventions",
  {
    id: text("id").primaryKey(),
    conditionId: text("condition_id")
      .notNull()
      .references(() => hkbConditions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose"),
    duration: text("duration"),
    /** The marker the paper measured, when it maps to a catalog feature. */
    outcomeFeatureId: text("outcome_feature_id"),
    /** The effect size as the paper states it, e.g. "-0.4 mmol/L". */
    effect: text("effect"),
    /** up | down | none */
    direction: text("direction").notNull(),
    grade: text("grade").notNull(),
    paper: jsonb("paper").$type<HkbPaper>(),
    quote: text("quote"),
    /** accepted | review | rejected */
    status: text("status").default("accepted").notNull(),
    population: text("population"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("hkb_interventions_condition_idx").on(t.conditionId)],
);

export type HkbIntervention = typeof hkbInterventions.$inferSelect;

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

/**
 * One ring-2 disease this person's data woke, and why. Waking is per person
 * and reversible: `dismissed` puts it back to sleep and keeps the row, so the
 * audit trail says the engine did look and what it concluded.
 */
export const userConditions = pgTable(
  "user_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conditionId: text("condition_id")
      .notNull()
      .references(() => hkbConditions.id, { onDelete: "cascade" }),
    ringWokenAt: timestamp("ring_woken_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** document | genome | lab | phenotype | user */
    trigger: text("trigger").notNull(),
    triggerDetail: jsonb("trigger_detail").$type<Record<string, unknown>>(),
    /** awake | dismissed */
    status: text("status").default("awake").notNull(),
    /** Why it went back to sleep, when it did. */
    note: text("note"),
  },
  (t) => [unique("user_conditions_key").on(t.userId, t.conditionId)],
);

export type UserCondition = typeof userConditions.$inferSelect;

/**
 * One mutation batch of the knowledge base: a research run, a policy apply, a
 * seed, an override, a ring-2 build. `belief_snapshots.kb_revision` points at
 * the newest one, so "what changed" can separate a new lab result from a
 * changed likelihood ratio.
 */
export const hkbRevisions = pgTable("hkb_revisions", {
  id: serial("id").primaryKey(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  summary: text("summary").notNull(),
});

export type HkbRevision = typeof hkbRevisions.$inferSelect;

/**
 * The measuring stick: what the engine believed just before a strong test came
 * back, and what the test said. Nothing reads it to change a probability; it
 * exists so /hkb can print predicted-band against observed-rate once there are
 * enough rows to read.
 */
export const calibrationEvents = pgTable(
  "calibration_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conditionId: text("condition_id").notNull(),
    /** The probability before the resolver was read. */
    predicted: real("predicted").notNull(),
    predictedAt: timestamp("predicted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** 1 confirmed, 0 excluded. */
    resolved: real("resolved"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** The test id or the document that settled it. */
    resolver: text("resolver").notNull(),
  },
  (t) => [
    unique("calibration_events_key").on(t.userId, t.conditionId, t.resolver),
    index("calibration_events_condition_idx").on(t.conditionId),
  ],
);

export type CalibrationEvent = typeof calibrationEvents.$inferSelect;

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

/* ── the knowledge graph (phase 16) ───────────────────────────────────── */

/**
 * One node of the knowledge graph. `lib/graph.ts` seeds the hand-written ones;
 * the Monarch importer adds `phenotype` and `gene` nodes; a research run that
 * mints a feature adds a `metric` node. Nothing is ever deleted here.
 */
export const kgNodes = pgTable("kg_nodes", {
  /** "metric:tsh", "fact:genome:CYP1A2", "phenotype:HP:0002870". */
  id: text("id").primaryKey(),
  /** metric | system | condition | intervention | behavior | test | risk | fact | gene | phenotype */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  systemId: text("system_id"),
  codes: jsonb("codes").$type<string[]>(),
  note: text("note"),
  /** seed | monarch | research | minted */
  source: text("source").default("seed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** What one node does to another, graded and sourced like everything else. */
export const kgEdges = pgTable(
  "kg_edges",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id")
      .notNull()
      .references(() => kgNodes.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => kgNodes.id, { onDelete: "cascade" }),
    /** raises | lowers | confounds | indicates | treats | worsens | requires_test | modifies_target */
    relation: text("relation").notNull(),
    strength: integer("strength").notNull(),
    /** established | probable | speculative */
    confidence: text("confidence").notNull(),
    /** A–E, the same ladder as `hkb_evidence`. */
    grade: text("grade").notNull(),
    /** science | opinion | anecdotal */
    basis: text("basis").notNull(),
    /**
     * When this edge applies to a person at all: a side, a sex, a pattern, a
     * profile fact, a genotype, or a timing gap. `lib/graph-state.ts` reads it.
     * `when` is reserved in SQL, hence the trailing underscore.
     */
    when_: jsonb("when_").$type<Record<string, unknown>>(),
    mechanism: text("mechanism").notNull(),
    evidence: jsonb("evidence").$type<KgEvidence[]>().notNull(),
    /** seed | pattern | monarch | research */
    source: text("source").default("seed").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // One edge per (from, to, relation, when). A null `when_` is the
    // unconditional edge, so it has to compare equal to itself.
    uniqueIndex("kg_edges_key").on(
      t.fromId,
      t.toId,
      t.relation,
      sql`coalesce(${t.when_}::text, '')`,
    ),
    index("kg_edges_from_idx").on(t.fromId),
    index("kg_edges_to_idx").on(t.toId),
  ],
);

/** One named source behind an edge, with the quote when a paper gave one. */
export interface KgEvidence {
  kind: "guideline" | "meta" | "rct" | "observational" | "anecdotal";
  title: string;
  doi?: string;
  year?: number;
  source?: string;
  /** Verbatim from the abstract, when the LLM extracted this edge. */
  quote?: string;
  /** The effect size as the paper prints it, e.g. "+0.3 mmol/L per 1 h". */
  effect?: string;
}

export type KgNode = typeof kgNodes.$inferSelect;
export type KgEdge = typeof kgEdges.$inferSelect;

/* ── journeys (phase 18) ──────────────────────────────────────────────── */

/**
 * One run of one journey, kept the way `hkb_import_runs` keeps an importer
 * run: so the history is there, and a change in the knowledge base shows up as
 * a change in the curve rather than as a number nobody wrote down.
 *
 * `result` is the whole `JourneyResult`, steps and beliefs included, because
 * the page draws it and nothing else reads it.
 */
export const journeyRuns = pgTable(
  "journey_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journeyId: text("journey_id").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow(),
    /** `hkb_revisions.id` at the time, so two runs can be told apart */
    kbRevision: integer("kb_revision"),
    result: jsonb("result").notNull(),
  },
  (t) => [index("journey_runs_journey_idx").on(t.journeyId, t.ranAt)],
);

export type JourneyRun = typeof journeyRuns.$inferSelect;

/* ── projections (phase 19) ───────────────────────────────────────────── */

/**
 * Where a marker was expected to land, written down before the draw.
 *
 * One row per (person, marker) while it is open; `resolved_*` is filled by the
 * first reading after `retest_at − 2 weeks`, and the verdict is read off the
 * band. Nothing is ever updated except the resolution, so the history of what
 * the engine believed is kept exactly as it was believed.
 */
export const projections = pgTable(
  "projections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    madeAt: date("made_at").notNull(),
    horizonWeeks: integer("horizon_weeks").notNull(),
    fromValue: real("from_value").notNull(),
    expected: real("expected").notNull(),
    low: real("low").notNull(),
    high: real("high").notNull(),
    contributions: jsonb("contributions").notNull(),
    assumptions: jsonb("assumptions").$type<string[]>(),
    retestAt: date("retest_at").notNull(),
    resolvedValue: real("resolved_value"),
    resolvedAt: date("resolved_at"),
    /** better | as_expected | worse | unmeasured */
    verdict: text("verdict"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("projections_user_idx").on(t.userId, t.code, t.madeAt)],
);

/**
 * What actually happened to one (intervention, marker) pair for one person, so
 * the published effect size can later be pooled with this person's own
 * history. The sibling of `calibration_events`, which does the same for
 * beliefs.
 */
export const interventionOutcomes = pgTable(
  "intervention_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `cut added sugar -> hba1c` */
    pair: text("pair").notNull(),
    predictedDelta: real("predicted_delta").notNull(),
    observedDelta: real("observed_delta").notNull(),
    adherence: real("adherence"),
    projectionId: uuid("projection_id").references(() => projections.id, {
      onDelete: "cascade",
    }),
    at: date("at").notNull(),
  },
  (t) => [index("intervention_outcomes_pair_idx").on(t.pair)],
);

export type Projection = typeof projections.$inferSelect;
export type InterventionOutcome = typeof interventionOutcomes.$inferSelect;
