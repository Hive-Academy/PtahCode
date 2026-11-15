/**
 * Bounded wait for non-cancelling plan-limit lookups (TASK_2026_1180_d4cd).
 *
 * Races a background limit-lookup promise against a short deadline without
 * aborting the lookup itself, so a slow cold reader still finishes in the
 * background and populates the owner cache for subsequent calls.
 */

/** Marker returned when a limit lookup has not settled within the wait budget. */
export const LIMIT_LOOKUP_PENDING = 'pending' as const;
export type LimitLookupPending = typeof LIMIT_LOOKUP_PENDING;

/** Tracks a lookup's settlement without relying on a zero-delay promise race. */
export interface LimitLookupSettlement<T> {
  value?: { readonly result: T | undefined };
}

export function trackLimitLookup<T>(lookup: Promise<T>): LimitLookupSettlement<T> {
  const settlement: LimitLookupSettlement<T> = {};
  lookup.then(
    (result) => { settlement.value = { result }; },
    () => { settlement.value = { result: undefined }; },
  );
  return settlement;
}

/**
 * Wait at most `waitMs` for `lookup` to settle, without cancelling `lookup`.
 *
 * - Settles before `waitMs` → returns the resolved value and clears the timer.
 * - Slower than `waitMs` → returns {@link LIMIT_LOOKUP_PENDING} at `waitMs`
 *   while `lookup` keeps running in the background.
 * - Rejects (before or after `waitMs`) → resolves to `undefined` so callers
 *   treat it as unknown (never blocked) and no unhandled rejection escapes.
 */
export async function boundedLimitLookup<T>(
  lookup: Promise<T>,
  waitMs: number,
): Promise<T | undefined | LimitLookupPending> {
  const safeLookup = lookup.then(
    (value): T | undefined => value,
    () => {
      // degradation-audit: optional-capability - plan-limit lookup is
      // non-blocking enrichment; a rejected lookup resolves to undefined
      // (unknown, never blocked) and never fails or blocks a spawn.
      return undefined;
    },
  );
  if (waitMs <= 0) return LIMIT_LOOKUP_PENDING;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      safeLookup,
      new Promise<LimitLookupPending>((resolve) => {
        timer = setTimeout(() => resolve(LIMIT_LOOKUP_PENDING), waitMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Post-spawn limit resolution: reuses a settled pre-spawn lookup, peeks
 * without waiting again when the pre-spawn lookup already spent the wait
 * budget, or runs a bounded post-spawn lookup for auto-detected lanes.
 */
export async function resolvePostSpawnLimits<T>(
  preLookup: Promise<T> | undefined,
  preLimits: T | undefined | LimitLookupPending,
  settlement: LimitLookupSettlement<T> | undefined,
  startLookup: () => Promise<T>,
  waitMs: number,
): Promise<T | undefined | LimitLookupPending> {
  if (!preLookup) return boundedLimitLookup(startLookup(), waitMs);
  return preLimits === LIMIT_LOOKUP_PENDING
    ? settlement?.value === undefined ? LIMIT_LOOKUP_PENDING : settlement.value.result
    : preLimits;
}
