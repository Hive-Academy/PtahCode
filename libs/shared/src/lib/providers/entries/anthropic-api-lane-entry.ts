import type { AnthropicProvider } from '../provider-registry';
import { CLAUDE_CLI_PROVIDER_ENTRY } from './claude-cli-provider-entry';

/** Direct Claude API lane. Deliberately excluded from main-agent provider lists. */
export const ANTHROPIC_API_LANE_ENTRY: AnthropicProvider = {
  id: 'anthropic-api',
  name: 'Claude API',
  baseUrl: 'https://api.anthropic.com',
  authType: 'apiKey',
  authEnvVar: 'ANTHROPIC_API_KEY',
  requiresProxy: false,
  keyPrefix: '',
  helpUrl: 'https://console.anthropic.com/settings/keys',
  description: 'Direct Claude API key for a Ptah CLI lane',
  keyPlaceholder: 'Anthropic API key',
  maskedKeyDisplay: '••••••••••••',
  defaultTiers: CLAUDE_CLI_PROVIDER_ENTRY.defaultTiers,
  staticModels: CLAUDE_CLI_PROVIDER_ENTRY.staticModels,
};
