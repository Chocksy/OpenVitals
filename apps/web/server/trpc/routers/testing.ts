import { z } from "zod";
import {
  eq,
  and,
  desc,
  sql,
  inArray,
  notInArray,
  isNotNull,
} from "drizzle-orm";
import { createRouter, protectedProcedure } from "../init";
import {
  labProviders,
  panelTemplates,
  panelTemplateMetrics,
  userRetestSettings,
  metricDefinitions,
  observations,
  optimalRanges,
  userOptimalRanges,
  users,
  insights,
  medications,
  conditions,
} from "@openvitals/database";
import { computeAge } from "@/lib/demographics";
import {
  retestTriagePrompt,
  labPanelSuggestionPrompt,
  estimateTokens,
} from "@openvitals/ai";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { deriveStatus, deriveOptimalStatus } from "@/lib/health-utils";
import {
  PREVENTION_PANELS,
  getAllPreventionMetrics,
  getPreventionFrequency,
} from "@/lib/prevention-panels";
import type { LabPanelPlan, MetricDetail } from "@/lib/retest-types";
import { applyCorePanelSafetyNet } from "@/lib/retest-safety-net";

// Categories that are continuously measured (not lab-tested)
const EXCLUDED_CATEGORIES = ["wearable", "vital_sign"];

