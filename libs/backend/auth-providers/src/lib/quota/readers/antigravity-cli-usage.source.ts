/**
 * Antigravity plan usage from `agy -p /usage` (issue 1459, TASK_2026_2302).
 *
 * The last source of the Antigravity chain, after the OAuth token file and
 * the IDE language server: plain `agy acp` reports no quota and writes no
 * token file. See `.ptah/specs/TASK_2026_2302_usage/decision-agy-cli-usage.md`.
 *
 * Guarded so it never bills more than one model turn per process:
 * - argument array, no shell (a shell or MSYS rewrites `/usage` into a path
 *   and the text reaches the model), stdin ignored, a fresh empty private
 *   temporary working directory, an allow-listed environment without API
 *   keys (the reading must be the signed-in agy account's);
 * - `--output-format json`, `--print-timeout`, and the cheapest model in case
 *   a future agy sends `/usage` to a model;
 * - a reading counts only when agy exits 0 with `command.name === 'usage'`,
 *   `num_turns === 0` and every usage counter at 0;
 * - after every run that started a process, stdout is inspected whatever the
 *   exit code: a turn count above 0 or a non-zero counter trips a
 *   process-lifetime circuit breaker (billing proof);
 * - a run our timeout had to kill is not billing proof by itself (a slow
 *   start can cause it). It backs off with a growing delay, and only
 *   {@link ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS} kills in a row disable the
 *   source. A manual refresh can still try again, at most once per
 *   {@link ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS} after a run; a billing trip is final;
 * - the stage starts only with its full time window left; otherwise it is
 *   deferred, never squeezed.
 *
 * Concurrent reads share one process (`runFallbackUsage`); a reading is
 * reused for {@link ANTIGRAVITY_CLI_CACHE_MS} and a failure backs off, so a
 * chat turn never starts its own `agy`.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { z } from 'zod';
import { killProcessTree } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { PlanLimitStatusReason, PlanLimitWindow } from '@ptah-extension/shared';
import {
  runFallbackUsage,
  type FallbackExecutor,
  type FallbackReason,
} from './fallback-usage.runner';
import { FALLBACK_PARSE_BACKOFF_MS, FALLBACK_SHORT_BACKOFF_MS } from './fallback-usage.constants';
import { parseAntigravityUsageGroups, parseAntigravityUsageTsv } from './antigravity-usage.parser';
import type { AntigravityCliCause, AntigravityUsageReading } from './antigravity-oauth-plan-usage.reader';
import { createCachedAgySignIn, readAgySignIn, type AgySignInState } from './antigravity-sign-in';

/** agy's own `--print-timeout`: agy ends a slow run by itself, with a clean exit. */
export const ANTIGRAVITY_CLI_PRINT_TIMEOUT_MS = 10_000;
/** Extra time after agy's own timeout before Ptah kills the process. */
export const ANTIGRAVITY_CLI_KILL_GRACE_MS = 3_000;
/**
 * The full time window one run gets, and the hard kill at its end. A probe
 * answers in 3-4 s, but app start can slow it down (file indexing, other
 * readers). The kill comes after agy's own 10 s timeout, never before it, so
 * a slow run ends by agy itself and a kill is the last resort. The chain
 * budget (`ANTIGRAVITY_CHAIN_TIMEOUT_MS`) leaves room for this window after
 * the two IDE stages.
 */
export const ANTIGRAVITY_CLI_TIMEOUT_MS =
  ANTIGRAVITY_CLI_PRINT_TIMEOUT_MS + ANTIGRAVITY_CLI_KILL_GRACE_MS;
/** Kills in a row (no completed run between them) that disable the source. */
export const ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS = 3;
/** Wait after the first and the second kill in a row. */
export const ANTIGRAVITY_CLI_KILL_BACKOFF_MS: readonly number[] = [30_000, 120_000];
/** A manual refresh starts a new run only when the last run ended this long ago. */
export const ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS = 10_000;
/**
 * How long one successful reading is reused. Kept short: agy exposes no
 * account identity to check, so after an agy account switch that the CLI
 * store does not show, the previous account's windows can show this long.
 */
