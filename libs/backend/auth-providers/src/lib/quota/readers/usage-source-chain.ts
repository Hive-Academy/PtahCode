import type { PlanLimitStatusReason } from '@ptah-extension/shared';
import type {
  PlanUsageReadRequest,
  PlanUsageReading,
  UsageFailureReason,
  UsageSource,
} from './plan-usage-reader.types';

/** One budget shared by all stages; each source must honor the request signal. */
export const USAGE_CHAIN_DEADLINE_MS = 11_000;

const FAILURE_RANK: Record<UsageFailureReason, number> = {
  'account-unverified': 0,
  'cli-not-signed-in': 1, 'cli-timeout': 1, 'cli-backoff': 1,
  'cli-not-found': 1, 'cli-exit-error': 1, 'cli-parse-failed': 1,
  'cli-unavailable': 1, 'no-local-server': 2, 'no-oauth': 3,
  'usage-auth-rejected': 3, 'balance-auth-rejected': 3,
  'balance-unavailable': 3, 'usage-budget-exhausted': 3,
  'api-key-no-subscription-quota': 3, 'source-not-applicable': 99,
};
function rank(reason: UsageFailureReason): number { return FAILURE_RANK[reason]; }

function usable(reading: PlanUsageReading): boolean {
  return reading.status === 'available' &&
    reading.windowSetEstablished &&
    reading.windows.length > 0 &&
    !reading.sourceInvalid &&
    reading.statusReason !== 'account-unverified';
}

/** Read one source at a time, preserving the first answer with proven windows. */
export async function readUsageSourceChain(
  sources: readonly UsageSource[],
  request: PlanUsageReadRequest,
  now: () => number = Date.now,
  deadlineMs = USAGE_CHAIN_DEADLINE_MS,
): Promise<PlanUsageReading> {
  const deadline = now() + deadlineMs;
  let failure: UsageFailureReason | undefined;
  let applicable = false;
  for (const source of sources) {
    if (request.signal?.aborted) break;
    const remaining = deadline - now();
    if (remaining <= 0) { applicable = true; failure ??= 'cli-timeout'; break; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, remaining);
    try {
      const result = await Promise.race([
        source.read({ ...request, signal: controller.signal }),
        new Promise<undefined>((resolve) => {
          if (controller.signal.aborted) resolve(undefined);
          else controller.signal.addEventListener('abort', () => resolve(undefined), { once: true });
        }),
      ]);
      if (!result || controller.signal.aborted) {
        if (!request.signal?.aborted && deadline - now() <= 0) {
          applicable = true;
          failure ??= 'cli-timeout';
        }
        break;
      }
      if (result.ok) {
        if (result.source === source.label && usable(result.reading)) {
          return { ...result.reading, source: result.source, readAt: result.readAt };
        }
        const reason = result.reading.statusReason ?? 'source-not-applicable';
        if (result.reading.status !== 'no-usage-source') applicable = true;
        if (!failure || rank(reason) < rank(failure)) failure = reason;
        if (reason === 'account-unverified') break;
      } else {
        if (result.reason !== 'source-not-applicable') applicable = true;
        if (!failure || rank(result.reason) < rank(failure)) failure = result.reason;
        if (result.reason === 'account-unverified') break;
      }
    } catch (_error: unknown) {
      // degradation-audit: optional-capability - one source may fail; later independent sources remain eligible.
      applicable = true;
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
    }
  }
  const statusReason: PlanLimitStatusReason | undefined =
    failure && failure !== 'source-not-applicable' ? failure : applicable ? 'cli-unavailable' : undefined;
  return {
    status: applicable ? 'service-unavailable' : 'no-usage-source',
    windowSetEstablished: false,
    windows: [],
    ...(statusReason && { statusReason }),
  };
}
