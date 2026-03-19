import { and, eq } from 'drizzle-orm';
import { integrationConnections } from '../schema/integrations';
import { dataSources } from '../schema/sources';
import type { Database } from '../client';

export async function listConnections(
  db: Database,
  params: { userId: string },
) {
  return db
    .select({
      id: integrationConnections.id,
      provider: integrationConnections.provider,
      providerUserId: integrationConnections.providerUserId,
      isActive: integrationConnections.isActive,
      lastSyncAt: integrationConnections.lastSyncAt,
      lastSyncError: integrationConnections.lastSyncError,
      scopes: integrationConnections.scopes,
      createdAt: integrationConnections.createdAt,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.userId, params.userId));
}

export async function getConnectionByProvider(
  db: Database,
  params: { userId: string; provider: string },
) {
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.userId, params.userId),
        eq(integrationConnections.provider, params.provider),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getConnectionByProviderUserId(
  db: Database,
  params: { provider: string; providerUserId: string },
) {
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.provider, params.provider),
        eq(integrationConnections.providerUserId!, params.providerUserId),
        eq(integrationConnections.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertConnection(
  db: Database,
  params: {
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    tokenExpiresAt: Date;
    scopes: string;
  },
) {
  const [row] = await db
    .insert(integrationConnections)
    .values({
      userId: params.userId,
      provider: params.provider,
      providerUserId: params.providerUserId,
      accessTokenEnc: params.accessTokenEnc,
      refreshTokenEnc: params.refreshTokenEnc,
      tokenExpiresAt: params.tokenExpiresAt,
      scopes: params.scopes,
      isActive: true,
      lastSyncError: null,
    })
    .onConflictDoUpdate({
      target: [integrationConnections.userId, integrationConnections.provider],
      set: {
        providerUserId: params.providerUserId,
        accessTokenEnc: params.accessTokenEnc,
        refreshTokenEnc: params.refreshTokenEnc,
        tokenExpiresAt: params.tokenExpiresAt,
        scopes: params.scopes,
        isActive: true,
        lastSyncError: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row!;
}

export async function disconnectProvider(
  db: Database,
  params: { userId: string; provider: string },
) {
  const [row] = await db
    .update(integrationConnections)
    .set({
      isActive: false,
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationConnections.userId, params.userId),
        eq(integrationConnections.provider, params.provider),
      ),
    )
    .returning({ id: integrationConnections.id });

  return row ?? null;
}

export async function updateConnectionTokens(
  db: Database,
  params: {
    id: string;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    tokenExpiresAt: Date;
  },
) {
  await db
    .update(integrationConnections)
    .set({
      accessTokenEnc: params.accessTokenEnc,
      refreshTokenEnc: params.refreshTokenEnc,
      tokenExpiresAt: params.tokenExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, params.id));
}

export async function updateSyncStatus(
  db: Database,
  params: {
    id: string;
    lastSyncAt: Date;
    lastSyncCursor: string | null;
    lastSyncError: string | null;
  },
) {
  await db
    .update(integrationConnections)
    .set({
      lastSyncAt: params.lastSyncAt,
      lastSyncCursor: params.lastSyncCursor,
      lastSyncError: params.lastSyncError,
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, params.id));
}

export async function ensureDataSource(
  db: Database,
  params: { userId: string; provider: string },
) {
  const existing = await db
    .select({ id: dataSources.id })
    .from(dataSources)
    .where(
      and(
        eq(dataSources.userId, params.userId),
        eq(dataSources.type, 'integration'),
        eq(dataSources.provider!, params.provider),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  const [row] = await db
    .insert(dataSources)
    .values({
      userId: params.userId,
      name: `${params.provider} integration`,
      type: 'integration',
      provider: params.provider,
      isActive: true,
    })
    .returning({ id: dataSources.id });

  return row!.id;
}
