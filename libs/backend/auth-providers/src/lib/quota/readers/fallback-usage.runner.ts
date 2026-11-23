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
  'cli-not-signed-in' | 'cli-exit-error' | 'cli-parse-failed' | 'cli-backoff' | 'cli-busy';
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
  /** How long a successful reading is reused; defaults to `FALLBACK_CACHE_MS`. */
  readonly cacheMs?: number;
  /**
   * Set to `false` when the caller keeps its own failure backoff. Failures
   * are then not cached here, so a caller-approved retry is never blocked.
   */
  readonly cacheFailures?: boolean;
  /** Decides per value whether a successful run is reused for `cacheMs`; default: always. */
  readonly cacheable?: (value: T) => boolean;
  readonly executor: FallbackExecutor;
  readonly parse: (output: string, readAt: number) => T | undefined;
  readonly signal?: AbortSignal;
  /** Aborts the underlying run (for owner disposal); caller signal only ends its wait. */
  readonly runSignal?: AbortSignal;
  readonly deadline?: number;
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly killTree?: (pid: number) => Promise<void>;
}

const cache = new Map<string, { until: number; result: FallbackResult<unknown> }>();
const flights = new Map<string, Promise<FallbackResult<unknown>>>();
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

export async function runFallbackUsage<T>(request: FallbackRequest<T>): Promise<FallbackResult<T>> {
  const now = request.now ?? Date.now;
  if (request.signal?.aborted || request.runSignal?.aborted) return failure('cli-unavailable');
  const key = JSON.stringify([request.sourceId, request.ownerKey, request.executable,
    request.version, request.accountFingerprint]);
  const cached = cache.get(key);
  if (cached && cached.until > now()) {
    if (!cached.result.ok) return failure('cli-backoff', cached.until);
    return cached.result as FallbackResult<T>;
  }
  let flight = flights.get(key) as Promise<FallbackResult<T>> | undefined;
  if (!flight) {
    if (total >= 2 || (running.get(request.sourceId) ?? 0) >= 1)
      return failure('cli-busy');
    total++;
    running.set(request.sourceId, 1);
    flight = execute(request).catch(() => failure('cli-unavailable')).then((result) => {
      const until = result.ok ? (request.cacheable?.(result.value) === false ? 0 : now() + (request.cacheMs ?? FALLBACK_CACHE_MS)) :
        result.cwdUnavailable ? 0 :
        result.reason === 'cli-parse-failed' ? now() + FALLBACK_PARSE_BACKOFF_MS :
        ['cli-timeout', 'cli-exit-error', 'cli-not-signed-in', 'cli-unavailable'].includes(result.reason)
          ? now() + FALLBACK_SHORT_BACKOFF_MS : 0;
      const settled = result.ok ? result : { ...result, retryAfter: until || now() };
      if (until && (result.ok || request.cacheFailures !== false)) cache.set(key, { until, result: settled });
      return settled;
    }).finally(() => {
      flights.delete(key);
      total--;
      running.delete(request.sourceId);
    });
    flights.set(key, flight);
  }
  if (!request.signal) return flight;
  return new Promise((resolve) => {
    const abort = () => { request.signal?.removeEventListener('abort', abort); resolve(failure('cli-unavailable')); };
    request.signal?.addEventListener('abort', abort, { once: true });
    if (request.signal?.aborted) abort();
    void flight.then((result) => { request.signal?.removeEventListener('abort', abort); resolve(result); },
      () => { request.signal?.removeEventListener('abort', abort); resolve(failure('cli-unavailable')); });
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
      } catch (_error: unknown) {
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

