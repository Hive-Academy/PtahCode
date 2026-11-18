import { USAGE_SOURCE_LABELS } from './plan-owner.model';
import { formatLocalWithRelative } from '@ptah-extension/shared';
import { PlanLimitOwnerSnapshot } from '@ptah-extension/shared';

export const COMPACT_FORMAT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
export const EXACT_FORMAT = new Intl.NumberFormat('en-US');
export const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * A compact count: exact with separators below 10,000 ("2,588"), compact
 * above ("7.3B"), so small request counts keep their precision while large
 * token counts stay short.
 */
export function compactCount(value: number): string {
  if (!Number.isFinite(value)) return 'unknown';
  return Math.abs(value) < 10_000
    ? EXACT_FORMAT.format(value)
    : COMPACT_FORMAT.format(value);
}

/**
 * A compact token figure from a number or a decimal string (Codex reports
 * `lifetimeTokens` as a string, which can exceed the safe integer range).
 * Integer strings beyond the safe range are formatted through BigInt —
 * never through an unsafe `Number` coercion.
 */
export function compactTokens(value: number | string): string {
  if (typeof value === 'number') return compactCount(value);
  const raw = value.trim();
  if (!/^\d+$/.test(raw)) {
    // A decimal string is coerced only when it fits a safe number.
    if (!/^\d+(\.\d+)?$/.test(raw)) return 'unknown';
    const parsed = Number(raw);
    return Number.isFinite(parsed) && BigInt(Math.trunc(parsed)) <= MAX_SAFE
      ? compactCount(parsed)
      : 'unknown';
  }
  const big = BigInt(raw);
  return big <= MAX_SAFE
    ? compactCount(Number(big))
    : COMPACT_FORMAT.format(big);
}
export function accountingViews(
  owner: PlanLimitOwnerSnapshot,
  now: number,
  time: import('@ptah-extension/shared').LocalTimeOptions,
): readonly import('./plan-tile.types').PlanAccountingView[] {
  const result: import('./plan-tile.types').PlanAccountingView[] = [];
  const provenance = [
    owner.source === undefined
      ? 'Source unknown'
      : USAGE_SOURCE_LABELS[owner.source],
    owner.readAt === undefined
      ? 'Observation time unknown'
      : formatLocalWithRelative(owner.readAt, now, time),
  ];
  for (const bucket of [
    ...(owner.allowances ?? []),
    {
      bucketId: 'owner',
      label: 'Account',
      credits: owner.credits,
      individual: owner.individualAllowance,
    },
  ]) {
    if (bucket.credits)
      result.push({
        key: bucket.bucketId + ':balance',
        kind: 'balance',
        label: 'Credits / balance — ' + bucket.label,
        valueText: bucket.credits.unlimited
          ? 'Unlimited credits'
          : (bucket.credits.balance ??
            (bucket.credits.hasCredits ? 'Credits available' : 'No credits')),
        provenance,
      });
    if (bucket.individual)
      result.push({
        key: bucket.bucketId + ':allowance',
        kind: 'allowance',
        label: 'Allowance — ' + bucket.label,
        valueText:
          `${bucket.individual.used} of ${bucket.individual.limit}` +
          (Number.isFinite(bucket.individual.remainingPercent)
            ? ` · ${100 - bucket.individual.remainingPercent}% of allowance used`
            : ''),
        provenance: [
          ...provenance,
          ...(bucket.individual.resetsAt === undefined
            ? []
            : [
                `Reported allowance reset: ${formatLocalWithRelative(bucket.individual.resetsAt, now, time)}`,
              ]),
        ],
      });
  }
  const usage = owner.localUsage;
  if (usage) {
    const facts = [
      usage.source === 'provider-api' ? 'Provider API' : 'Local CLI accounting',
      usage.range ?? 'Reported range unknown',
      Number.isFinite(usage.observedAt)
        ? formatLocalWithRelative(usage.observedAt, now, time)
        : 'Observation time unknown',
    ];
    if (usage.requests !== undefined)
      result.push({
        key: 'requests',
        kind: 'requests',
        label: 'Recorded activity — Requests',
        valueText: compactCount(usage.requests) + ' requests',
        provenance: facts,
      });
    else {
      result.push({
        key: 'tokens',
        kind: 'tokens',
        label: 'Recorded activity — Tokens',
        valueText: compactTokens(usage.tokens) + ' tokens',
        provenance: facts,
      });
      result.push({
        key: 'cost',
        kind: 'cost',
        label: 'Recorded activity — Estimated cost',
        valueText: `$${usage.estimatedCostUsd.toFixed(2)} USD`,
        provenance: facts,
      });
    }
  }
  if (owner.activity?.lifetimeTokens)
    result.push({
      key: 'lifetime',
      kind: 'activity',
      label: 'Recorded activity — Lifetime tokens',
      valueText: compactTokens(owner.activity.lifetimeTokens),
      provenance,
    });
  for (const day of owner.activity?.dailyUsage ?? []) {
    result.push({
      key: 'daily:' + day.startDate,
      kind: 'activity',
      label: 'Recorded activity - ' + day.startDate,
      valueText: compactTokens(day.tokens) + ' tokens',
      provenance,
    });
  }
  return result;
}
