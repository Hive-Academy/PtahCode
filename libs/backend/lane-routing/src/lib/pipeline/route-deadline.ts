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

function isExpired(deadline: RouteDeadline): boolean {
  const remaining = deadline.remainingMs();
  return Number.isNaN(remaining) || remaining <= 0;
}

/**
 * Race an async task against `deadline`.
 *
 * - Returns `{ kind: 'deadline' }` immediately without starting `task` when the
 *   budget is already exhausted.
 * - Rechecks the monotonic deadline after task invocation and at fulfillment,
 *   rejection, and synchronous throw so settlements after cutoff never win.
 * - Aborts the passed `AbortSignal` when the deadline expires and classifies
 *   any post-cutoff or abort-triggered settlement as `{ kind: 'deadline' }`.
 * - Observes losing promises so late rejections never become unhandled.
 */
export async function withinBudget<T>(
  deadline: RouteDeadline,
  task: (signal: AbortSignal) => Promise<T>,
  onLateError?: (error: unknown) => void,
): Promise<BudgetResult<T>> {
  if (isExpired(deadline)) {
    return { kind: 'deadline' };
  }

  const controller = new AbortController();
  let promise: Promise<T>;
  try {
    promise = task(controller.signal);
  } catch (error: unknown) {
    if (isExpired(deadline)) {
      controller.abort();
      onLateError?.(error);
      return { kind: 'deadline' };
    }
    return { kind: 'error', error };
  }

  const tracked = Promise.resolve(promise);
  const remainingAfterStart = deadline.remainingMs();
  if (Number.isNaN(remainingAfterStart) || remainingAfterStart <= 0) {
    // Observe the losing promise before aborting so sync or async rejections never go unhandled.
    void tracked.then(
      () => undefined,
      (error: unknown) => {
        onLateError?.(error);
      },
    );
    controller.abort();
    return { kind: 'deadline' };
  }

  if (!Number.isFinite(remainingAfterStart)) {
    try {
      const value = await tracked;
      if (isExpired(deadline)) {
        controller.abort();
        return { kind: 'deadline' };
      }
      return { kind: 'ok', value };
    } catch (error: unknown) {
      if (isExpired(deadline)) {
        controller.abort();
        onLateError?.(error);
        return { kind: 'deadline' };
      }
      return { kind: 'error', error };
    }
  }

  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const markExpired = (): void => {
    if (expired) return;
    expired = true;
    controller.abort();
  };

  const guarded = tracked.then(
    (value): BudgetResult<T> => {
      if (expired || isExpired(deadline)) {
        markExpired();
        return { kind: 'deadline' };
      }
      return { kind: 'ok', value };
    },
    (error: unknown): BudgetResult<T> => {
      if (expired || isExpired(deadline)) {
        markExpired();
        onLateError?.(error);
        return { kind: 'deadline' };
      }
      return { kind: 'error', error };
    },
  );

  const timeout = new Promise<BudgetResult<T>>((resolve) => {
    timer = setTimeout(() => {
      markExpired();
      resolve({ kind: 'deadline' });
    }, remainingAfterStart);
  });

  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
