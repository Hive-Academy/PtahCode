/**
 * The pre-spawn limit gate both `ptah_agent_spawn` transports run before
 * `agent.spawn` (cli-lane-limits, Components 8 and 10).
 *
 * A spawn that names a lane (`ptahCliId` wins over `cli`) is refused when the
 * lane is at its plan limit, in an active cooldown, or reads a fresh 100 %
 * window. An unknown lane spawns with a one-line note. An auto-detected spawn,
 * an unlisted lane and an uninstalled or disabled lane are never gated: the
 * spawn's own error stays the answer. Pure; no static string names a vendor.
 */
import {
  formatToolInstant,
  type CliDetectionResult,
} from '@ptah-extension/shared';
import {
  findAgentLimit,
  formatAlternatives,
  formatSpawnLimitBlock,
  laneBlock,
  rowName,
  targetRowKey,
  unknownCause,
  type AgentLimit,
  type AgentLimitTarget,
  type LaneBlock,
} from './agent-limit.formatter';
import {
  boundedLimitLookup,
  LIMIT_LOOKUP_PENDING,
  resolvePostSpawnLimits,
  trackLimitLookup,
  type LimitLookupPending,
} from './bounded-limit-lookup';

/** Longest wait (ms) a spawn tool spends on a plan-limit lookup before continuing. */
export const SPAWN_GATE_WAIT_MS = 4_000;

export type SpawnGateVerdict =
  | { readonly kind: 'clear' }
  | { readonly kind: 'unknown'; readonly reason: string }
  | {
      readonly kind: 'blocked';
      readonly limit: AgentLimit;
      readonly block: LaneBlock;
    };

const CLEAR: SpawnGateVerdict = { kind: 'clear' };

/** The gate's decision for the lane a spawn request names. */
export function spawnGateVerdict(
  limits: readonly AgentLimit[] | LimitLookupPending | undefined,
  target: AgentLimitTarget | undefined,
  now: number,
): SpawnGateVerdict {
  if (!target) return CLEAR;
  if (limits === LIMIT_LOOKUP_PENDING) {
    return { kind: 'unknown', reason: 'limit lookup pending' };
  }
  if (!limits) {
    return { kind: 'unknown', reason: 'limit lookup failed' };
  }
  const limit = findAgentLimit(limits, target);
  if (!limit || !limit.row.installed || limit.row.disabled) return CLEAR;
  const block = laneBlock(limit, now);
  if (block) return { kind: 'blocked', limit, block };
  return limit.state.state === 'unknown'
    ? { kind: 'unknown', reason: unknownCause(limit) }
    : CLEAR;
}

/** Limit block when a spawn reply returns before the background lookup settles. */
export function formatPendingSpawnLimitBlock(attempted = false): string {
  return [
    '**Limit state:** unknown (limit lookup pending)',
    `> Note: limit state unknown (limit lookup pending); ${attempted ? 'attempted' : 'spawned'} without a limit check.`,
    '**Alternatives by limit state:** pending (limit lookup in progress).',
  ].join('\n\n');
}

/** Append the pending limit block when `limits` is still in flight. */
export function appendPendingSpawnLimits(
  formatted: string,
  limits: readonly AgentLimit[] | LimitLookupPending | undefined,
): string {
  return limits === LIMIT_LOOKUP_PENDING
    ? `${formatted}\n\n${formatPendingSpawnLimitBlock(false)}`
    : formatted;
}

/** Limit suffix (`\n\n...` or `''`) for a failed spawn attempt. */
export function formatAttemptedLimitSuffix(
  limits: readonly AgentLimit[] | LimitLookupPending | undefined,
  target: AgentLimitTarget | undefined,
  options: { readonly forced?: boolean } = {},
): string {
  if (!limits) return '';
  const block =
    limits === LIMIT_LOOKUP_PENDING
      ? formatPendingSpawnLimitBlock(true)
      : formatSpawnLimitBlock(limits, target, true, undefined, options);
  return `\n\n${block}`;
}

/** Narrow a bounded lookup outcome to settled `AgentLimit[]` or `undefined`. */
export function settledAgentLimits(
  limits: readonly AgentLimit[] | LimitLookupPending | undefined,
): readonly AgentLimit[] | undefined {
  return limits === LIMIT_LOOKUP_PENDING ? undefined : limits;
}

export interface EvaluatedSpawnGate {
  readonly forced: boolean;
  readonly refusal?: {
    readonly text: string;
    readonly verdict: Extract<SpawnGateVerdict, { kind: 'blocked' }>;
  };
  resolveLimits(
    startLookup: () => Promise<readonly AgentLimit[] | undefined>,
  ): Promise<readonly AgentLimit[] | LimitLookupPending | undefined>;
}

/** Run the bounded pre-spawn gate check and return the post-spawn resolver. */
export async function evaluateSpawnLimitGate(
  target: AgentLimitTarget | undefined,
  force: boolean | undefined,
  startTargetLookup: (
    namedTarget: AgentLimitTarget,
  ) => Promise<readonly AgentLimit[] | undefined>,
): Promise<EvaluatedSpawnGate> {
  const preLookup = target ? startTargetLookup(target) : undefined;
  const settlement = preLookup ? trackLimitLookup(preLookup) : undefined;
  const preLimits = preLookup
    ? await boundedLimitLookup(preLookup, SPAWN_GATE_WAIT_MS)
    : undefined;
  const now = Date.now();
  const verdict = preLimits
    ? spawnGateVerdict(preLimits, target, now)
    : undefined;
  const resolveLimits = (
    startLookup: () => Promise<readonly AgentLimit[] | undefined>,
  ): Promise<readonly AgentLimit[] | LimitLookupPending | undefined> =>
    resolvePostSpawnLimits(
      preLookup,
      preLimits,
      settlement,
      startLookup,
      SPAWN_GATE_WAIT_MS,
    );
  if (
    preLimits &&
    preLimits !== LIMIT_LOOKUP_PENDING &&
    verdict?.kind === 'blocked' &&
    !force
  ) {
    return {
      forced: false,
      refusal: {
        text: formatSpawnRefusal(preLimits, verdict, now),
        verdict,
      },
      resolveLimits,
    };
  }
  return {
    forced: verdict?.kind === 'blocked' && force === true,
    resolveLimits,
  };
}

/** The refusal text of a blocked spawn, followed by the alternatives. */
export function formatSpawnRefusal(
  limits: readonly AgentLimit[],
  verdict: Extract<SpawnGateVerdict, { kind: 'blocked' }>,
  now: number,
): string {
  const { limit, block } = verdict;
  const reset =
    block.resetsAt === undefined
      ? 'Reset time unknown'
      : `Free again ${formatToolInstant(block.resetsAt, now)}`;
  const refusal =
    `agent_spawn refused: ${rowName(limit)} is at its plan limit (${block.detail}). ` +
    `${reset}. Nothing was spawned. ` +
    'Pass "force": true to spawn anyway, or pick a lane with room below.';
  const alternatives = formatAlternatives(limits, {
    targetRowKey: targetRowKey(limit.row),
    now,
  });
  return `${refusal}\n\n${alternatives}`;
}

/**
 * The roster rows for a named spawn's lookup: the requested model is set on
 * the target row only, so the lookup resolves the owner that model runs on.
 */
export function rowsWithSpawnModel(
  rows: readonly CliDetectionResult[],
  target: AgentLimitTarget,
  model: string | undefined,
): readonly CliDetectionResult[] {
  if (model === undefined) return rows;
  const key = targetRowKey(target);
  const withModel = rows.map((row) =>
    targetRowKey(row) === key ? { ...row, model } : row,
  );
  return withModel;
}
