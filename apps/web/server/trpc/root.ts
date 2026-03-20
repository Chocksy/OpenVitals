import { createRouter } from "./init";
import { observationsRouter } from "./routers/observations";
import { medicationsRouter } from "./routers/medications";
import { importJobsRouter } from "./routers/importJobs";
import { sharingRouter } from "./routers/sharing";
import { aiRouter } from "./routers/ai";
import { preferencesRouter } from "./routers/preferences";
import { metricsRouter } from "./routers/metrics";
import { integrationsRouter } from "./routers/integrations";
import { optimalRangesRouter } from "./routers/optimalRanges";

export const appRouter = createRouter({
  observations: observationsRouter,
  medications: medicationsRouter,
  importJobs: importJobsRouter,
  sharing: sharingRouter,
  ai: aiRouter,
  preferences: preferencesRouter,
  metrics: metricsRouter,
  integrations: integrationsRouter,
  optimalRanges: optimalRangesRouter,
});

export type AppRouter = typeof appRouter;
