/**
 * Antigravity headless CLI usage adapter.
 *
 * Runs `agy -p /usage` (argument array, no shell: a shell on Windows/MSYS
 * rewrites `/usage` into a path) and maps its tab-separated output to plan
 * windows. Each line is `<group>\t<label>\t<remaining %>\t<ISO-8601 UTC reset>`.
 * The percentage is the REMAINING share, so `usedPercent = 100 - value`.
 *
 * Fails closed: one malformed line rejects the whole output
 * (`cli-parse-failed`); unknown text is never read as 0 % used.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { runFallbackUsage, nodeFallbackExecutor, type FallbackExecutor } from './fallback-usage.runner';
import { FALLBACK_TIMEOUT_MS, FALLBACK_PARSE_BACKOFF_MS, FALLBACK_SHORT_BACKOFF_MS, FALLBACK_MAX_OUTPUT_BYTES } from './fallback-usage.constants';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  windowKindFromDuration,
  type PlanLimitStatusReason,
  type PlanLimitWindow,
} from '@ptah-extension/shared';

export const ANTIGRAVITY_CLI_TIMEOUT_MS = FALLBACK_TIMEOUT_MS;
export const ANTIGRAVITY_CLI_PARSE_BACKOFF_MS = FALLBACK_PARSE_BACKOFF_MS;
export const ANTIGRAVITY_CLI_SHORT_BACKOFF_MS = FALLBACK_SHORT_BACKOFF_MS;
export const ANTIGRAVITY_CLI_MAX_OUTPUT_BYTES = FALLBACK_MAX_OUTPUT_BYTES;
const MAX_LINES = 64;
const MAX_FIELD_LENGTH = 96;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PERCENT = /^(\d{1,3}(?:\.\d+)?)%$/;
const USAGE_ROW_SCHEMA = z.tuple([
  z.string().min(1).max(MAX_FIELD_LENGTH),
  z
    .string()
    .min(1)
    .max(MAX_FIELD_LENGTH)
    .regex(/(?:five\s*hour|weekly)/i),
  z
    .string()
    .regex(PERCENT)
    .transform((value) => Number(PERCENT.exec(value)?.[1]))
    .pipe(z.number().min(0).max(100)),
  z
    .string()
    .regex(ISO_UTC)
    .transform((value) => Date.parse(value))
    .pipe(z.number().finite()),
]);

export type AntigravityCliFailureReason = 'cli-busy' | Extract<
  PlanLimitStatusReason,
  | 'cli-unavailable'
  | 'cli-not-found'
  | 'cli-timeout'
  | 'cli-not-signed-in'
  | 'cli-exit-error'
  | 'cli-parse-failed'
  | 'cli-backoff'
>;

export type AntigravityCliResult =
  | {
      readonly ok: true;
      readonly windows: readonly PlanLimitWindow[];
      /** Time of the original CLI observation (older than now on a cache hit). */
      readonly readAt: number;
    }
  | {
      readonly ok: false;
      readonly reason: AntigravityCliFailureReason;
    };

/** Runs one executable with an argument array; rejects on any failure. */
export type AntigravityCliExec = (
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<string>;
const testExecutorIds = new WeakMap<AntigravityCliExec, string>();
let nextExecutorId = 0;

export interface AntigravityCliOptions {
  readonly exec?: AntigravityCliExec;
  /** Candidate executables, in order. Defaults to PATH then the install dir. */
  readonly executables?: readonly string[];
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly timeoutMs?: number;
  readonly ownerKey?: string;
  readonly accountFingerprint?: string;
  readonly executor?: FallbackExecutor;
}

/** `agy` on PATH first, then `%LOCALAPPDATA%/agy/bin/agy(.exe)` on Windows. */
export function antigravityCliCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): readonly string[] {
  const candidates = ['agy'];
  const localAppData = env['LOCALAPPDATA']?.trim();
  if (platform === 'win32' && localAppData) {
    const installed = join(localAppData, 'agy', 'bin', 'agy.exe');
    if (exists(installed)) candidates.push(installed);
  }
  return candidates;
}

