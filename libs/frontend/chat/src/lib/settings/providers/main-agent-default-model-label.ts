import { isProviderSessionProviderId } from '@ptah-extension/shared';

/**
 * The main-agent Model row when no model is set. A provider-session provider
 * (Antigravity) never runs Claude, so it picks its own default model; every
 * other provider runs through Claude, which picks the model.
 */
export function mainAgentDefaultModelLabel(
  providerId: string | null | undefined,
  providerName: string | null | undefined,
): string {
  if (providerId && isProviderSessionProviderId(providerId)) {
    return `Default (chosen by ${providerName || providerId})`;
  }
  return 'Default (chosen by Claude)';
}
