import type {
  RpcMethodName,
  RpcMethodParams,
  RpcMethodResult,
  SystemCliType,
} from '@ptah-extension/shared';
import { parseDetectedClis } from './providers-orchestration-schema';
import type { ProvidersCliTest } from './providers-settings.types';

export type ProvidersLaneRpc = <T extends RpcMethodName>(
  method: T,
  params: RpcMethodParams<T>,
  timeout?: number,
) => Promise<RpcMethodResult<T>>;
export type SystemLaneAccount = { profileId: string } | 'ambient';

/** Detection and account probes return only fixed copy, never host error text. */
export async function testSystemLane(
  require: ProvidersLaneRpc,
  cli: SystemCliType,
  selected: SystemLaneAccount,
): Promise<ProvidersCliTest> {
  const started = Date.now();
  const detected = await require('agent:detectClis', undefined);
  const installed = parseDetectedClis(detected.clis).clis.some(
    (entry) => entry.cli === cli && entry.installed,
  );
  let reason: string | null = installed ? null : 'Not detected.';
  if (installed && cli === 'claude') {
    if (selected !== 'ambient') {
      const status = await require('provider:getAccountStatus', {
        provider: 'claude',
        profileId: selected.profileId,
      });
      if (
        !status.ok ||
        status.account.state !== 'signed-in' ||
        status.operation
      ) {
        reason = 'Account not ready.';
      }
    } else {
      const status = await require('provider:getAmbientClaudeStatus', {
        provider: 'claude',
        refresh: true,
      });
      if (!status.ok || status.status.state !== 'connected') {
        reason = 'Account not signed in.';
      }
    }
  }
  return {
    id: cli,
    success: reason === null,
    latencyMs: Date.now() - started,
    reason,
  };
}

/** Above the host's own 30 s abort of `ptahCli:testConnection` (`ptah-cli-registry.ts`). */
const CLI_TEST_TIMEOUT_MS = 45_000;
/** The registry's own FIXED test errors → fixed copy. Any other text (pattern-redacted host text) is dropped (M1). */
const CLI_TEST_REASONS: Readonly<Record<string, string>> = {
  'API key not configured': 'No API key is stored for this instance.',
  'No response received from provider': 'The provider did not respond.',
  'Agent configuration not found':
    'This instance was not found. Refresh and try again.',
};

/** Instance probes retain their existing timeout and fixed error allowlist. */
export async function testInstanceLane(
  require: ProvidersLaneRpc,
  id: string,
): Promise<ProvidersCliTest> {
  const result = await require('ptahCli:testConnection', {
    id,
  }, CLI_TEST_TIMEOUT_MS);
  return {
    id,
    success: result.success,
    latencyMs: result.latencyMs ?? null,
    reason: result.success
      ? null
      : (CLI_TEST_REASONS[result.error ?? ''] ?? null),
  };
}