export async function readAntigravityCliUsage(
  signal: AbortSignal | undefined,
  options: AntigravityCliOptions = {},
): Promise<AntigravityCliResult> {
  const now = options.now ?? Date.now;
  const deadline = now() + Math.min(ANTIGRAVITY_CLI_TIMEOUT_MS,
    options.timeoutMs ?? ANTIGRAVITY_CLI_TIMEOUT_MS);
  let firstFailure: AntigravityCliFailureReason | undefined;
  for (const executable of options.executables ?? antigravityCliCandidates()) {
    const executor = options.executor ?? (options.exec ? legacyExecutor(options.exec) : nodeFallbackExecutor);
    const result = await runFallbackUsage({ sourceId: 'antigravity', ownerKey: options.ownerKey ?? 'cli-store',
      executable, version: 'usage-v1', accountFingerprint: options.accountFingerprint ??
        (options.exec ? executorId(options.exec) : 'active'),
      args: ['-p', '/usage'], executor, parse: parseAntigravityCliUsage, signal, now,
      deadline,
      logger: options.logger });
    if (result.ok) return { ok: true, windows: result.value, readAt: result.readAt };
    if (result.reason === 'cli-not-found' || result.reason === 'cli-unavailable' ||
      result.reason === 'cli-exit-error' || result.reason === 'cli-backoff') {
      if (result.reason !== 'cli-not-found') firstFailure ??= result.reason;
      continue;
    }
    return { ok: false, reason: result.reason };
  }
  return { ok: false, reason: firstFailure ?? 'cli-not-found' };
}

function executorId(exec: AntigravityCliExec): string {
  let id = testExecutorIds.get(exec);
  if (!id) { id = `injected-${++nextExecutorId}`; testExecutorIds.set(exec, id); }
  return id;
}

function legacyExecutor(exec: AntigravityCliExec): FallbackExecutor {
  return { start(executable, args) {
    const controller = new AbortController();
    const result = exec(executable, args, controller.signal);
    return { result, closed: result.then(() => undefined, () => undefined),
      kill: () => controller.abort() };
  } };
}

/** `undefined` when any line is malformed or no line is present. */
export function parseAntigravityCliUsage(
  stdout: string,
  observedAt: number,
): PlanLimitWindow[] | undefined {
  if (Buffer.byteLength(stdout, 'utf8') > ANTIGRAVITY_CLI_MAX_OUTPUT_BYTES) {
    return undefined;
  }
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0 || lines.length > MAX_LINES) return undefined;
  const windows: PlanLimitWindow[] = [];
  const keys = new Set<string>();
  for (const line of lines) {
    const window = parseLine(line, observedAt);
    if (!window || keys.has(window.key)) return undefined;
    keys.add(window.key);
    windows.push(window);
  }
  return windows;
}

function parseLine(
  line: string,
  observedAt: number,
): PlanLimitWindow | undefined {
  const parsed = USAGE_ROW_SCHEMA.safeParse(
    line.split('\t').map((field) => field.trim()),
  );
  if (!parsed.success) return undefined;
  const [group, label, remaining, resetsAt] = parsed.data;
  if (resetsAt < observedAt - 24 * 60 * 60_000) return undefined;
  const durationMins = /five\s*hour/i.test(label)
    ? 300
    : /weekly/i.test(label)
      ? 10_080
      : undefined;
  const descriptor = windowKindFromDuration(durationMins, 0);
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const suffix = durationMins ? descriptor.kind : slug(label);
  return {
    key: `other:cli-${slug(group)}-${suffix}`,
    kind: descriptor.kind,
    label: `${durationMins ? descriptor.label : label} · ${group}`,
    modelScope: group,
    ...(durationMins && { durationMins }),
    used: {
      kind: 'percent',
      percent: Math.round((100 - remaining) * 10) / 10,
    },
    usedSource: 'provider-unofficial',
    usedObservedAt: observedAt,
    resetsAt,
    resetSource: 'provider-unofficial',
    observedAt,
  };
}


