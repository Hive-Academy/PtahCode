import { z } from 'zod';
import type { PtahCliConfig } from '@ptah-extension/shared';

export const PtahCliCredentialSourceSchema = z.enum(['instance', 'shared-connection']);

export function parsePtahCliCredentialSource(
  providerId: string,
  source: unknown,
): NonNullable<PtahCliConfig['credentialSource']> {
  const parsed = PtahCliCredentialSourceSchema.default('instance').parse(source);
  if (parsed === 'shared-connection' && providerId !== 'anthropic-api') {
    throw new Error('Shared connection credentials are available only for Claude API lanes');
  }
  return parsed;
}
