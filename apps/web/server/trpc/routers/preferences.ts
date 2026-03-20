import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../init";
import { users } from "@openvitals/database";

export const preferencesRouter = createRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db
      .select({
        timezone: users.timezone,
        preferredUnits: users.preferredUnits,
        aiModel: users.aiModel,
        dateOfBirth: users.dateOfBirth,
        biologicalSex: users.biologicalSex,
        bloodType: users.bloodType,
        showOptimalRanges: users.showOptimalRanges,
        onboardingStep: users.onboardingStep,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    return {
      timezone: user?.timezone ?? "UTC",
      preferredUnits: user?.preferredUnits ?? "metric",
      aiModel: user?.aiModel ?? "claude-sonnet-4-20250514",
      dateOfBirth: user?.dateOfBirth ?? null,
      biologicalSex: user?.biologicalSex ?? null,
      bloodType: user?.bloodType ?? null,
      showOptimalRanges: user?.showOptimalRanges ?? true,
      onboardingStep: user?.onboardingStep ?? 0,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        timezone: z.string().optional(),
        preferredUnits: z.enum(["metric", "imperial"]).optional(),
        aiModel: z.string().optional(),
        dateOfBirth: z.string().optional(),
        biologicalSex: z.enum(["male", "female", "intersex"]).optional(),
        bloodType: z
          .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
          .optional(),
        onboardingStep: z.number().int().min(0).max(9).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.preferredUnits !== undefined && {
            preferredUnits: input.preferredUnits,
          }),
          ...(input.aiModel !== undefined && { aiModel: input.aiModel }),
          ...(input.dateOfBirth !== undefined && {
            dateOfBirth: input.dateOfBirth,
          }),
          ...(input.biologicalSex !== undefined && {
            biologicalSex: input.biologicalSex,
          }),
          ...(input.bloodType !== undefined && { bloodType: input.bloodType }),
          ...(input.onboardingStep !== undefined && {
            onboardingStep: input.onboardingStep,
          }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.userId));

      return { success: true };
    }),
});