export const testingRouter = createRouter({
  // ── Providers ────────────────────────────────────────────────────────────

  "providers.list": protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(labProviders)
      .where(eq(labProviders.isActive, true))
      .orderBy(labProviders.sortOrder);
  }),

  // ── Panels ───────────────────────────────────────────────────────────────

  "panels.list": protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Get user sex for filtering
      const [user] = await ctx.db
        .select({ biologicalSex: users.biologicalSex })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);

      const userSex = user?.biologicalSex ?? null;

      let query = ctx.db
        .select({
          id: panelTemplates.id,
          name: panelTemplates.name,
          description: panelTemplates.description,
          category: panelTemplates.category,
          estimatedCostLow: panelTemplates.estimatedCostLow,
          estimatedCostHigh: panelTemplates.estimatedCostHigh,
          targetSex: panelTemplates.targetSex,
          sortOrder: panelTemplates.sortOrder,
          metricCount: sql<number>`count(${panelTemplateMetrics.id})::int`,
        })
        .from(panelTemplates)
        .leftJoin(
          panelTemplateMetrics,
          eq(panelTemplates.id, panelTemplateMetrics.panelId),
        )
        .where(eq(panelTemplates.isActive, true))
        .groupBy(panelTemplates.id)
        .orderBy(panelTemplates.sortOrder);

      const rows = await query;

      // Filter by sex: show panels with no targetSex or matching user sex
      return rows.filter(
        (p) => p.targetSex === null || p.targetSex === userSex,
      );
    }),

  "panels.getByIdWithStatus": protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get panel
      const [panel] = await ctx.db
        .select()
        .from(panelTemplates)
        .where(eq(panelTemplates.id, input.id))
        .limit(1);

      if (!panel) return null;

      // Get panel metrics with definitions
      const metrics = await ctx.db
        .select({
          metricCode: panelTemplateMetrics.metricCode,
          isCore: panelTemplateMetrics.isCore,
          sortOrder: panelTemplateMetrics.sortOrder,
          name: metricDefinitions.name,
          category: metricDefinitions.category,
          unit: metricDefinitions.unit,
        })
        .from(panelTemplateMetrics)
        .innerJoin(
          metricDefinitions,
          eq(panelTemplateMetrics.metricCode, metricDefinitions.id),
        )
        .where(eq(panelTemplateMetrics.panelId, input.id))
        .orderBy(panelTemplateMetrics.sortOrder);

      const metricCodes = metrics.map((m) => m.metricCode);

      // Get user's latest observation per metric
      const latestObs =
        metricCodes.length > 0
          ? await ctx.db
              .selectDistinctOn([observations.metricCode], {
                metricCode: observations.metricCode,
                valueNumeric: observations.valueNumeric,
                unit: observations.unit,
                observedAt: observations.observedAt,
                isAbnormal: observations.isAbnormal,
                referenceRangeLow: observations.referenceRangeLow,
                referenceRangeHigh: observations.referenceRangeHigh,
              })
              .from(observations)
              .where(
                and(
                  eq(observations.userId, ctx.userId),
                  inArray(observations.metricCode, metricCodes),
                ),
              )
              .orderBy(observations.metricCode, desc(observations.observedAt))
          : [];

      const obsMap = new Map(latestObs.map((o) => [o.metricCode, o]));

      // Get optimal ranges for these metrics
      const optRanges =
        metricCodes.length > 0
          ? await ctx.db
              .select()
              .from(optimalRanges)
              .where(inArray(optimalRanges.metricCode, metricCodes))
          : [];
      const optMap = new Map<
        string,
        { rangeLow: number | null; rangeHigh: number | null }
      >();
      for (const r of optRanges) {
        if (!optMap.has(r.metricCode)) {
          optMap.set(r.metricCode, {
            rangeLow: r.rangeLow,
            rangeHigh: r.rangeHigh,
          });
        }
      }

      const now = Date.now();

      const metricsWithStatus = metrics.map((m) => {
        const obs = obsMap.get(m.metricCode);
        const opt = optMap.get(m.metricCode);
        const daysSinceTest = obs
          ? Math.floor(
              (now - new Date(obs.observedAt).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        const healthStatus = obs
          ? deriveStatus({
              isAbnormal: obs.isAbnormal,
              referenceRangeLow: obs.referenceRangeLow,
              referenceRangeHigh: obs.referenceRangeHigh,
              valueNumeric: obs.valueNumeric,
            })
          : null;

        const optimalStatus = obs
          ? deriveOptimalStatus({
              valueNumeric: obs.valueNumeric,
              optimalRangeLow: opt?.rangeLow ?? null,
              optimalRangeHigh: opt?.rangeHigh ?? null,
            })
          : null;

        return {
          metricCode: m.metricCode,
          name: m.name,
          category: m.category,
          unit: m.unit,
          isCore: m.isCore,
          latestValue: obs?.valueNumeric ?? null,
          latestUnit: obs?.unit ?? null,
          observedAt: obs?.observedAt?.toISOString() ?? null,
          daysSinceTest,
          healthStatus,
          optimalStatus,
        };
      });

      const testedCount = metricsWithStatus.filter(
        (m) => m.latestValue !== null,
      ).length;

      return {
        ...panel,
        metrics: metricsWithStatus,
        testedCount,
        totalCount: metricsWithStatus.length,
      };
    }),

  // ── Retest Planner ───────────────────────────────────────────────────────

  "retest.getRecommendations": protectedProcedure.query(async ({ ctx }) => {
    // Get user demographics
    const [user] = await ctx.db
      .select({
        dateOfBirth: users.dateOfBirth,
        biologicalSex: users.biologicalSex,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    // Get all user's latest observations (excluding wearables/vitals)
    const allObs = await ctx.db
      .selectDistinctOn([observations.metricCode], {
        metricCode: observations.metricCode,
        valueNumeric: observations.valueNumeric,
        unit: observations.unit,
        observedAt: observations.observedAt,
        isAbnormal: observations.isAbnormal,
        referenceRangeLow: observations.referenceRangeLow,
        referenceRangeHigh: observations.referenceRangeHigh,
        category: observations.category,
      })
      .from(observations)
      .where(
        and(
          eq(observations.userId, ctx.userId),
          notInArray(observations.category, EXCLUDED_CATEGORIES),
        ),
      )
      .orderBy(observations.metricCode, desc(observations.observedAt));

    if (allObs.length === 0) return [];

    const metricCodes = allObs.map((o) => o.metricCode);
    // Also include prevention panel metrics for gap detection
    const allCodes = [
      ...new Set([...metricCodes, ...getAllPreventionMetrics()]),
    ];

    // Get metric definitions, optimal ranges, and user overrides in parallel
    const [metricDefs, optRanges, userOverrides] = await Promise.all([
      ctx.db
        .select()
        .from(metricDefinitions)
        .where(inArray(metricDefinitions.id, allCodes)),
      ctx.db
        .select()
        .from(optimalRanges)
        .where(inArray(optimalRanges.metricCode, metricCodes)),
      ctx.db
        .select()
        .from(userRetestSettings)
        .where(eq(userRetestSettings.userId, ctx.userId)),
    ]);

    const defMap = new Map(metricDefs.map((d) => [d.id, d]));
    const optMap = new Map<
      string,
      { rangeLow: number | null; rangeHigh: number | null }
    >();
    for (const r of optRanges) {
      if (!optMap.has(r.metricCode)) {
        optMap.set(r.metricCode, {
          rangeLow: r.rangeLow,
          rangeHigh: r.rangeHigh,
        });
      }
    }
    const overrideMap = new Map(userOverrides.map((o) => [o.metricCode, o]));

    const now = Date.now();

    type Recommendation = {
      metricCode: string;
      metricName: string;
      category: string;
      unit: string | null;
      lastValue: number | null;
      lastObservedAt: string | null;
      daysSinceLastTest: number;
      healthStatus: "normal" | "warning" | "critical" | "info" | "neutral";
      optimalStatus: "optimal" | "suboptimal" | "unknown";
      recommendedIntervalDays: number;
      userOverrideIntervalDays: number | null;
      effectiveIntervalDays: number;
      isPaused: boolean;
      urgency:
        | "overdue"
        | "due_soon"
        | "upcoming"
        | "on_track"
        | "never_tested";
      dueInDays: number;
      preventionPanel: string | null;
      preventionWhy: string | null;
    };

    const recommendations: Recommendation[] = allObs.map((obs) => {
      const def = defMap.get(obs.metricCode);
      const opt = optMap.get(obs.metricCode);
      const override = overrideMap.get(obs.metricCode);

      const healthStatus = deriveStatus({
        isAbnormal: obs.isAbnormal,
        referenceRangeLow: obs.referenceRangeLow,
        referenceRangeHigh: obs.referenceRangeHigh,
        valueNumeric: obs.valueNumeric,
      }) as Recommendation["healthStatus"];

      const optimalStatus = deriveOptimalStatus({
        valueNumeric: obs.valueNumeric,
        optimalRangeLow: opt?.rangeLow ?? null,
        optimalRangeHigh: opt?.rangeHigh ?? null,
      });

      // Compute recommended interval
      let recommendedIntervalDays: number;
      if (healthStatus === "critical") {
        recommendedIntervalDays = 30;
      } else if (healthStatus === "warning") {
        recommendedIntervalDays = 90;
      } else if (optimalStatus === "suboptimal") {
        recommendedIntervalDays = 120;
      } else if (optimalStatus === "optimal") {
        recommendedIntervalDays = 365;
      } else {
        recommendedIntervalDays = 180;
      }

      const userOverrideIntervalDays = override?.retestIntervalDays ?? null;
      const effectiveIntervalDays =
        userOverrideIntervalDays ?? recommendedIntervalDays;
      const isPaused = override?.isPaused ?? false;

      const daysSinceLastTest = Math.floor(
        (now - new Date(obs.observedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const dueInDays = effectiveIntervalDays - daysSinceLastTest;

      let urgency:
        | "overdue"
        | "due_soon"
        | "upcoming"
        | "on_track"
        | "never_tested";
      if (dueInDays <= -30) {
        urgency = "overdue";
      } else if (dueInDays <= 0) {
        urgency = "due_soon";
      } else if (dueInDays <= 30) {
        urgency = "upcoming";
      } else {
        urgency = "on_track";
      }

      // Check if this metric is in a prevention panel
      const prevention = getPreventionFrequency(obs.metricCode);

      return {
        metricCode: obs.metricCode,
        metricName: def?.name ?? obs.metricCode,
        category: def?.category ?? obs.category,
        unit: def?.unit ?? obs.unit,
        lastValue: obs.valueNumeric,
        lastObservedAt: obs.observedAt.toISOString(),
        daysSinceLastTest,
        healthStatus,
        optimalStatus,
        recommendedIntervalDays,
        userOverrideIntervalDays,
        effectiveIntervalDays,
        isPaused,
        urgency,
        dueInDays,
        preventionPanel: prevention?.panelLabel ?? null,
        preventionWhy: prevention?.why ?? null,
      };
    });

    // ── Prevention gap items (never tested but recommended) ──────────
    const testedCodes = new Set(allObs.map((o) => o.metricCode));
    const preventionMetrics = getAllPreventionMetrics();

    // Also check aliases — if user has "25_hydroxyvitamin_d", don't suggest "vitamin_d"
    const ALIAS_MAP: Record<string, string[]> = {
      vitamin_d: ["25_hydroxyvitamin_d", "vitamin_d_25_hydroxyvitamin_d"],
      crp: ["c_reactive_protein", "hs_crp"],
      hba1c: ["hemoglobin_a1c"],
    };

    for (const code of preventionMetrics) {
      // Skip if already tested (primary code or aliases)
      const aliases = ALIAS_MAP[code] ?? [];
      const isTested =
        testedCodes.has(code) || aliases.some((a) => testedCodes.has(a));
      if (isTested) continue;

      // Skip calculated metrics (they're computed, not tested)
      if (code === "homa_ir") continue;

      const def = defMap.get(code);
      const prevention = getPreventionFrequency(code);
      if (!prevention) continue;

      recommendations.push({
        metricCode: code,
        metricName: def?.name ?? code.replace(/_/g, " "),
        category: def?.category ?? "lab_result",
        unit: def?.unit ?? null,
        lastValue: null,
        lastObservedAt: null,
        daysSinceLastTest: Infinity,
        healthStatus: "neutral",
        optimalStatus: "unknown",
        recommendedIntervalDays: prevention.frequencyDays,
        userOverrideIntervalDays: null,
        effectiveIntervalDays: prevention.frequencyDays,
        isPaused: false,
        urgency: "never_tested" as const,
        dueInDays: 0,
        preventionPanel: prevention.panelLabel,
        preventionWhy: prevention.why,
      });
    }

    // Sort: flagged retests first, then prevention gaps, then routine
    // Within each group: overdue → due_soon → upcoming → on_track → never_tested
    const urgencyOrder: Record<string, number> = {
      overdue: 0,
      due_soon: 1,
      upcoming: 2,
      on_track: 3,
      never_tested: 4,
    };
    recommendations.sort((a, b) => {
      // Flagged (critical/warning) metrics always first
      const aFlagged =
        a.healthStatus === "critical" || a.healthStatus === "warning" ? 0 : 1;
      const bFlagged =
        b.healthStatus === "critical" || b.healthStatus === "warning" ? 0 : 1;
      if (aFlagged !== bFlagged) return aFlagged - bFlagged;

      const groupDiff =
        (urgencyOrder[a.urgency] ?? 5) - (urgencyOrder[b.urgency] ?? 5);
      if (groupDiff !== 0) return groupDiff;
      return a.dueInDays - b.dueInDays;
    });

    return recommendations;
  }),

  "retest.setOverride": protectedProcedure
    .input(
      z.object({
        metricCode: z.string(),
        retestIntervalDays: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userRetestSettings)
        .values({
          userId: ctx.userId,
          metricCode: input.metricCode,
          retestIntervalDays: input.retestIntervalDays,
        })
        .onConflictDoUpdate({
          target: [userRetestSettings.userId, userRetestSettings.metricCode],
          set: {
            retestIntervalDays: input.retestIntervalDays,
            updatedAt: new Date(),
          },
        });
      return { success: true };
    }),

  "retest.deleteOverride": protectedProcedure
    .input(z.object({ metricCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(userRetestSettings)
        .where(
          and(
            eq(userRetestSettings.userId, ctx.userId),
            eq(userRetestSettings.metricCode, input.metricCode),
          ),
        );
      return { success: true };
    }),

  "retest.togglePause": protectedProcedure
    .input(z.object({ metricCode: z.string(), isPaused: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userRetestSettings)
        .values({
          userId: ctx.userId,
          metricCode: input.metricCode,
          retestIntervalDays: 180, // default
          isPaused: input.isPaused,
        })
        .onConflictDoUpdate({
          target: [userRetestSettings.userId, userRetestSettings.metricCode],
          set: {
            isPaused: input.isPaused,
            updatedAt: new Date(),
          },
        });
      return { success: true };
    }),

  // ── AI Triage ─────────────────────────────────────────────────────────────

  "retest.getCachedTriage": protectedProcedure.query(async ({ ctx }) => {
    const [cached] = await ctx.db
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.userId, ctx.userId),
          eq(insights.type, "retest_triage"),
          eq(insights.isDismissed, false),
        ),
      )
      .orderBy(desc(insights.createdAt))
      .limit(1);

    if (!cached) return null;

    try {
      const content = JSON.parse(cached.content) as {
        items: Array<{
          metricCode: string;
          priority: string;
          reason: string;
        }>;
      };
      return {
        items: content.items,
        generatedAt:
          cached.createdAt?.toISOString() ?? new Date().toISOString(),
        generatedBy: cached.generatedBy,
      };
    } catch {
      return null;
    }
  }),

  "retest.triage": protectedProcedure.mutation(async ({ ctx }) => {
    // 1. Get recommendations (reuse existing query logic inline)
    //    We call the DB directly rather than the procedure to avoid circular calls
    const allObs = await ctx.db
      .selectDistinctOn([observations.metricCode], {
        metricCode: observations.metricCode,
        valueNumeric: observations.valueNumeric,
        unit: observations.unit,
        observedAt: observations.observedAt,
        isAbnormal: observations.isAbnormal,
        referenceRangeLow: observations.referenceRangeLow,
        referenceRangeHigh: observations.referenceRangeHigh,
        category: observations.category,
      })
      .from(observations)
      .where(
        and(
          eq(observations.userId, ctx.userId),
          notInArray(observations.category, EXCLUDED_CATEGORIES),
        ),
      )
      .orderBy(observations.metricCode, desc(observations.observedAt));

    if (allObs.length === 0) {
      return {
        items: [],
        generatedAt: new Date().toISOString(),
        generatedBy: "",
      };
    }

    const metricCodes = allObs.map((o) => o.metricCode);
    const [metricDefs, optRanges, userOverrides] = await Promise.all([
      ctx.db
        .select()
        .from(metricDefinitions)
        .where(inArray(metricDefinitions.id, metricCodes)),
      ctx.db
        .select()
        .from(optimalRanges)
        .where(inArray(optimalRanges.metricCode, metricCodes)),
      ctx.db
        .select()
        .from(userRetestSettings)
        .where(eq(userRetestSettings.userId, ctx.userId)),
    ]);

    const defMap = new Map(metricDefs.map((d) => [d.id, d]));
    const optMap = new Map<
      string,
      { rangeLow: number | null; rangeHigh: number | null }
    >();
    for (const r of optRanges) {
      if (!optMap.has(r.metricCode)) {
        optMap.set(r.metricCode, {
          rangeLow: r.rangeLow,
          rangeHigh: r.rangeHigh,
        });
      }
    }
    const overrideMap = new Map(userOverrides.map((o) => [o.metricCode, o]));
    const now = Date.now();

    // Build retest items for non-on-track metrics
    const retestItems: Array<{
      code: string;
      name: string;
      value: number | null;
      unit: string | null;
      status: string;
      daysSince: number;
      refLow: number | null;
      refHigh: number | null;
    }> = [];

    for (const obs of allObs) {
      const def = defMap.get(obs.metricCode);
      const override = overrideMap.get(obs.metricCode);
      if (override?.isPaused) continue;

      const healthStatus = deriveStatus({
        isAbnormal: obs.isAbnormal,
        referenceRangeLow: obs.referenceRangeLow,
        referenceRangeHigh: obs.referenceRangeHigh,
        valueNumeric: obs.valueNumeric,
      });
      const optimalStatus = deriveOptimalStatus({
        valueNumeric: obs.valueNumeric,
        optimalRangeLow: optMap.get(obs.metricCode)?.rangeLow ?? null,
        optimalRangeHigh: optMap.get(obs.metricCode)?.rangeHigh ?? null,
      });

      let recommendedIntervalDays: number;
      if (healthStatus === "critical") recommendedIntervalDays = 30;
      else if (healthStatus === "warning") recommendedIntervalDays = 90;
      else if (optimalStatus === "suboptimal") recommendedIntervalDays = 120;
      else if (optimalStatus === "optimal") recommendedIntervalDays = 365;
      else recommendedIntervalDays = 180;

      const effectiveInterval =
        override?.retestIntervalDays ?? recommendedIntervalDays;
      const daysSince = Math.floor(
        (now - new Date(obs.observedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const dueInDays = effectiveInterval - daysSince;

      // Only include items that are not on_track
      if (dueInDays > 30) continue;

      retestItems.push({
        code: obs.metricCode,
        name: def?.name ?? obs.metricCode,
        value: obs.valueNumeric,
        unit: def?.unit ?? obs.unit,
        status: healthStatus,
        daysSince,
        refLow: obs.referenceRangeLow,
        refHigh: obs.referenceRangeHigh,
      });
    }

    if (retestItems.length === 0) {
      return {
        items: [],
        generatedAt: new Date().toISOString(),
        generatedBy: "",
      };
    }

    // 2. Fetch medications + conditions for context
    const [meds, conds] = await Promise.all([
      ctx.db
        .select({
          name: medications.name,
          dosage: medications.dosage,
          isActive: medications.isActive,
        })
        .from(medications)
        .where(
          and(
            eq(medications.userId, ctx.userId),
            eq(medications.isActive, true),
          ),
        )
        .limit(30),
      ctx.db
        .select({ name: conditions.name, status: conditions.status })
        .from(conditions)
        .where(eq(conditions.userId, ctx.userId))
        .limit(20),
    ]);

    // 3. Build compact payload
    const payload = {
      retests: retestItems,
      medications: meds.map(
        (m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ""}`,
      ),
      conditions: conds.map((c) => c.name),
    };

    const payloadText = JSON.stringify(payload);

    // 4. Rate limit: check if last triage was less than 1 hour ago
    const [recent] = await ctx.db
      .select({ createdAt: insights.createdAt })
      .from(insights)
      .where(
        and(
          eq(insights.userId, ctx.userId),
          eq(insights.type, "retest_triage"),
        ),
      )
      .orderBy(desc(insights.createdAt))
      .limit(1);

    if (recent?.createdAt) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (recent.createdAt > hourAgo) {
        // Return the cached version instead
        const [cached] = await ctx.db
          .select()
          .from(insights)
          .where(
            and(
              eq(insights.userId, ctx.userId),
              eq(insights.type, "retest_triage"),
              eq(insights.isDismissed, false),
            ),
          )
          .orderBy(desc(insights.createdAt))
          .limit(1);

        if (cached) {
          try {
            const content = JSON.parse(cached.content);
            return {
              items: content.items,
              generatedAt:
                cached.createdAt?.toISOString() ?? new Date().toISOString(),
              generatedBy: cached.generatedBy,
              rateLimited: true,
            };
          } catch {
            // Fall through to regenerate
          }
        }
      }
    }

    // 5. Call LLM
    const [user] = await ctx.db
      .select({ aiModel: users.aiModel })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    const modelId =
      user?.aiModel ??
      process.env.AI_DEFAULT_MODEL ??
      "anthropic/claude-sonnet-4";

    const { text: answer } = await generateText({
      model: openrouter(modelId),
      system: retestTriagePrompt,
      prompt: payloadText,
      temperature: 0,
    });

    // 6. Parse response
    let triageResult: {
      items: Array<{ metricCode: string; priority: string; reason: string }>;
    };
    try {
      // Strip markdown code fences if present
      const cleaned = answer
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      triageResult = JSON.parse(cleaned);
    } catch {
      // If parsing fails, return empty — widget falls back to non-triaged view
      return {
        items: [],
        generatedAt: new Date().toISOString(),
        generatedBy: modelId,
        error: "Failed to parse AI response",
      };
    }

    // 7. Delete previous triage insights for this user, then insert new one
    await ctx.db
      .delete(insights)
      .where(
        and(
          eq(insights.userId, ctx.userId),
          eq(insights.type, "retest_triage"),
        ),
      );

    const [insight] = await ctx.db
      .insert(insights)
      .values({
        userId: ctx.userId,
        type: "retest_triage",
        content: JSON.stringify(triageResult),
        generatedBy: modelId,
        sourceObservationIds: retestItems.map((r) => r.code),
        contextTokenCount: estimateTokens(payloadText),
        metadataJson: {
          itemCount: triageResult.items.length,
          refreshedAt: new Date().toISOString(),
        },
      })
      .returning();

    return {
      items: triageResult.items,
      generatedAt:
        insight!.createdAt?.toISOString() ?? new Date().toISOString(),
      generatedBy: modelId,
    };
  }),

  // ── Lab Panel Suggestion ──────────────────────────────────────────────────

  "retest.getCachedPlan": protectedProcedure.query(async ({ ctx }) => {
    const [cached] = await ctx.db
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.userId, ctx.userId),
          eq(insights.type, "lab_panel_plan"),
          eq(insights.isDismissed, false),
        ),
      )
      .orderBy(desc(insights.createdAt))
      .limit(1);

    if (!cached) return null;

    try {
      const content = JSON.parse(cached.content) as LabPanelPlan;
      return {
        plan: content,
        generatedAt:
          cached.createdAt?.toISOString() ?? new Date().toISOString(),
        generatedBy: cached.generatedBy,
      };
    } catch {
      return null;
    }
  }),

  "retest.generatePlan": protectedProcedure.mutation(async ({ ctx }) => {
    // 1. Get all non-on-track observations (same as triage)
    const allObs = await ctx.db
      .selectDistinctOn([observations.metricCode], {
        metricCode: observations.metricCode,
        valueNumeric: observations.valueNumeric,
        unit: observations.unit,
        observedAt: observations.observedAt,
        isAbnormal: observations.isAbnormal,
        referenceRangeLow: observations.referenceRangeLow,
        referenceRangeHigh: observations.referenceRangeHigh,
        category: observations.category,
      })
      .from(observations)
      .where(
        and(
          eq(observations.userId, ctx.userId),
          notInArray(observations.category, EXCLUDED_CATEGORIES),
        ),
      )
      .orderBy(observations.metricCode, desc(observations.observedAt));

    if (allObs.length === 0) {
      return {
        plan: null,
        generatedAt: new Date().toISOString(),
        generatedBy: "",
      };
    }

    const metricCodes = allObs.map((o) => o.metricCode);
    const [metricDefs, optRanges, userOverrides] = await Promise.all([
      ctx.db
        .select()
        .from(metricDefinitions)
        .where(inArray(metricDefinitions.id, metricCodes)),
      ctx.db
        .select()
        .from(optimalRanges)
        .where(inArray(optimalRanges.metricCode, metricCodes)),
      ctx.db
        .select()
        .from(userRetestSettings)
        .where(eq(userRetestSettings.userId, ctx.userId)),
    ]);

    const defMap = new Map(metricDefs.map((d) => [d.id, d]));
    const optMap = new Map<
      string,
      { rangeLow: number | null; rangeHigh: number | null }
    >();
    for (const r of optRanges) {
      if (!optMap.has(r.metricCode)) {
        optMap.set(r.metricCode, {
          rangeLow: r.rangeLow,
          rangeHigh: r.rangeHigh,
        });
      }
    }
    const overrideMap = new Map(userOverrides.map((o) => [o.metricCode, o]));
    const now = Date.now();

    // Build items for LLM
    const retestItems: Array<{
      code: string;
      name: string;
      value: number | null;
      unit: string | null;
      status: string;
      category: string;
      daysSince: number;
      refLow: number | null;
      refHigh: number | null;
      optimalLow: number | null;
      optimalHigh: number | null;
      trend?: string | null;
      previousValues?: number[];
    }> = [];

    for (const obs of allObs) {
      const def = defMap.get(obs.metricCode);
      const override = overrideMap.get(obs.metricCode);
      if (override?.isPaused) continue;

      const healthStatus = deriveStatus({
        isAbnormal: obs.isAbnormal,
        referenceRangeLow: obs.referenceRangeLow,
        referenceRangeHigh: obs.referenceRangeHigh,
        valueNumeric: obs.valueNumeric,
      });
      const optimalStatus = deriveOptimalStatus({
        valueNumeric: obs.valueNumeric,
        optimalRangeLow: optMap.get(obs.metricCode)?.rangeLow ?? null,
        optimalRangeHigh: optMap.get(obs.metricCode)?.rangeHigh ?? null,
      });

      let recommendedIntervalDays: number;
      if (healthStatus === "critical") recommendedIntervalDays = 30;
      else if (healthStatus === "warning") recommendedIntervalDays = 90;
      else if (optimalStatus === "suboptimal") recommendedIntervalDays = 120;
      else if (optimalStatus === "optimal") recommendedIntervalDays = 365;
      else recommendedIntervalDays = 180;

      const effectiveInterval =
        override?.retestIntervalDays ?? recommendedIntervalDays;
      const daysSince = Math.floor(
        (now - new Date(obs.observedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const dueInDays = effectiveInterval - daysSince;

      // Only include non-on-track items
      if (dueInDays > 30) continue;

      const opt = optMap.get(obs.metricCode);
      retestItems.push({
        code: obs.metricCode,
        name: def?.name ?? obs.metricCode,
        value: obs.valueNumeric,
        unit: def?.unit ?? obs.unit,
        status: healthStatus,
        category: def?.category ?? obs.category,
        daysSince,
        refLow: obs.referenceRangeLow,
        refHigh: obs.referenceRangeHigh,
        optimalLow: opt?.rangeLow ?? null,
        optimalHigh: opt?.rangeHigh ?? null,
      });
    }

    if (retestItems.length === 0) {
      return {
        plan: null,
        generatedAt: new Date().toISOString(),
        generatedBy: "",
      };
    }

    // 2. Fetch medications, conditions, and historical values for trending
    const retestCodes_pre = retestItems.map((r) => r.code);
    const [meds, conds, historyRows] = await Promise.all([
      ctx.db
        .select({ name: medications.name, dosage: medications.dosage })
        .from(medications)
        .where(
          and(
            eq(medications.userId, ctx.userId),
            eq(medications.isActive, true),
          ),
        )
        .limit(30),
      ctx.db
        .select({ name: conditions.name, status: conditions.status })
        .from(conditions)
        .where(eq(conditions.userId, ctx.userId))
        .limit(20),
      // Last 3 values per retest metric for trend analysis
      retestCodes_pre.length > 0
        ? ctx.db
            .select({
              metricCode: observations.metricCode,
              valueNumeric: observations.valueNumeric,
              observedAt: observations.observedAt,
            })
            .from(observations)
            .where(
              and(
                eq(observations.userId, ctx.userId),
                inArray(observations.metricCode, retestCodes_pre),
                isNotNull(observations.valueNumeric),
              ),
            )
            .orderBy(observations.metricCode, desc(observations.observedAt))
        : Promise.resolve([]),
    ]);

    // Build trend map: code → last 3 values (newest first)
    const trendMap = new Map<string, number[]>();
    for (const row of historyRows) {
      if (row.valueNumeric == null) continue;
      const arr = trendMap.get(row.metricCode) ?? [];
      if (arr.length < 3) {
        arr.push(row.valueNumeric);
        trendMap.set(row.metricCode, arr);
      }
    }

    // Derive trend direction from historical values
    function deriveTrend(values: number[]): string | null {
      if (values.length < 2) return null;
      const [newest, ...older] = values;
      const prev = older[0]!;
      const pctChange = ((newest - prev) / prev) * 100;
      if (Math.abs(pctChange) < 3) return "stable";
      return pctChange > 0 ? "rising" : "falling";
    }

    // Enrich retestItems with trend data
    for (const item of retestItems) {
      const history = trendMap.get(item.code);
      if (history && history.length >= 2) {
        item.trend = deriveTrend(history);
        item.previousValues = history.slice(1);
      }
    }

    // 3. Build payload — include ALL tested codes so LLM doesn't suggest already-tested ones
    const allTestedCodes = allObs.map((o) => o.metricCode);

    // Build compact optimal ranges context (only for metrics with optimal data)
    const optimalContext = optRanges
      .filter((r) => r.rangeLow != null || r.rangeHigh != null)
      .reduce(
        (acc, r) => {
          if (!acc.some((a) => a.code === r.metricCode)) {
            acc.push({
              code: r.metricCode,
              low: r.rangeLow,
              high: r.rangeHigh,
              source: r.source,
            });
          }
          return acc;
        },
        [] as Array<{
          code: string;
          low: number | null;
          high: number | null;
          source: string | null;
        }>,
      );

    const payload = {
      retests: retestItems,
      alreadyTested: allTestedCodes,
      medications: meds.map(
        (m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ""}`,
      ),
      conditions: conds.map((c) => c.name),
      optimalRanges: optimalContext,
      corePanels: PREVENTION_PANELS.map((p) => ({
        id: p.id,
        label: p.label,
        frequency: p.frequency,
        metrics: p.metrics,
        why: p.why,
      })),
    };
    const payloadText = JSON.stringify(payload);

    // 4. Call LLM (no rate limit — user explicitly triggers this)
    const [user] = await ctx.db
      .select({ aiModel: users.aiModel })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    const modelId =
      user?.aiModel ??
      process.env.AI_DEFAULT_MODEL ??
      "anthropic/claude-sonnet-4";

    const { text: answer } = await generateText({
      model: openrouter(modelId),
      system: labPanelSuggestionPrompt,
      prompt: payloadText,
      temperature: 0,
    });

    // 6. Parse
    let planResult: LabPanelPlan;
    try {
      const cleaned = answer
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      planResult = JSON.parse(cleaned);
    } catch {
      return {
        plan: null,
        generatedAt: new Date().toISOString(),
        generatedBy: modelId,
        error: "Failed to parse AI response",
      };
    }

    // 7. Enforce: strip metrics from groups that aren't in the input retestItems.
    //    LLMs often add related metrics (e.g., TSH alongside Free T3) even when told not to.
    //    Move any extras to newSuggestions if genuinely untested.
    const retestMap = new Map(retestItems.map((r) => [r.code, r]));
    const retestCodes = new Set(retestItems.map((r) => r.code));
    const testedSet = new Set(allTestedCodes);
    const extraSuggestions: Array<{
      name: string;
      code: string;
      reason: string;
    }> = [];

    for (const group of planResult.groups) {
      // Separate valid (in retestItems) from invented codes
      const validMetrics: string[] = [];
      for (const code of group.metrics) {
        if (retestCodes.has(code)) {
          validMetrics.push(code);
        } else if (!testedSet.has(code)) {
          // Genuinely untested — move to newSuggestions
          const def = defMap.get(code);
          extraSuggestions.push({
            name: def?.name ?? code.replace(/_/g, " "),
            code,
            reason: `Suggested alongside ${group.domain} panel`,
          });
        }
        // If tested but on-track, just drop it silently
      }
      group.metrics = validMetrics;
    }

    // Remove empty groups after filtering
    planResult.groups = planResult.groups.filter((g) => g.metrics.length > 0);

    // Merge extras into newSuggestions
    if (!planResult.newSuggestions) planResult.newSuggestions = [];
    for (const extra of extraSuggestions) {
      if (!planResult.newSuggestions.some((s) => s.code === extra.code)) {
        planResult.newSuggestions.push(extra);
      }
    }

    // 7b. Safety net: ensure core-panel metrics flagged for retesting are
    //     represented in the plan, even if the LLM silently dropped them.
    const patched = applyCorePanelSafetyNet({
      plan: planResult,
      retestCodes: retestItems.map((r) => r.code),
    });
    planResult.groups = patched.groups;
    planResult.optional = patched.optional;

    // 8. Enrich with metric names and last values
    function buildMetricDetails(codes: string[]): MetricDetail[] {
      return codes.map((code) => {
        const item = retestMap.get(code);
        const def = defMap.get(code);
        return {
          code,
          name: def?.name ?? code.replace(/_/g, " "),
          lastValue: item?.value ?? null,
          unit: item?.unit ?? def?.unit ?? null,
          daysSince: item?.daysSince,
        };
      });
    }

    for (const group of planResult.groups) {
      group.metricNames = group.metrics.map(
        (code) => defMap.get(code)?.name ?? code.replace(/_/g, " "),
      );
      group.metricDetails = buildMetricDetails(group.metrics);
    }
    if (planResult.optional?.metrics) {
      // Also filter optional metrics
      planResult.optional.metrics = planResult.optional.metrics.filter((code) =>
        retestCodes.has(code),
      );
      planResult.optional.metricNames = planResult.optional.metrics.map(
        (code) => defMap.get(code)?.name ?? code.replace(/_/g, " "),
      );
      planResult.optional.metricDetails = buildMetricDetails(
        planResult.optional.metrics,
      );
    }

    // 9. Filter out already-tested codes from newSuggestions
    if (planResult.newSuggestions) {
      planResult.newSuggestions = planResult.newSuggestions.filter(
        (s) => !testedSet.has(s.code),
      );
    }

    // 9. Store
    await ctx.db
      .delete(insights)
      .where(
        and(
          eq(insights.userId, ctx.userId),
          eq(insights.type, "lab_panel_plan"),
        ),
      );

    const [insight] = await ctx.db
      .insert(insights)
      .values({
        userId: ctx.userId,
        type: "lab_panel_plan",
        content: JSON.stringify(planResult),
        generatedBy: modelId,
        contextTokenCount: estimateTokens(payloadText),
        metadataJson: {
          groupCount: planResult.groups.length,
          totalMetrics:
            planResult.groups.reduce((sum, g) => sum + g.metrics.length, 0) +
            (planResult.optional?.metrics?.length ?? 0),
          refreshedAt: new Date().toISOString(),
        },
      })
      .returning();

    return {
      plan: planResult,
      generatedAt:
        insight!.createdAt?.toISOString() ?? new Date().toISOString(),
      generatedBy: modelId,
    };
  }),
});
