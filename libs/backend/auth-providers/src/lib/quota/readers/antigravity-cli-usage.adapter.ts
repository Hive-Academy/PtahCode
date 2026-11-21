/**
 * Antigravity headless CLI usage source: `agy -p /usage --output-format json`.
 *
 * The process runs through `runFallbackUsage`: argument array without a shell,
 * stdin ignored, a temporary working directory, an output cap, a timeout that
 * kills the process tree, and the runner's failure backoff. A result counts only
 * when it is the `/usage` command output; a reply that took a model turn
 * (`num_turns > 0`) is rejected and backs off for the long parse backoff, because
 * repeating it would spend the user's quota. Such a reply also latches that
 * executable off for the rest of the process: an `agy` build that answers
 * `/usage` with a model turn would otherwise spend a turn after every backoff.
 * Both the latch and the store-ownership check run inside the shared runner
 * flight (`admit`), so they hold even when every waiter cancelled.
 * CLI output is never logged.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import whichLib from 'which';
import { z } from 'zod';
import type { PlanLimitWindow } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  nodeFallbackExecutor,
  runFallbackUsage,
  type FallbackExecutor,
  type FallbackReason,
} from './fallback-usage.runner';
import {
  ANTIGRAVITY_FALLBACK_TIMEOUT_MS,
  FALLBACK_PARSE_BACKOFF_MS,
} from './fallback-usage.constants';
import { parseAntigravityUsageJson } from './antigravity-usage-json.parser';

export const ANTIGRAVITY_CLI_EXECUTABLE = 'agy';
export const ANTIGRAVITY_CLI_USAGE_ARGS = ['-p', '/usage', '--output-format', 'json'] as const;

/** Runner reasons plus a rejected reply that took a model turn or read another account. */
export type AntigravityCliFailureCause = Exclude<FallbackReason, 'cli-account-mismatch'> |
  'cli-model-turn' | 'account-mismatch';

export type AntigravityCliUsageResult =
  | { readonly ok: true; readonly windows: PlanLimitWindow[]; readonly readAt: number;
      /** Drops this result from reuse: the next read for the same owner and fingerprint runs again. */
      readonly discard?: () => void }
  | { readonly ok: false; readonly cause: AntigravityCliFailureCause; readonly retryAfter?: number };

export interface AntigravityCliUsageRequest {
  readonly signal?: AbortSignal;
  readonly deadline: number;
  readonly ownerKey: string;
  readonly accountFingerprint: string;
  /**
   * Reads the store fingerprint again when the shared run finishes. A value other
   * than `accountFingerprint` means the store account changed during the run: the
   * result is never cached and every waiter gets `account-mismatch`.
   */
  readonly currentAccountFingerprint?: () => string;
}

export type AntigravityCliUsageReader = (
  request: AntigravityCliUsageRequest,
) => Promise<AntigravityCliUsageResult>;

export interface AntigravityCliUsageDeps {
  readonly resolveExecutable?: () => Promise<string | undefined>;
  readonly executor?: FallbackExecutor;
  readonly temporaryCwd?: { create(): Promise<string>; remove(cwd: string): Promise<void> };
  readonly killTree?: (pid: number) => Promise<void>;
  readonly now?: () => number;
  readonly logger?: Logger;
}

type ParsedUsage =
  | { readonly kind: 'usage'; readonly windows: PlanLimitWindow[] }
  | { readonly kind: 'model-turn' };

const TurnSchema = z.object({ num_turns: z.number().optional() }).passthrough();

/** A reply with a model turn is never a usage result, even when it mentions usage. */
export function parseAntigravityCliOutput(output: string, readAt: number): ParsedUsage | undefined {
  let body: unknown;
  try { body = JSON.parse(output); } catch {
    // degradation-audit: optional-capability - non-JSON output is an unparseable reply (cli-parse-failed); never logged.
    return undefined;
  }
  const turns = TurnSchema.safeParse(body);
  if (!turns.success) return undefined;
  if ((turns.data.num_turns ?? 0) > 0) return { kind: 'model-turn' };
  const windows = parseAntigravityUsageJson(output, readAt);
  return windows ? { kind: 'usage', windows } : undefined;
}

/**
 * Executables whose `/usage` reply took a model turn. No version gate exists:
 * the runner never resolves the CLI version and a second spawn only to read it
 * is not worth its cost, so this latch is the only layer.
 */
