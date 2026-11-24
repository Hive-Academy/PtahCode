/**
 * Monotonic deadline helpers for bounded route-decide gather and dispatch.
 */

export interface RouteDeadline {
  readonly deadlineAtMs: number;
  remainingMs(): number;
}

export type BudgetResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'deadline' }
  | { readonly kind: 'error'; readonly error: unknown };

/** Create an absolute deadline backed by a monotonic clock (default `performance.now`). */
export function createRouteDeadline(
  deadlineAtMs: number,
  now: () => number = () => performance.now(),
): RouteDeadline {
  return {
    deadlineAtMs,
    remainingMs: () => Math.max(0, deadlineAtMs - now()),
  };
}

/** Cap an existing deadline so it expires no later than `maxBudgetMs` from now. */
export function capRouteDeadline(
  deadline: RouteDeadline,
  maxBudgetMs: number,
): RouteDeadline {
  const remaining = deadline.remainingMs();
  const boundedCap = Math.max(0, maxBudgetMs);
  const excess = Math.max(0, remaining - boundedCap);
  return {
    deadlineAtMs: deadline.deadlineAtMs - excess,
    remainingMs: () => Math.max(0, deadline.remainingMs() - excess),
  };
}

/**
 * Race an async task against `deadline`.
 *
 * - Returns `{ kind: 'deadline' }` immediately without starting `task` when the
 *   budget is already exhausted.
 * - Aborts the passed `AbortSignal` when the deadline expires and classifies
 *   any abort-triggered rejection as `{ kind: 'deadline' }` regardless of
 *   settlement order.
 * - Observes losing promises so late rejections never become unhandled.
 */
export async function withinBudget<T>(
  deadline: RouteDeadline,
  task: (signal: AbortSignal) => Promise<T>,
  onLateError?: (error: unknown) => void,
): Promise<BudgetResult<T>> {
  const remaining = deadline.remainingMs();
  if (Number.isNaN(remaining) || remaining <= 0) {
    return { kind: 'deadline' };
  }

  const controller = new AbortController();
  let promise: Promise<T>;
  try {
    promise = task(controller.signal);
  } catch (error: unknown) {
    return { kind: 'error', error };
  }

  if (!Number.isFinite(remaining)) {
    try {
      return { kind: 'ok', value: await promise };
    } catch (error: unknown) {
      return { kind: 'error', error };
    }
  }

  let expired = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const guarded = promise.then(
    (value): BudgetResult<T> =>
      expired ? { kind: 'deadline' } : { kind: 'ok', value },
    (error: unknown): BudgetResult<T> => {
      if (expired) {
        if (settled) onLateError?.(error);
        return { kind: 'deadline' };
      }
      return { kind: 'error', error };
    },
  );

  const timeout = new Promise<BudgetResult<T>>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      resolve({ kind: 'deadline' });
    }, remaining);
  });

  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
  }
}
