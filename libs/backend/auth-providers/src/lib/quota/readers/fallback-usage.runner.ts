import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { killProcessTree } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  FALLBACK_CACHE_MS, FALLBACK_CLOSE_GRACE_MS, FALLBACK_MAX_OUTPUT_BYTES,
  FALLBACK_PARSE_BACKOFF_MS, FALLBACK_SHORT_BACKOFF_MS, FALLBACK_TIMEOUT_MS,
  FALLBACK_TREE_KILL_TIMEOUT_MS,
} from './fallback-usage.constants';

export type FallbackReason = 'cli-unavailable' | 'cli-not-found' | 'cli-timeout' |
  'cli-not-signed-in' | 'cli-exit-error' | 'cli-parse-failed' | 'cli-backoff' | 'cli-busy' |
  'cli-account-mismatch';
export type FallbackResult<T> =
  | { readonly ok: true; readonly value: T; readonly readAt: number }
  | { readonly ok: false; readonly reason: FallbackReason; readonly retryAfter?: number;
      readonly cwdUnavailable?: true };

/** A process handle exposes its lifetime to the runner; `dispose` releases any extra resource. */
export interface FallbackProcess {
  readonly pid?: number;
  readonly result: Promise<string>;
  readonly closed: Promise<void>;
  kill(): void;
  exited?(): boolean;
  isClosed?(): boolean;
  dispose?(): void;
  killTree?(): Promise<void>;
}
export interface FallbackExecutor {
  start(executable: string, args: readonly string[], cwd?: string): FallbackProcess;
}
export interface FallbackRequest<T> {
  readonly sourceId: string;
  readonly ownerKey: string;
  readonly executable: string;
  readonly version: string;
  readonly accountFingerprint: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  /** Created only for a new flight and removed after its process closes. */
  readonly temporaryCwd?: { create(): Promise<string>; remove(cwd: string): Promise<void> };
  readonly timeoutMs?: number;
  readonly executor: FallbackExecutor;
  readonly parse: (output: string, readAt: number) => T | undefined;
  /**
   * Runs once inside the shared flight after a successful parse and before the
   * result enters the cache, whether or not any waiter is still listening. A
   * `false` (or a throw) rejects the result: it is not cached and every waiter
   * receives `cli-account-mismatch`. Omitted, every parsed result is admitted.
   * Synchronous on purpose: no admission phase can hold the concurrency slot.
   */
  readonly admit?: (value: T) => boolean;
  readonly signal?: AbortSignal;
  /** Aborts the underlying run (for owner disposal); caller signal only ends its wait. */
  readonly runSignal?: AbortSignal;
  readonly deadline?: number;
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly killTree?: (pid: number) => Promise<void>;
}

