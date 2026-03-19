export interface IntegrationProvider {
  id: string;
  name: string;
  scopes: string[];

  buildAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  fetchData(accessToken: string, cursor: string | null): Promise<SyncResult>;

  /** Parse a raw webhook body and return the provider user ID it targets, or null to skip. */
  parseWebhookEvent?(body: unknown): WebhookEvent | null;
  /** Fetch and normalize a single record referenced by a webhook event. */
  fetchWebhookRecord?(accessToken: string, event: WebhookEvent): Promise<NormalizedObservation[]>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface NormalizedObservation {
  metricCode: string;
  category: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  observedAt: Date;
  metadataJson?: Record<string, unknown>;
}

export interface SyncResult {
  observations: NormalizedObservation[];
  newCursor: string | null;
}

export interface WebhookEvent {
  /** Provider user ID this event is for */
  providerUserId: string;
  /** Event type (e.g. 'recovery.updated') */
  type: string;
  /** Resource ID to fetch */
  resourceId: string;
}
