/**
 * Codex plan-usage reader (TASK_2026_596, Component 6; Req 2.3, 2.10).
 *
 * Adapts `ICodexAccountUsageService` (the App Server account read, with its
 * own 30 s cache and single flight) to the plan-limit window shape:
 *
 * - Each bucket keeps primary before secondary. The active `codex` bucket
 *   comes first, followed by the other buckets in client-provided order.
 *   The kind comes from `windowDurationMins`
 *   through `windowKindFromDuration`; an absent or unrecognised duration is
 *   labelled by position only ("Window 1", "Window 2"), never guessed.
 * - `resetsAt` goes through `normaliseInstant` (the App Server reports epoch
 *   seconds).
 * - Safe account plan, activity and optional allowances pass through.
 * - A bucket reached type exhausts windows at 100%. A denied ordinary-usage
 *   gate supplies owner evidence only without an exhausted window or usable credits.
 *   Window resets do not expire that owner evidence because no window explains the gate.
 * - An `available` read with no window, allowance or owner-gate evidence is not
 *   a reading: it reports `no-usage-windows` instead of an empty provider
 *   reading. One debug line per read records bucket and window counts only.
 * - Every non-`available` status passes through. A `stale` answer (the
 *   service's own cache after a failed read) keeps its windows at the time
 *   they were originally read, never the time they were re-served.
 *
 * No credential: the App Server authenticates from `CODEX_HOME`.
 */
import {
  normaliseInstant,
  windowKindFromDuration,
  type PlanLimitAllowance,
  type PlanLimitWindow,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  CodexAccountUsageResult,
  ICodexAccountUsageService,
} from '../../providers/codex/codex-provider.types';
import { CodexHomeResolver } from '../../providers/codex/codex-home-resolver';
import type {
  PlanUsageReader,
  PlanUsageReading,
  UsageSource,
} from './plan-usage-reader.types';
import { readUsageSourceChain } from './usage-source-chain';
import { createCodexRolloutUsageSource, type CodexRolloutFileSystem } from './codex-rollout-usage.reader';

/** App Server can initialize and make account, limits, and usage requests (10 s each); leave 10 s for local rollout. */
const CODEX_USAGE_CHAIN_DEADLINE_MS = 50_000;

type CodexQuotaWindow = NonNullable<
  NonNullable<CodexAccountUsageResult['quota']>['primary']
>;
type CodexBucket = NonNullable<CodexAccountUsageResult['buckets']>[number];

/** The Codex service surface this reader needs. */
export type CodexPlanUsageSource = Pick<
  ICodexAccountUsageService,
  'getAccountUsage'
>;

export function createCodexPlanUsageReader(
  usage: CodexPlanUsageSource,
  now: () => number = Date.now,
  homeSource?: () => string | undefined,
  rolloutFs?: CodexRolloutFileSystem,
  logger?: Pick<Logger, 'debug'>,
): PlanUsageReader {
  const home = homeSource ?? (() => new CodexHomeResolver().path);
  const rollout = createCodexRolloutUsageSource(home, now, rolloutFs);
  return async (request) => {
    let lastResult: CodexAccountUsageResult | undefined;
    let lastError: unknown;
    const appServer: UsageSource = {
    id: 'codex-app-server', label: 'provider-api',
    async read({ refresh, signal }) {
      try {
        const result = await usage.getAccountUsage({
          refresh,
          ...(signal && { signal }),
          ...(homeSource && { home: home() }),
        });
        lastResult = result;
        const readAt = result.fetchedAt ?? now();
        const reading = mapCodexAccountUsage(result, now());
        if (result.status !== 'available')
          return { ok: false, source: 'provider-api', reason: 'source-not-applicable' };
        logger?.debug('[PlanUsage] Codex App Server usage read', {
          buckets: result.buckets?.length ?? (result.quota ? 1 : 0),
          windows: reading.windows.length,
        });
        return emptyReading(reading)
          ? { ok: false, source: 'provider-api', reason: 'no-usage-windows' }
          : { ok: true, source: 'provider-api', readAt, reading };
      } catch (error: unknown) {
        // degradation-audit: optional-capability - local rollout may still answer after App Server fails.
        lastError = error;
        return { ok: false, source: 'provider-api', reason: 'source-not-applicable' };
      }
    },
    };
    const guardedRollout: UsageSource = {
      ...rollout,
      read: (sourceRequest) => lastResult?.status === 'available' ||
        lastResult?.status === 'unsupported-auth' ||
        lastResult?.status === 'unsupported-config' ||
        lastResult?.status === 'cli-version-unsupported'
        ? Promise.resolve({ ok: false, source: 'local-state', reason: 'source-not-applicable' })
        : rollout.read(sourceRequest),
    };
    const reading = await readUsageSourceChain([appServer, guardedRollout], request, now, CODEX_USAGE_CHAIN_DEADLINE_MS);
    if (reading.status === 'available') return reading;
    if (lastError) throw lastError;
    const mapped = lastResult && mapCodexAccountUsage(lastResult, now());
    if (lastResult?.status === 'available' && mapped && emptyReading(mapped)) {
      // The failure keeps its reason; the safe plan and activity still show.
      return {
        ...reading,
        ...(mapped.account && { account: mapped.account }),
        ...(mapped.activity && { activity: mapped.activity }),
      };
    }
    if (lastResult && mapped) return {
      ...mapped,
      ...(lastResult.status === 'available' && { source: 'provider-api' as const, readAt: lastResult.fetchedAt ?? now() }),
    };
    return reading;
  };
}

