import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ── Integration Connections ─────────────────────────────────────────────────────

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }),
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    tokenExpiresAt: timestamp('token_expires_at'),
    scopes: text('scopes'),
    lastSyncAt: timestamp('last_sync_at'),
    lastSyncCursor: text('last_sync_cursor'),
    lastSyncError: text('last_sync_error'),
    isActive: boolean('is_active').default(true),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    unique('integration_connections_user_provider_uniq').on(
      table.userId,
      table.provider,
    ),
  ],
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const integrationConnectionsRelations = relations(
  integrationConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [integrationConnections.userId],
      references: [users.id],
    }),
  }),
);