export const ANTIGRAVITY_CLI_CACHE_MS = 60_000;
/** The sign-in presence check may hold the stage this long before it counts as unknown. */
export const ANTIGRAVITY_CLI_SIGN_IN_WAIT_MS = 1_000;
/** stdout kept per run; more is treated as a run that did not answer like `/usage`. */
export const ANTIGRAVITY_CLI_MAX_STDOUT_BYTES = 48 * 1024;
/**
 * The model passed with `/usage`. agy 1.5.14 answers `/usage` itself; the
 * model is only a guard in case a later build sends it to one. This id is
 * the one the 2026-11-22 probe ran with.
 */
export const ANTIGRAVITY_CLI_MODEL = 'gemini-4-hydrogen-low';
export const ANTIGRAVITY_CLI_ARGS: readonly string[] = [
  '-p', '/usage', '--output-format', 'json', '--print-timeout',
  `${ANTIGRAVITY_CLI_PRINT_TIMEOUT_MS / 1000}s`,
  '--model', ANTIGRAVITY_CLI_MODEL,
];

/**
 * Environment names agy may need: process basics, the profile and keyring
 * location, proxies and certificates. API keys and ADC variables are left
 * out on purpose: with them agy would read another credential's quota than
 * the signed-in account the card shows. Nothing else from Ptah's environment
 * (MCP endpoints, provider keys, session ids) reaches agy.
 */
const AGY_ENV_ALLOW = new Set([
  'path', 'pathext', 'systemroot', 'systemdrive', 'windir', 'comspec',
  'temp', 'tmp', 'tmpdir', 'userprofile', 'appdata', 'localappdata',
  'programdata', 'programfiles', 'programfiles(x86)', 'homedrive', 'homepath',
  'home', 'user', 'username', 'userdomain', 'logname', 'computername', 'os',
  'processor_architecture', 'number_of_processors', 'lang', 'lc_all',
  'xdg_config_home', 'xdg_data_home', 'xdg_cache_home', 'xdg_state_home',
  'xdg_runtime_dir', 'dbus_session_bus_address',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy', 'ssl_cert_file', 'ssl_cert_dir',
  'antigravity_home',
]);

export function antigravityCliEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name, value]) =>
    value !== undefined && AGY_ENV_ALLOW.has(name.toLowerCase())));
}

/**
 * Executables to try. POSIX: `agy` on PATH. Windows: the first `agy.exe` on
 * PATH, then `%LOCALAPPDATA%\agy\bin\agy.exe`. A `.cmd`/`.bat` shim is
 * skipped: it needs a shell, and a shell is exactly what rewrites `/usage`.
 */
export function antigravityCliCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): readonly string[] {
  if (platform !== 'win32') return ['agy'];
  const variable = (name: string) =>
    Object.entries(env).find(([key]) => key.toLowerCase() === name)?.[1]?.trim() ?? '';
  const candidates: string[] = [];
  const onPath = variable('path').split(';').map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean).map((dir) => win32.join(dir, 'agy.exe')).find((path) => exists(path));
  if (onPath) candidates.push(onPath);
  const localAppData = variable('localappdata');
  if (localAppData) {
    const installed = win32.join(localAppData, 'agy', 'bin', 'agy.exe');
    if (!candidates.some((path) => path.toLowerCase() === installed.toLowerCase()) && exists(installed))
      candidates.push(installed);
  }
  return candidates;
}

/** What one run reports to the parser: its exit code and its stdout. */
const RunSchema = z.object({ exitCode: z.number().nullable(), stdout: z.string() });
const TurnProofSchema = z.object({
  num_turns: z.literal(0),
  usage: z.record(z.string(), z.unknown()),
}).passthrough();
const ReplySchema = z.object({
  response: z.string().optional(),
  command: z.object({ name: z.string(), data: z.unknown().optional() }).passthrough().optional(),
  status: z.string().optional(),
  error: z.union([z.string(), z.object({ message: z.string() }).passthrough()]).optional(),
}).passthrough();

type AgyFailureReason = Extract<PlanLimitStatusReason, 'cli-exit-error' | 'cli-parse-failed' | 'cli-not-signed-in'>;
export type AgyUsageOutput =
  | { readonly kind: 'windows'; readonly windows: PlanLimitWindow[] }
  /** stdout shows a model turn or non-zero token counters. */
  | { readonly kind: 'billed' }
  | { readonly kind: 'failed'; readonly reason: AgyFailureReason };