/** An available read with no window, allowance or owner-gate evidence: no limit to show. */
function emptyReading(reading: PlanUsageReading): boolean {
  return (
    reading.windows.length === 0 &&
    !reading.providerOwnerEvidence &&
    !reading.allowances?.length &&
    !reading.credits &&
    !reading.individualAllowance
  );
}

/** Map one Codex account result; `readAt` stands in for a missing `fetchedAt`. */
export function mapCodexAccountUsage(
  result: CodexAccountUsageResult,
  readAt: number,
): PlanUsageReading {
  if (result.status !== 'available' && result.status !== 'stale') {
    return { status: result.status, windowSetEstablished: false, windows: [] };
  }
  const observedAt = result.fetchedAt ?? readAt;
  const buckets: readonly CodexBucket[] = result.buckets ?? [{
    id: 'codex',
    label: 'Codex',
    ...result.quota,
  }];
  const qualified = result.buckets !== undefined;
  const denied = result.ordinaryUsageAllowed === false;
  const windows = buckets.flatMap((bucket) => [
    toWindow(bucket, bucket.primary, 1, observedAt, qualified),
    toWindow(bucket, bucket.secondary, 2, observedAt, qualified),
  ]).filter((window): window is PlanLimitWindow => window !== undefined);
  const individual = (bucket: CodexBucket) => {
    if (!bucket.individualLimit) return undefined;
    const resetsAt = normaliseInstant(bucket.individualLimit.resetsAt);
    return {
      limit: bucket.individualLimit.limit,
      used: bucket.individualLimit.used,
      remainingPercent: bucket.individualLimit.remainingPercent,
      ...(resetsAt !== undefined && { resetsAt }),
    };
  };
  const allowances: PlanLimitAllowance[] = buckets.flatMap((bucket) => {
    const mappedIndividual = individual(bucket);
    return bucket.credits || mappedIndividual || bucket.rateLimitReachedType || bucket.spendControlReached != null
      ? [{
          bucketId: bucket.id,
          label: bucket.label,
          ...(bucket.rateLimitReachedType && { reachedType: bucket.rateLimitReachedType }),
          ...(bucket.spendControlReached != null && { spendControlReached: bucket.spendControlReached }),
          ...(bucket.credits && { credits: bucket.credits }),
          ...(mappedIndividual && { individual: mappedIndividual }),
        }]
      : [];
  });
  const active = buckets.find((bucket) => bucket.id === 'codex');
  const activeIndividual = allowances.find((allowance) => allowance.bucketId === 'codex')?.individual;
  const credits = active?.credits;
  const creditsDepleted = active?.rateLimitReachedType === 'workspace_owner_credits_depleted' ||
    active?.rateLimitReachedType === 'workspace_member_credits_depleted';
  const balance = credits?.balance?.trim() ? Number(credits.balance) : undefined;
  const noUsableCredits = !active?.creditsUnparsed && (creditsDepleted || (active !== undefined && credits?.unlimited !== true &&
    !(credits?.hasCredits === true && (balance === undefined || !Number.isFinite(balance) || balance > 0))));
  const ownerGateDenied = denied && !windows.some((window) => window.exhaustion) && noUsableCredits;
  return {
    status: result.status,
    fetchedAt: observedAt,
    windowSetEstablished: true,
    windows,
    ...(result.status === 'available' && !ownerGateDenied && { providerOwnerClear: true as const }),
    ...(ownerGateDenied && {
      providerOwnerEvidence: { observedAt, source: 'provider-api' as const },
    }),
    ...(allowances.length > 0 && { allowances }),
    ...(active?.credits && { credits: active.credits }),
    ...(activeIndividual && { individualAllowance: activeIndividual }),
    ...(result.resetCreditsAvailable && { resetCreditsAvailable: true }),
    ...(result.upsellAvailable && { upsellAvailable: true }),
    ...(result.account && { account: result.account }),
    ...(result.activity && { activity: result.activity }),
  };
}

function toWindow(
  bucket: CodexBucket,
  quota: CodexQuotaWindow | undefined,
  position: 1 | 2,
  observedAt: number,
  qualified: boolean,
): PlanLimitWindow | undefined {
  if (!quota) return undefined;
  const atLimit =
    Number.isFinite(quota.usedPercent) && quota.usedPercent >= 100;
  const descriptor = windowKindFromDuration(quota.windowDurationMins, position);
  const resetsAt = normaliseInstant(quota.resetsAt);
  const durationMins = quota.windowDurationMins;
  return {
    ...descriptor,
    ...(qualified && bucket.id !== 'codex' && {
      key: `other:${bucket.id}:${position === 1 ? 'primary' : 'secondary'}` as const,
      label: `${bucket.label} ${descriptor.label}`,
    }),
    ...(qualified && { bucketId: bucket.id }),
    ...(atLimit && bucket.rateLimitReachedType !== undefined && {
      reachedType: bucket.rateLimitReachedType,
    }),
    ...(atLimit && bucket.spendControlReached != null && {
      spendControlReached: bucket.spendControlReached,
    }),
    ...(typeof durationMins === 'number' && { durationMins }),
    ...(Number.isFinite(quota.usedPercent) && {
      used: { kind: 'percent', percent: quota.usedPercent },
      usedSource: 'provider-api',
      usedObservedAt: observedAt,
    }),
    ...(resetsAt !== undefined && {
      resetsAt,
      resetSource: 'provider-api',
    }),
    ...(bucket.rateLimitReachedType !== undefined && atLimit ? {
        exhaustion: { observedAt, source: 'provider-api' },
      } : {}),
    observedAt,
  };
}