const cache = new Map<string, { until: number; result: FallbackResult<unknown> }>();
/** A shared run, its own abort controller, and the waiters that can still leave it. */
interface Flight {
  readonly promise: Promise<FallbackResult<unknown>>;
  readonly controller: AbortController;
  waiters: number;
}
const flights = new Map<string, Flight>();
const running = new Map<string, number>();
let total = 0;
const liveRuns = new Set<FallbackProcess>();
async function stopRun(handle: FallbackProcess, treeKill: (pid: number) => Promise<void>): Promise<void> {
  // On Windows the PID of an exited parent can be reused, so never tree-kill it.
  if (process.platform === 'win32' ? handle.exited?.() : handle.isClosed?.()) return;
  try {
    const tree = handle.killTree?.() ?? (handle.pid ? treeKill(handle.pid) : Promise.resolve());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // degradation-audit: optional-capability - a failed tree kill still allows direct kill.
      await Promise.race([tree.catch(() => undefined), new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FALLBACK_TREE_KILL_TIMEOUT_MS);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } finally {
    if (!handle.exited?.()) handle.kill();
  }
}
export async function disposeFallbackRuns(): Promise<void> {
  await Promise.all([...liveRuns].map((handle) => stopRun(handle,
    (pid) => killProcessTree(pid, 'SIGKILL'))));
}
const failure = (reason: FallbackReason, retryAfter?: number): FallbackResult<never> =>
  ({ ok: false, reason, ...(retryAfter !== undefined && { retryAfter }) });
/** The caller's own end: an aborted signal or an expired deadline. Touches no shared state. */
function callerGone<T>(request: FallbackRequest<T>, now: () => number): FallbackResult<never> | undefined {
  if (request.signal?.aborted || request.runSignal?.aborted) return failure('cli-unavailable');
  if (request.deadline !== undefined && request.deadline <= now()) return failure('cli-timeout');
  return undefined;
}

export async function runFallbackUsage<T>(request: FallbackRequest<T>): Promise<FallbackResult<T>> {
  const now = request.now ?? Date.now;
  const gone = callerGone(request, now);
  if (gone) return gone;
  const key = JSON.stringify([request.sourceId, request.ownerKey, request.executable,
    request.version, request.accountFingerprint]);
  let flight: Flight | undefined;
  for (;;) {
    const cached = cache.get(key);
    if (cached && cached.until > now()) {
      if (!cached.result.ok) return failure('cli-backoff', cached.until);
      return cached.result as FallbackResult<T>;
    }
    flight = flights.get(key);
    // A cancelled flight is closed to new waiters but keeps its slot until cleanup ends.
    if (!flight?.controller.signal.aborted) break;
    const left = await waitForClose(flight, request, now);
    if (left) return left;
    // The settlement can win a same-tick race with the deadline timer or an abort,
    // so recheck the caller before it reads the cache or reserves a slot.
    const expired = callerGone(request, now);
    if (expired) return expired;
  }
  const created = !flight;
  if (!flight) {
    if (total >= 2 || (running.get(request.sourceId) ?? 0) >= 1)
      return failure('cli-busy');
    total++;
    running.set(request.sourceId, 1);
    // The flight owns its run signal: owner disposal (runSignal) or the departure
    // of the last waiter aborts it, and one waiter leaving never does.
    const controller = new AbortController();
    const ownerSignal = request.runSignal;
    const linkOwner = () => controller.abort();
    ownerSignal?.addEventListener('abort', linkOwner, { once: true });
    const admit = request.admit;
    // A timeout before any process started says nothing about the CLI.
    let spawned = false;
    const executor: FallbackExecutor = { start: (executable, args, cwd) => {
      spawned = true;
      return request.executor.start(executable, args, cwd);
    } };
    // Owner disposal that wins after a success was selected (for example during the
    // close grace) still discards it: no admission and no cache write.
    let disposed = false;
    const promise = execute({ ...request, executor, runSignal: controller.signal }).then((result) => {
      if (result.ok && ownerSignal?.aborted) { disposed = true; return failure('cli-unavailable'); }
      if (!result.ok || !admit) return result;
      let admitted = false;
      // Only a literal `true` admits, so a hook that returns a promise fails closed at once.
      try { admitted = admit(result.value) === true; }
      catch (error: unknown) {
        // degradation-audit: reported - a failed admission check rejects the result (fail closed).
        request.logger?.warn('[PlanUsage] fallback usage result admission failed', {
          reason: error instanceof Error ? error.name : 'unknown',
        });
      }
      return admitted ? result : failure('cli-account-mismatch');
    }).catch(() => failure('cli-unavailable')).then((result) => {
      // A run abandoned by its waiters says nothing about the CLI, so it sets no backoff.
      const abandoned = controller.signal.aborted && !ownerSignal?.aborted;
      const unspawnedTimeout = !result.ok && result.reason === 'cli-timeout' && !spawned;
      const until = disposed || (result.ok && ownerSignal?.aborted) ? 0 :
        result.ok ? now() + FALLBACK_CACHE_MS :
        result.cwdUnavailable || abandoned || unspawnedTimeout ? 0 :
        result.reason === 'cli-parse-failed' ? now() + FALLBACK_PARSE_BACKOFF_MS :
        ['cli-timeout', 'cli-exit-error', 'cli-not-signed-in', 'cli-unavailable'].includes(result.reason)
          ? now() + FALLBACK_SHORT_BACKOFF_MS : 0;
      const settled = result.ok ? result : { ...result, retryAfter: until || now() };
      if (until) cache.set(key, { until, result: settled });
      return settled;
    }).finally(() => {
      ownerSignal?.removeEventListener('abort', linkOwner);
      flights.delete(key);
      total--;
      running.delete(request.sourceId);
    });
    flight = { promise, controller, waiters: 0 };
    flights.set(key, flight);
  }
  const shared = flight;
  const settledFlight = shared.promise as Promise<FallbackResult<T>>;
  shared.waiters++;
  // A joiner keeps its own deadline; the creator's deadline already bounds the run itself.
  const ownDeadline = created ? undefined : request.deadline;
  // A waiter without a signal or its own deadline can never leave, so the flight keeps running for it.
  if (!request.signal && ownDeadline === undefined) return settledFlight;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = (result: FallbackResult<T>) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => {
      if (done) return;
      if (--shared.waiters === 0) shared.controller.abort();
      finish(failure('cli-unavailable'));
    };
    request.signal?.addEventListener('abort', abort, { once: true });
    if (request.signal?.aborted) abort();
    if (ownDeadline !== undefined && !done) timer = setTimeout(() => {
      // The run's own timeout decides the CLI's health, so a joiner's expiry never aborts it.
      shared.waiters--;
      finish(failure('cli-timeout'));
    }, Math.max(0, ownDeadline - now()));
    void settledFlight.then(finish, () => finish(failure('cli-unavailable')));
  });
}