function countersAllZero(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (value !== null && typeof value === 'object')
    return Object.values(value).every(countersAllZero);
  return true;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A model turn or a non-zero usage counter in one agy JSON reply. */
function hasBillingEvidence(body: Record<string, unknown>): boolean {
  return (typeof body['num_turns'] === 'number' && body['num_turns'] > 0) ||
    (plainObject(body['usage']) && !countersAllZero(body['usage']));
}

/** True when the partial stdout of a killed run already shows billing evidence. */
export function killedRunShowsBilling(partialStdout: string): boolean {
  const body = lastJsonObject(partialStdout);
  return body !== undefined && hasBillingEvidence(body);
}

/** The last complete JSON object in `text`, so a banner line before it is tolerated. */
export function lastJsonObject(text: string): Record<string, unknown> | undefined {
  const end = text.lastIndexOf('}');
  for (let start = text.lastIndexOf('{', end); start >= 0; start = start === 0 ? -1 : text.lastIndexOf('{', start - 1)) {
    try {
      const value: unknown = JSON.parse(text.slice(start, end + 1));
      if (plainObject(value)) return value;
    } catch {
      // degradation-audit: optional-capability - a slice that is not one JSON object; an earlier brace may start it.
    }
  }
  return undefined;
}

/** agy's own JSON error naming a missing sign-in; stderr text never counts. */
function repliesNotSignedIn(reply: z.infer<typeof ReplySchema>): boolean {
  const text = typeof reply.error === 'string' ? reply.error : reply.error?.message ?? '';
  return /not\s+(?:signed|logged)\s+in|sign[\s-]?in\s+required|login\s+required|unauthenticated/i.test(text);
}

/**
 * Reads one run. Billing evidence beats everything; a reading is accepted
 * only with exit 0 and the full no-turn proof.
 */
export function parseAgyUsageOutput(run: string, observedAt: number): AgyUsageOutput {
  let parsedRun: z.infer<typeof RunSchema>;
  try {
    parsedRun = RunSchema.parse(JSON.parse(run));
  } catch {
    // degradation-audit: reported - an unreadable run record is returned as a parse failure and backs off.
    return { kind: 'failed', reason: 'cli-parse-failed' };
  }
  const { exitCode, stdout } = parsedRun;
  const fallback: AgyUsageOutput = { kind: 'failed', reason: exitCode === 0 ? 'cli-parse-failed' : 'cli-exit-error' };
  const body = lastJsonObject(stdout);
  if (!body) return fallback;
  if (hasBillingEvidence(body)) return { kind: 'billed' };
  if (!TurnProofSchema.safeParse(body).success) return fallback;
  const reply = ReplySchema.safeParse(body);
  if (!reply.success) return fallback;
  if (repliesNotSignedIn(reply.data)) return { kind: 'failed', reason: 'cli-not-signed-in' };
  if (exitCode !== 0) return fallback;
  const { command, response } = reply.data;
  const windows = command ? command.name === 'usage' ? parseAntigravityUsageGroups(command.data, observedAt) : undefined
    : response !== undefined ? parseAntigravityUsageTsv(response, observedAt) : undefined;
  return windows ? { kind: 'windows', windows } : fallback;
}

type AgyChild = Pick<ChildProcess, 'pid' | 'stdout' | 'kill'> & Pick<EventEmitter, 'on' | 'once'>;
export type AgySpawn = (executable: string, args: string[], options: SpawnOptions) => AgyChild;

/**
 * The runner's process executor for agy. A run resolves with its exit code
 * and stdout whatever the exit code (so stdout is always inspected) and
 * rejects only when no process ran or stdout overflowed. `onKill` fires once
 * per run when a started process has to be killed; it gets the stdout read
 * so far, so the caller can look for billing evidence.
 */
export function createAntigravityCliExecutor(
  env: NodeJS.ProcessEnv,
  onKill: (partialStdout: string) => void,
  spawnProcess: AgySpawn = spawn,
  killTree: (pid: number) => Promise<void> = (pid) => killProcessTree(pid, 'SIGKILL'),
): FallbackExecutor {
  return { start(executable, args, cwd) {
    const child = spawnProcess(executable, [...args], { shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'], cwd, env });
    const pid = child.pid;
    let exited = false;
    let closedFully = false;
    let stdout = '';
    let size = 0;
    let killReported = false;
    // A run stopped for too much output is a parse failure, not a slow run.
    let overflowed = false;
    const reportKill = (): void => {
      if (killReported || overflowed) return;
      killReported = true;
      onKill(stdout);
    };
    const result = new Promise<string>((resolve, reject) => {
      child.stdout?.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > ANTIGRAVITY_CLI_MAX_STDOUT_BYTES) {
          overflowed = true;
          reject(new Error('output-cap'));
        }
        else stdout += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code: number | null) => resolve(JSON.stringify({ exitCode: code, stdout })));
    });
    child.once('exit', () => { exited = true; });
    const closed = new Promise<void>((resolve) => child.once('close', () => {
      exited = true;
      closedFully = true;
      resolve();
    }));
    // A spawn that failed (agy not found) has no pid and never ran: no kill counts.
    return {
      pid, result, closed, exited: () => exited, isClosed: () => closedFully,
      kill: () => { if (pid) reportKill(); child.kill(); },
      killTree: async () => {
        if (!pid) return;
        reportKill();
        await killTree(pid);
      },
    };
  } };
}