const turnTakingExecutables = new Set<string>();

/** Test-only: clears the process-lifetime model-turn latch. */
export function resetAntigravityCliTurnLatchForTests(): void {
  turnTakingExecutables.clear();
}

/**
 * Rejection generation per executable, owner and fingerprint. The runner caches
 * a success under the pre-run fingerprint and has no invalidation hook, so a
 * result the caller rejected (the store account changed during the run) moves
 * the next read to a fresh runner cache key instead of replaying those windows.
 */
const rejectedGenerations = new Map<string, number>();

const productionCwd = {
  create: () => mkdtemp(join(tmpdir(), 'ptah-agy-usage-')),
  remove: (cwd: string) => rm(cwd, { recursive: true, force: true }),
};

async function resolveAgy(): Promise<string | undefined> {
  const match = await whichLib(ANTIGRAVITY_CLI_EXECUTABLE, { nothrow: true });
  return match ?? undefined;
}

export function createAntigravityCliUsageReader(deps: AntigravityCliUsageDeps = {}): AntigravityCliUsageReader {
  const now = deps.now ?? Date.now;
  const resolveExecutable = deps.resolveExecutable ?? resolveAgy;
  const executor = deps.executor ?? nodeFallbackExecutor;
  const temporaryCwd = deps.temporaryCwd ?? productionCwd;
  const modelTurnBackoff = new Map<string, number>();
  return async (request) => {
    const executable = await resolveExecutable();
    if (!executable) return { ok: false, cause: 'cli-not-found' };
    const backoffKey = JSON.stringify([executable, request.ownerKey, request.accountFingerprint]);
    const until = modelTurnBackoff.get(backoffKey);
    if (until !== undefined) {
      if (until > now()) return { ok: false, cause: 'cli-backoff', retryAfter: until };
      modelTurnBackoff.delete(backoffKey);
    }
    if (turnTakingExecutables.has(executable)) return { ok: false, cause: 'cli-model-turn' };
    const generation = rejectedGenerations.get(backoffKey) ?? 0;
    const accountFingerprint = generation === 0 ? request.accountFingerprint
      : `${request.accountFingerprint}#rejected-${generation}`;
    const latchModelTurn = (): number => {
      const retryAfter = now() + FALLBACK_PARSE_BACKOFF_MS;
      modelTurnBackoff.set(backoffKey, retryAfter);
      if (!turnTakingExecutables.has(executable)) {
        turnTakingExecutables.add(executable);
        deps.logger?.warn(
          '[PlanUsage] Antigravity CLI usage reply took a model turn; CLI usage disabled for this process',
          { providerId: 'antigravity', retryAfter },
        );
      }
      return retryAfter;
    };
    // Runs inside the shared flight, before its result is cached and whether or
    // not this waiter is still listening.
    const admit = (parsed: ParsedUsage): boolean => {
      if (parsed.kind === 'model-turn') { latchModelTurn(); return true; }
      return !request.currentAccountFingerprint ||
        request.currentAccountFingerprint() === request.accountFingerprint;
    };
    const result = await runFallbackUsage<ParsedUsage>({
      sourceId: 'antigravity', ownerKey: request.ownerKey, executable, version: 'usage-json-v2',
      accountFingerprint, args: ANTIGRAVITY_CLI_USAGE_ARGS,
      executor, temporaryCwd, timeoutMs: ANTIGRAVITY_FALLBACK_TIMEOUT_MS,
      parse: parseAntigravityCliOutput, admit, signal: request.signal, deadline: request.deadline,
      now, logger: deps.logger, ...(deps.killTree && { killTree: deps.killTree }),
    });
    if (!result.ok) return {
      ok: false, cause: result.reason === 'cli-account-mismatch' ? 'account-mismatch' : result.reason,
      ...(result.retryAfter !== undefined && { retryAfter: result.retryAfter }) };
    if (result.value.kind === 'model-turn') {
      const retryAfter = modelTurnBackoff.get(backoffKey) ?? latchModelTurn();
      return { ok: false, cause: 'cli-model-turn', retryAfter };
    }
    const discard = () => rejectedGenerations.set(backoffKey,
      Math.max(rejectedGenerations.get(backoffKey) ?? 0, generation + 1));
    return { ok: true, windows: result.value.windows, readAt: result.readAt, discard };
  };
}
