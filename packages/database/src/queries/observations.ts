import { and, asc, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { observations } from '../schema/observations';
import type { Database } from '../client';

export async function listObservations(
  db: Database,
  params: {
    userId: string;
    category?: string;
    metricCode?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: string;
    limit?: number;
    offset?: number;
  },
) {
  const conditions: SQL[] = [eq(observations.userId, params.userId)];
  if (params.category) conditions.push(eq(observations.category, params.category));
  if (params.metricCode) conditions.push(eq(observations.metricCode, params.metricCode));
  if (params.dateFrom) conditions.push(gte(observations.observedAt, params.dateFrom));
  if (params.dateTo) conditions.push(lte(observations.observedAt, params.dateTo));
  if (params.status) conditions.push(eq(observations.status, params.status));

  return db
    .select()
    .from(observations)
    .where(and(...conditions))
    .orderBy(desc(observations.observedAt))
    .limit(params.limit ?? 50)
    .offset(params.offset ?? 0);
}

export async function getObservationTrend(
  db: Database,
  params: {
    userId: string;
    metricCode: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  },
) {
  const conditions: SQL[] = [
    eq(observations.userId, params.userId),
    eq(observations.metricCode, params.metricCode),
  ];
  if (params.dateFrom) conditions.push(gte(observations.observedAt, params.dateFrom));
  if (params.dateTo) conditions.push(lte(observations.observedAt, params.dateTo));

  return db
    .select()
    .from(observations)
    .where(and(...conditions))
    .orderBy(asc(observations.observedAt))
    .limit(params.limit ?? 200);
}

export async function listObservationsByImportJob(
  db: Database,
  params: {
    importJobId: string;
    userId: string;
  },
) {
  return db
    .select()
    .from(observations)
    .where(
      and(
        eq(observations.importJobId, params.importJobId),
        eq(observations.userId, params.userId),
      ),
    )
    .orderBy(asc(observations.metricCode));
}

export async function getObservationWithProvenance(
  db: Database,
  params: {
    observationId: string;
    userId: string;
  },
) {
  return db.query.observations.findFirst({
    where: and(
      eq(observations.id, params.observationId),
      eq(observations.userId, params.userId),
    ),
    with: {
      dataSource: true,
      sourceArtifact: true,
      importJob: true,
    },
  });
}
