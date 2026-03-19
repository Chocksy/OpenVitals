import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@openvitals/database/client';
import {
  getConnectionByProviderUserId,
  updateConnectionTokens,
  updateSyncStatus,
  ensureDataSource,
  observations,
} from '@openvitals/database';
import { getProvider, encrypt, decrypt } from '@/server/integrations';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;

  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown provider: ${providerId}` },
      { status: 404 },
    );
  }

  // Provider must support webhooks
  if (!provider.parseWebhookEvent || !provider.fetchWebhookRecord) {
    return NextResponse.json(
      { error: 'Webhooks not supported for this provider' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const event = provider.parseWebhookEvent(body);
  if (!event) {
    // Unrecognized or unsupported event type — acknowledge silently
    return NextResponse.json({ ok: true });
  }

  const db = getDb();

  // Look up the connection by the provider's user ID
  const connection = await getConnectionByProviderUserId(db, {
    provider: providerId,
    providerUserId: event.providerUserId,
  });

  if (!connection || !connection.accessTokenEnc || !connection.refreshTokenEnc) {
    // No active connection for this user — acknowledge so Whoop doesn't retry
    console.warn(
      `[webhook/${providerId}] No active connection for providerUserId=${event.providerUserId}`,
    );
    return NextResponse.json({ ok: true });
  }

  try {
    // Decrypt tokens, refresh if needed
    let accessToken = decrypt(connection.accessTokenEnc);
    const refreshToken = decrypt(connection.refreshTokenEnc);

    const now = new Date();
    const buffer = 5 * 60 * 1000;
    if (
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() - buffer < now.getTime()
    ) {
      const newTokens = await provider.refreshTokens(refreshToken);
      await updateConnectionTokens(db, {
        id: connection.id,
        accessTokenEnc: encrypt(newTokens.accessToken),
        refreshTokenEnc: encrypt(newTokens.refreshToken),
        tokenExpiresAt: newTokens.expiresAt,
      });
      accessToken = newTokens.accessToken;
    }

    // Fetch the specific record and normalize
    let newObservations;
    try {
      newObservations = await provider.fetchWebhookRecord(accessToken, event);
    } catch (err: unknown) {
      // Retry once on 401
      if (err instanceof Error && err.message.includes('401')) {
        const newTokens = await provider.refreshTokens(refreshToken);
        await updateConnectionTokens(db, {
          id: connection.id,
          accessTokenEnc: encrypt(newTokens.accessToken),
          refreshTokenEnc: encrypt(newTokens.refreshToken),
          tokenExpiresAt: newTokens.expiresAt,
        });
        newObservations = await provider.fetchWebhookRecord(
          newTokens.accessToken,
          event,
        );
      } else {
        throw err;
      }
    }

    // Insert observations, skipping duplicates
    const dataSourceId = await ensureDataSource(db, {
      userId: connection.userId,
      provider: providerId,
    });

    let insertedCount = 0;
    for (const obs of newObservations) {
      const existing = await db
        .select({ id: observations.id })
        .from(observations)
        .where(
          and(
            eq(observations.userId, connection.userId),
            eq(observations.metricCode, obs.metricCode),
            eq(observations.observedAt, obs.observedAt),
            eq(observations.dataSourceId, dataSourceId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(observations).values({
          userId: connection.userId,
          metricCode: obs.metricCode,
          category: obs.category,
          valueNumeric: obs.valueNumeric,
          valueText: obs.valueText,
          unit: obs.unit,
          observedAt: obs.observedAt,
          dataSourceId,
          status: 'extracted',
          confidenceScore: 1.0,
          metadataJson: obs.metadataJson ?? null,
        });
        insertedCount++;
      }
    }

    // Update sync timestamp
    await updateSyncStatus(db, {
      id: connection.id,
      lastSyncAt: new Date(),
      lastSyncCursor: connection.lastSyncCursor,
      lastSyncError: null,
    });

    console.log(
      `[webhook/${providerId}] Processed ${event.type} for user ${event.providerUserId}: ${insertedCount} new observations`,
    );

    return NextResponse.json({ ok: true, inserted: insertedCount });
  } catch (err) {
    console.error(
      `[webhook/${providerId}] Error processing ${event.type}:`,
      err,
    );
    // Still return 200 to prevent Whoop from retrying endlessly
    return NextResponse.json({ ok: true, error: 'processing_failed' });
  }
}