/**
 * Waits for a cancelled flight to settle, bounded by the caller's own signals and
 * deadline. Resolves `undefined` once the slot is free, or the caller's failure.
 */
function waitForClose<T>(flight: Flight, request: FallbackRequest<T>, now: () => number):
  Promise<FallbackResult<never> | undefined> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result?: FallbackResult<never>) => {
      if (timer) clearTimeout(timer);
      request.signal?.removeEventListener('abort', onAbort);
      request.runSignal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => finish(failure('cli-unavailable'));
    request.signal?.addEventListener('abort', onAbort, { once: true });
    request.runSignal?.addEventListener('abort', onAbort, { once: true });
    if (request.deadline !== undefined)
      timer = setTimeout(() => finish(failure('cli-timeout')), Math.max(0, request.deadline - now()));
    // The flight promise settles only after its finally block released the slot.
    void flight.promise.then(() => finish(), () => finish());
  });
}

async function execute<T>(request: FallbackRequest<T>): Promise<FallbackResult<T>> {
  const now = request.now ?? Date.now;
  const started = now();
  if (request.deadline !== undefined && request.deadline <= started) return failure('cli-timeout');
  let processHandle: FallbackProcess | undefined;
  let cwd: string | undefined;
  let reason: FallbackReason | 'ok' = 'cli-unavailable';
  const ms = Math.max(0, Math.min(request.timeoutMs ?? FALLBACK_TIMEOUT_MS, (request.deadline ?? Infinity) - started));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let runAbort: (() => void) | undefined;
  try {
    // The budget covers the directory creation too, so a stuck mkdtemp cannot hold the flight.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('fallback-timeout')), ms);
    });
    if (request.temporaryCwd) {
      const temporaryCwd = request.temporaryCwd;
      const creation = temporaryCwd.create();
      try { cwd = await Promise.race([creation, timeout]); }
      catch (error: unknown) {
        if (error instanceof Error && error.message === 'fallback-timeout') {
          void creation.then((late) => temporaryCwd.remove(late)).catch((lateError: unknown) => {
            request.logger?.warn('[PlanUsage] late temporary usage directory cleanup failed', {
              reason: lateError instanceof Error ? lateError.name : 'unknown',
            });
          });
          reason = 'cli-timeout';
          return failure(reason);
        }
        reason = 'cli-unavailable';
        request.logger?.warn('[PlanUsage] temporary usage directory creation failed', {
          reason: error instanceof Error ? error.name : 'unknown',
        });
        return { ok: false, reason, cwdUnavailable: true };
      }
    } else cwd = request.cwd;
    if (request.runSignal?.aborted) return failure('cli-unavailable');
    processHandle = request.executor.start(request.executable, request.args, cwd);
    liveRuns.add(processHandle);
    const aborted = new Promise<never>((_, reject) => {
      runAbort = () => reject(new Error('fallback-aborted'));
      request.runSignal?.addEventListener('abort', runAbort, { once: true });
      if (request.runSignal?.aborted) runAbort();
    });
    const output = await Promise.race([processHandle.result, timeout, aborted]);
    if (Buffer.byteLength(output, 'utf8') > FALLBACK_MAX_OUTPUT_BYTES) {
      reason = 'cli-parse-failed';
      return failure(reason);
    }
    const readAt = now();
    const value = request.parse(output, readAt);
    if (value === undefined) { reason = 'cli-parse-failed'; return failure(reason); }
    reason = 'ok';
    return { ok: true, value, readAt };
  } catch (error: unknown) {
    const e = error instanceof Error ? error : undefined;
    const code = e && 'code' in e ? e.code : undefined;
    const stderr = e && 'stderr' in e && typeof e.stderr === 'string' ? e.stderr : '';
    const stdout = e && 'stdout' in e && typeof e.stdout === 'string' ? e.stdout : '';
    const killed = e && 'killed' in e && e.killed === true;
    reason = e?.message === 'output-cap' ||
      code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'cli-parse-failed' :
      e?.message === 'fallback-timeout' || code === 'ETIMEDOUT' || code === 'ABORT_ERR' || killed
      ? 'cli-timeout' : code === 'ENOENT' ? 'cli-not-found' :
      typeof code === 'number' ? /(?:sign(?:ed)?\s*in|log\s*in|login|logged\s+into|not\s+authenticated)/i.test(
        `${stderr}\n${stdout}`.slice(0, FALLBACK_MAX_OUTPUT_BYTES))
        ? 'cli-not-signed-in' : 'cli-exit-error' : 'cli-unavailable';
    return failure(reason);
  } finally {
    if (timer) clearTimeout(timer);
    if (runAbort) request.runSignal?.removeEventListener('abort', runAbort);
    if (processHandle) {
      const handle = processHandle;
      const temporaryCwd = request.temporaryCwd;
      const workingDirectory = cwd;
      void handle.closed.then(async () => {
        liveRuns.delete(handle);
        if (workingDirectory && temporaryCwd) {
          try { await temporaryCwd.remove(workingDirectory); }
          catch (error: unknown) {
            request.logger?.warn('[PlanUsage] temporary usage directory cleanup failed', {
              reason: error instanceof Error ? error.name : 'unknown',
            });
          }
        }
      }, (error: unknown) => {
        liveRuns.delete(handle);
        request.logger?.warn('[PlanUsage] process close failed', {
          reason: error instanceof Error ? error.name : 'unknown',
        });
      });
      try {
        await stopRun(handle, request.killTree ??
          ((pid) => killProcessTree(pid, 'SIGKILL')));
      } catch {
        // degradation-audit: optional-capability - cleanup still disposes a failed process handle.
      } finally {
        handle.dispose?.();
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([handle.closed, new Promise<void>((resolve) => {
            closeTimer = setTimeout(resolve, FALLBACK_CLOSE_GRACE_MS);
            closeTimer.unref?.();
          })]);
        } finally {
          if (closeTimer) clearTimeout(closeTimer);
        }
      }
    }
    if (!processHandle && cwd && request.temporaryCwd) {
      try { await request.temporaryCwd.remove(cwd); }
      catch (error: unknown) {
        request.logger?.warn('[PlanUsage] temporary usage directory cleanup failed', {
          reason: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
    request.logger?.[reason === 'ok' ? 'debug' : 'warn']('[PlanUsage] fallback', {
      sourceId: request.sourceId, reason, elapsedBucket: Math.floor((now() - started) / 1000),
    });
  }
}

type NodeFallbackChild = Pick<ChildProcess,
  'pid' | 'stdout' | 'stderr' | 'kill' | 'exitCode' | 'signalCode'> &
  Pick<EventEmitter, 'on' | 'once'>;
export function createNodeFallbackExecutor(
  spawnProcess: (executable: string, args: string[], options: SpawnOptions) => NodeFallbackChild = spawn,
): FallbackExecutor {
  return { start(executable, args, cwd) {
    const child = spawnProcess(executable, [...args], { shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let output = '';
    let stderr = '';
    let size = 0;
    const result = new Promise<string>((resolve, reject) => {
      const append = (chunk: Buffer) => {
        size += chunk.length;
        if (size > FALLBACK_MAX_OUTPUT_BYTES) { reject(new Error('output-cap')); }
        else output += chunk.toString('utf8');
      };
      child.stdout?.on('data', append);
      child.stderr?.on('data', (chunk: Buffer) => { size += chunk.length; if (size > FALLBACK_MAX_OUTPUT_BYTES) { reject(new Error('output-cap')); } else stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve(output) : reject(Object.assign(
        new Error('exit'), { code, stderr })));
    });
    let exited = child.exitCode !== null || child.signalCode !== null;
    let fullyClosed = false;
    child.once('exit', () => { exited = true; });
    const closed = new Promise<void>((resolve) => child.once('close', () => { exited = true; fullyClosed = true; resolve(); }));
    return { pid: child.pid, result, closed, kill: () => child.kill(), exited: () => exited,
      isClosed: () => fullyClosed };
  } };
}
export const nodeFallbackExecutor = createNodeFallbackExecutor();