const productionCwd = {
  create: () => mkdtemp(join(tmpdir(), 'ptah-agy-usage-')),
  remove: (cwd: string) => rm(cwd, { recursive: true, force: true }),
};

/**
 * The keyring presence alone: environment API keys are not forwarded to agy
 * (see {@link AGY_ENV_ALLOW}), so they must not count as its sign-in here.
 */
const readKeyringSignIn = createCachedAgySignIn(() =>
  readAgySignIn({ env: { SystemRoot: process.env['SystemRoot'] } }));

/**
 * Process-lifetime circuit breaker: the cause it tripped on, once tripped.
 * `billed` is final. `killed` (repeated kills) ends only on a manual refresh
 * that reads a good answer.
 */
let disabledBy: 'billed' | 'killed' | undefined;
/**
 * State of agy runs, shared by every owner: agy has one signed-in account per
 * process, so one run history is enough.
 * Kills in a row, without a completed run between them:
 */
let killStreak = 0;
/** Number of kills seen; a change during a read shows that the read ended in a kill. */
let killsSeen = 0;
/** No new run before this instant after a kill without billing evidence. Set by the kill, so it holds whoever waited for the run. */
let killRetryAt = 0;
/** When the last agy process started or ended; paces manual refreshes. */
let lastRunAt = 0;
/** Failure backoff per owner and account, so a failing read does not re-spawn on every chain read. */
const backoff = new Map<string, { readonly until: number; readonly reading: AntigravityUsageReading }>();

export function resetAntigravityCliUsageForTests(): void {
  disabledBy = undefined;
  killStreak = 0;
  killsSeen = 0;
  killRetryAt = 0;
  lastRunAt = 0;
  backoff.clear();
}

export interface AntigravityCliUsageOptions {
  readonly ownerKey: string;
  /**
   * The agy account the read is for, as far as the CLI store names it
   * (`currentAntigravityStoreOwner().key`). Part of every cache key, so an
   * account switch the store shows never serves the previous account.
   */
  readonly accountFingerprint: string;
  /** What the chain budget has left; below the full window the stage is deferred. */
  readonly budgetMs: number;
  /** A manual refresh: may start a run through a kill backoff or a kill-disable. */
  readonly refresh?: boolean;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly env?: NodeJS.ProcessEnv;
  readonly executables?: readonly string[];
  readonly spawnProcess?: AgySpawn;
  readonly killTree?: (pid: number) => Promise<void>;
  readonly temporaryCwd?: { create(): Promise<string>; remove(cwd: string): Promise<void> };
  readonly readSignIn?: () => Promise<AgySignInState>;
}

type CliCause = AntigravityCliCause | 'timeout';

function cliFailure(reason: PlanLimitStatusReason, cause: CliCause): AntigravityUsageReading {
  return { status: 'service-unavailable', statusReason: reason, windowSetEstablished: false,
    windows: [], sourceFailures: [{ source: 'cli-command', reason, cause }] };
}

function runnerFailure(reason: FallbackReason): AntigravityUsageReading {
  // The runner's stderr sign-in guess never reaches the user: only the
  // keyring check or agy's JSON reply may say "not signed in".
  const shown = reason === 'cli-busy' ? 'cli-unavailable' : reason === 'cli-not-signed-in' ? 'cli-exit-error' : reason;
  return cliFailure(shown, reason);
}

