import type { IntegrationProvider } from './types';

const providers = new Map<string, IntegrationProvider>();

export function registerProvider(provider: IntegrationProvider) {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): IntegrationProvider | undefined {
  return providers.get(id);
}

export function listProviders(): IntegrationProvider[] {
  return Array.from(providers.values());
}