/** A keyring answer, or `unknown` when the check fails or outlasts its wait. */
async function signInState(
  read: () => Promise<AgySignInState>,
  waitMs: number,
  logger: Logger,
): Promise<AgySignInState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read(), new Promise<AgySignInState>((resolve) => {
      timer = setTimeout(() => resolve('unknown'), waitMs);
    })]);
  } catch (error: unknown) {
    // degradation-audit: reported - logged; an unreadable keyring lets agy answer for itself.
    logger.debug('[PlanUsage] agy sign-in check failed; running the usage command', {
      error: error instanceof Error ? error.name : 'unknown',
    });
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function trip(cause: 'billed', logger: Logger): void {
  if (disabledBy === 'billed') return;
  disabledBy = cause;
  logger.warn('[PlanUsage] agy /usage run showed a model turn; CLI usage source disabled until restart', {
    providerId: 'antigravity', cause,
  });
}

/**
 * A kill is not billing proof by itself: app start can make a run slow.
 * Without billing evidence the kill backs off and counts; the source stops
 * only after {@link ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS} kills in a row.
 */
function recordKill(partialStdout: string, logger: Logger, now: () => number): void {
  if (killedRunShowsBilling(partialStdout)) {
    trip('billed', logger);
    return;
  }
  killStreak += 1;
  killsSeen += 1;
  killRetryAt = now() + killBackoffMs();
  if (killStreak >= ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS) {
    disabledBy ??= 'killed';
    // A kill has no stdout to inspect when agy prints its JSON only at the end,
    // so a model turn could have run unseen. Log it for the record.
    logger.warn('[PlanUsage] agy /usage run killed repeatedly; CLI usage source disabled until a manual refresh succeeds', {
      providerId: 'antigravity', kills: killStreak,
    });
    return;
  }
  logger.warn('[PlanUsage] agy /usage run killed without billing evidence; will retry after a delay', {
    providerId: 'antigravity', kills: killStreak,
    retryAfterMs: killBackoffMs(),
  });
}

function killBackoffMs(): number {
  const steps = ANTIGRAVITY_CLI_KILL_BACKOFF_MS;
  return steps[Math.min(Math.max(killStreak, 1), steps.length) - 1] ?? FALLBACK_SHORT_BACKOFF_MS;
}

function backoffFor(reading: AntigravityUsageReading): number {
  return reading.statusReason === 'cli-parse-failed' ? FALLBACK_PARSE_BACKOFF_MS : FALLBACK_SHORT_BACKOFF_MS;
}

const disabledReading = (): AntigravityUsageReading => cliFailure('cli-unavailable', 'cli-disabled');

/** One guarded `/usage` read for the Antigravity chain's CLI stage. */
export async function readAntigravityCliUsage(
  signal: AbortSignal | undefined,
  options: AntigravityCliUsageOptions,
): Promise<AntigravityUsageReading> {
  const now = options.now ?? Date.now;
  const key = JSON.stringify([options.ownerKey, options.accountFingerprint]);
  // A billing trip is final. A manual refresh may pass a kill backoff or a
  // kill-disable, but not faster than one run per refresh gap.
  if (disabledBy === 'billed') return disabledReading();
  const mayRetry = options.refresh === true && now() - lastRunAt >= ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS;
  if (disabledBy === 'killed' && !mayRetry) return disabledReading();
  // The kill sets its own retry time: it holds for a caller that stopped waiting too.
  if (killRetryAt > now() && !mayRetry) return cliFailure('cli-timeout', 'cli-timeout');
  const held = backoff.get(key);
  if (held && held.until > now() && !mayRetry) return held.reading;
  const killsBefore = killsSeen;
  const reading = await readOnce(signal, options, now, mayRetry);
  const cause = reading.sourceFailures?.[0]?.cause;
  // No backoff for a success, the breaker, a run still owned by another
  // caller, a caller that stopped waiting (its run goes on and settles), or a
  // deferral: the short budget belonged to that request, and the next one
  // with a full window must run.
  // A read that ended in a kill is held by `killRetryAt`, not by this map.
  // A caller that stopped waiting leaves the map alone: the shared run records
  // its own failure (see `parse`), and the abort reading is not a failure of agy.
  if (signal?.aborted) return reading;
  if (reading.status === 'available' || cause === 'cli-disabled' || cause === 'cli-busy'
    || cause === 'cli-deferred' || killsSeen !== killsBefore)
    backoff.delete(key);
  else backoff.set(key, { until: now() + backoffFor(reading), reading });
  return reading;
}

async function readOnce(
  signal: AbortSignal | undefined,
  options: AntigravityCliUsageOptions,
  now: () => number,
  mayRetry: boolean,
): Promise<AntigravityUsageReading> {
  const { logger } = options;
  const key = JSON.stringify([options.ownerKey, options.accountFingerprint]);
  const blocked = (): boolean => disabledBy === 'billed' || (disabledBy === 'killed' && !mayRetry);
  const spare = options.budgetMs - ANTIGRAVITY_CLI_TIMEOUT_MS;
  // Never squeeze a run: a short kill could cut off an honest slow answer
  // and still bill a turn. The next read with a full window runs it.
  if (spare < 0) return cliFailure('usage-budget-exhausted', 'cli-deferred');
  const executables = options.executables ?? antigravityCliCandidates(options.env);
  if (executables.length === 0) return cliFailure('cli-not-found', 'cli-not-found');
  if (spare > 0 && await signInState(options.readSignIn ?? readKeyringSignIn,
    Math.min(ANTIGRAVITY_CLI_SIGN_IN_WAIT_MS, spare), logger) === 'signed-out')
    return cliFailure('cli-not-signed-in', 'signed-out');
  const inner = createAntigravityCliExecutor(antigravityCliEnv(options.env ?? process.env),
    (partialStdout) => recordKill(partialStdout, logger, now), options.spawnProcess, options.killTree);
  const executor: FallbackExecutor = { start: (executable, args, cwd) => {
    lastRunAt = now();
    const handle = inner.start(executable, args, cwd);
    // The refresh gap counts from the end of a run, not from its start.
    void handle.closed.then(() => { lastRunAt = now(); });
    return handle;
  } };
  let failure: FallbackReason | undefined;
  for (const executable of executables) {
    if (blocked()) return disabledReading();
    // Another run may have been killed while this read waited for the sign-in check.
    if (killRetryAt > now() && !mayRetry) return cliFailure('cli-timeout', 'cli-timeout');
    const result = await runFallbackUsage({
      sourceId: 'antigravity', ownerKey: options.ownerKey, executable, version: 'usage-json-v3',
      accountFingerprint: options.accountFingerprint, args: ANTIGRAVITY_CLI_ARGS, executor,
      temporaryCwd: options.temporaryCwd ?? productionCwd, timeoutMs: ANTIGRAVITY_CLI_TIMEOUT_MS,
      deadline: now() + ANTIGRAVITY_CLI_TIMEOUT_MS, cacheMs: ANTIGRAVITY_CLI_CACHE_MS,
      // This source owns its failure backoff (kill backoff, refresh bypass).
      cacheFailures: false,
      // A parsed failure (agy error reply) is not a reading: the source backoff holds it, so a refresh can run again.
      cacheable: (output) => output.kind === 'windows',
      // Trip inside the shared flight: a caller that stopped waiting never
      // sees the billed result, but the flight still parses and caches it.
      parse: (run: string, observedAt: number) => {
        const parsed = parseAgyUsageOutput(run, observedAt);
        if (parsed.kind === 'billed') trip('billed', logger);
        else {
          // A failed reply holds back the next run even when the caller that
          // started it stopped waiting.
          if (parsed.kind === 'failed') {
            const failed = cliFailure(parsed.reason, parsed.reason);
            backoff.set(key, { until: now() + backoffFor(failed), reading: failed });
          }
          // A run that completed ends a series of kills; a good answer proves
          // the source works again. Done here, in the shared flight, so it
          // holds when the caller that started the run stopped waiting.
          killStreak = 0;
          killRetryAt = 0;
          if (parsed.kind === 'windows' && disabledBy === 'killed') disabledBy = undefined;
        }
        return parsed;
      },
      signal, now, logger,
    });
    if (result.ok) {
      const output = result.value;
      if (output.kind === 'billed') {
        trip('billed', logger);
        return cliFailure('cli-unavailable', 'cli-guard-rejected');
      }
      if (output.kind === 'failed') return cliFailure(output.reason, output.reason);
      return { status: 'available', fetchedAt: result.readAt, windowSetEstablished: true,
        windows: output.windows };
    }
    if (result.reason !== 'cli-not-found') return runnerFailure(result.reason);
    failure = result.reason;
  }
  return runnerFailure(failure ?? 'cli-not-found');
}
