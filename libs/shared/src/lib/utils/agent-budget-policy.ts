import { z } from 'zod';
import type { AgentTurnTelemetry, AgentTurnUsage } from '../types/agent-turn-usage.types';
import { findModelPricing, type ModelPricing } from './pricing.utils';
import { findAdvancedSetting } from '../types/advanced-settings.types';
import type { AgentActionNotice, AgentActionReason } from '../types/agent-action.types';

/** Fixed $3 per million input tokens, independent of catalog updates. */
export const REFERENCE_INPUT_USD_PER_TOKEN = 0.000003;
/** Verified cache reads contribute 10% to the lifetime token floor. */
export const VERIFIED_CACHE_READ_WEIGHT = 0.1;
/** Existing stop threshold, and the pause threshold of cooperative admission: consecutive completed turns without usage telemetry. */
export const MAX_CONSECUTIVE_UNAVAILABLE_TURNS = 3;
export interface AgentBudgetPolicyOptions { readonly laneAccounting?: boolean; }
/** A pause lands at this multiple of each configured limit. The ask lands at `warnRatio` x the limit. */
export const AGENT_BUDGET_PAUSE_MULTIPLIER = 2;

export const agentBudgetSettingsSchema = z.object({
  warnRatio: z.number().finite().gt(0).lt(1),
  stopWeightedTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  handoffContextTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxDurationMin: z.number().finite().positive(),
}).strict();
export type AgentBudgetSettings = z.infer<typeof agentBudgetSettingsSchema>;
/** Apply contributed-setting bounds at the external configuration boundary. */
export function parseAgentBudgetSetting(key: keyof AgentBudgetSettings, raw: unknown): number | undefined {
  const parsed = agentBudgetSettingsSchema.shape[key].safeParse(raw);
  const descriptor = findAdvancedSetting(`agentBudget.${key}`);
  if (!parsed.success || !descriptor || descriptor.kind !== 'number') return undefined;
  if (descriptor.integer && !Number.isInteger(parsed.data)) return undefined;
  if (descriptor.min !== undefined && parsed.data < descriptor.min) return undefined;
  if (descriptor.max !== undefined && parsed.data > descriptor.max) return undefined;
  return parsed.data;
}
function budgetDefault(key: keyof AgentBudgetSettings): number {
  const descriptor = findAdvancedSetting(`agentBudget.${key}`);
  if (!descriptor || descriptor.kind !== 'number' || descriptor.default === null) throw new Error(`Missing agent budget default: ${key}`);
  return descriptor.default;
}
export const DEFAULT_AGENT_BUDGET_SETTINGS: AgentBudgetSettings = {
  warnRatio: budgetDefault('warnRatio'),
  stopWeightedTokens: budgetDefault('stopWeightedTokens'),
  handoffContextTokens: budgetDefault('handoffContextTokens'),
  maxDurationMin: budgetDefault('maxDurationMin'),
};
export type AgentBudgetStopReason = 'budget' | 'telemetry-unavailable' | 'duration';
export type AgentBudgetCoverage = 'complete' | 'price-weighting-degraded' | 'telemetry-unavailable';
export type AgentBudgetCost =
  | { status: 'reported'; value: number; source: 'provider' | 'catalog' }
  | { status: 'unavailable'; reason: string };
export interface AgentBudgetSnapshot {
  readonly weightedTokens: number;
  readonly rawTokens: number;
  readonly elapsedMs: number;
  readonly warned: boolean;
  readonly stopped: boolean;
  readonly turnIds: readonly string[];
  readonly largestTurnTokens?: number;
  /** Consecutive requests with unavailable telemetry at the tail of request order. */
  readonly unavailableTurns?: number;
}
export interface AgentBudgetTransition {
  readonly snapshot: AgentBudgetSnapshot;
  readonly warning: boolean;
  readonly stopReason?: AgentBudgetStopReason;
  readonly handoff: boolean;
  readonly coverage: AgentBudgetCoverage;
  readonly cost: AgentBudgetCost;
}
export type AgentAdmissionPhase = 'running' | 'asked-handoff' | 'paused';
/** Dimensions that drive admission; the values are the notice reasons they report. */
export type AgentAdmissionDimension = Extract<AgentActionReason,
  'weighted-budget' | 'raw-budget' | 'context-budget' | 'duration' | 'telemetry-unavailable'>;
export interface AgentAdmissionAssessment {
  readonly phase: AgentAdmissionPhase;
  readonly reason?: AgentAdmissionDimension;
  readonly measured?: number;
  readonly limit?: number;
  readonly unit?: Extract<NonNullable<AgentActionNotice['unit']>, 'tokens' | 'milliseconds' | 'turns'>;
}
/** Ask and pause points of one dimension. `limit` is the configured value shown to the agent. */
export interface AgentAdmissionLimits {
  readonly limit: number;
  readonly askAt: number;
  readonly pauseAt: number;
  readonly unit: 'tokens' | 'milliseconds';
}
export type AgentAdmissionLimitMap = Readonly<Record<Exclude<AgentAdmissionDimension, 'telemetry-unavailable'>, AgentAdmissionLimits>>;

/** Remove binary-float noise (0.85 x 3,000,000) so the inclusive boundary lands on the intended integer. */
function threshold(limit: number, factor: number): number {
  return Math.round(limit * factor * 1e6) / 1e6;
}
function dimensionLimits(limit: number, warnRatio: number, unit: AgentAdmissionLimits['unit']): AgentAdmissionLimits {
  return { limit, askAt: threshold(limit, warnRatio), pauseAt: threshold(limit, AGENT_BUDGET_PAUSE_MULTIPLIER), unit };
}
/** Ask and pause points per dimension. Duration is in milliseconds so a timer can use it directly. */
export function agentBudgetAdmissionLimits(settings: AgentBudgetSettings): AgentAdmissionLimitMap {
  return {
    'weighted-budget': dimensionLimits(settings.stopWeightedTokens, settings.warnRatio, 'tokens'),
    'raw-budget': dimensionLimits(settings.stopWeightedTokens, settings.warnRatio, 'tokens'),
    'context-budget': dimensionLimits(settings.handoffContextTokens, settings.warnRatio, 'tokens'),
    duration: dimensionLimits(settings.maxDurationMin * 60_000, settings.warnRatio, 'milliseconds'),
  };
}

export const initialAgentBudgetSnapshot: AgentBudgetSnapshot = {
  weightedTokens: 0, rawTokens: 0, elapsedMs: 0, warned: false, stopped: false, turnIds: [],
};

function validRate(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

/** Complete class accounting is required before a catalog cost is shown. */
export function resolveAgentTurnCost(usage: AgentTurnUsage, pricing: ModelPricing | null): AgentBudgetCost {
  if (usage.providerCostUsd.status === 'reported')
    return { status: 'reported', value: usage.providerCostUsd.value, source: 'provider' };
  const classes = pricedClasses(usage, pricing);
  if (classes === null) return { status: 'unavailable', reason: 'complete model rates or verified cache classes unavailable' };
  return { status: 'reported', value: classes, source: 'catalog' };
}

function pricedClasses(usage: AgentTurnUsage, pricing: ModelPricing | null): number | null {
  if (!pricing || !validRate(pricing.inputCostPerToken) || !validRate(pricing.outputCostPerToken)) return null;
  let uncached = usage.inputTokens;
  let read = 0;
  let write = 0;
  if (usage.cacheSemantics === 'verified-subsets') {
    if (usage.cacheReadTokens.status !== 'reported' || usage.cacheWriteTokens.status !== 'reported') return null;
    read = usage.cacheReadTokens.value;
    write = usage.cacheWriteTokens.value;
    uncached -= read + write;
    if (uncached < 0 || (read > 0 && !validRate(pricing.cacheReadCostPerToken)) || (write > 0 && !validRate(pricing.cacheCreationCostPerToken))) return null;
  } else return null;
  return uncached * pricing.inputCostPerToken + read * (pricing.cacheReadCostPerToken ?? 0) + write * (pricing.cacheCreationCostPerToken ?? 0) + usage.outputTokens * pricing.outputCostPerToken;
}

/** Pure transition; callers persist the snapshot and deduplicate by turn ID. */
export class AgentBudgetPolicy {
  constructor(private readonly settings: AgentBudgetSettings, private readonly options: AgentBudgetPolicyOptions = {}) { agentBudgetSettingsSchema.parse(settings); }

  /** The same threshold decision applies to completed turns and persisted ledgers. */
  assess(snapshot: AgentBudgetSnapshot, elapsedMs: number, contextTokens?: number, nextTurnTokens = 0): { warning: boolean; stopReason?: AgentBudgetStopReason; handoff: boolean } {
    const total = this.options.laneAccounting ? snapshot.weightedTokens : Math.max(snapshot.rawTokens, snapshot.weightedTokens);
    const contextWarning = contextTokens !== undefined && contextTokens >= this.settings.handoffContextTokens * this.settings.warnRatio;
    const warning = !snapshot.warned && !snapshot.stopped &&
      (total >= this.settings.stopWeightedTokens * this.settings.warnRatio ||
        total + Math.max(nextTurnTokens, snapshot.largestTurnTokens ?? 0) >= this.settings.stopWeightedTokens || contextWarning);
    const stopReason = snapshot.stopped ? undefined
      : elapsedMs >= this.settings.maxDurationMin * 60_000 ? 'duration' as const
      : total >= this.settings.stopWeightedTokens || (contextTokens !== undefined && contextTokens >= this.settings.handoffContextTokens * 2) ? 'budget' as const
      : undefined;
    return { warning, stopReason, handoff: contextTokens !== undefined && contextTokens >= this.settings.handoffContextTokens };
  }

  /** Ask and pause points per dimension for this policy's settings. */
  admissionLimits(): AgentAdmissionLimitMap { return agentBudgetAdmissionLimits(this.settings); }

  /**
   * Cooperative admission phase. Never stops anything: `asked-handoff` advises a handoff and
   * `paused` denies new work tools. Boundaries are inclusive and the highest phase wins; among
   * equal phases the first of weighted, raw, context, duration and telemetry is reported.
   * The caller latches the phase; `snapshot.stopped` is deliberately ignored here. Lane
   * accounting tracks weighted tokens only, so its raw dimension is skipped.
   */
  assessAdmission(snapshot: AgentBudgetSnapshot, elapsedMs: number, contextTokens?: number): AgentAdmissionAssessment {
    const limits = this.admissionLimits();
    const candidates: Array<[Exclude<AgentAdmissionDimension, 'telemetry-unavailable'>, number | undefined]> = [
      ['weighted-budget', snapshot.weightedTokens],
      ['raw-budget', this.options.laneAccounting ? undefined : snapshot.rawTokens],
      ['context-budget', contextTokens],
      ['duration', elapsedMs],
    ];
    let best: AgentAdmissionAssessment = { phase: 'running' };
    const consider = (candidate: AgentAdmissionAssessment): void => {
      if (candidate.phase === 'paused' ? best.phase !== 'paused' : candidate.phase === 'asked-handoff' && best.phase === 'running') best = candidate;
    };
    for (const [reason, measured] of candidates) {
      if (measured === undefined) continue;
      const { limit, askAt, pauseAt, unit } = limits[reason];
      const phase: AgentAdmissionPhase = measured >= pauseAt ? 'paused' : measured >= askAt ? 'asked-handoff' : 'running';
      consider({ phase, reason, measured, limit, unit });
    }
    const unavailable = snapshot.unavailableTurns ?? 0;
    const telemetryPhase: AgentAdmissionPhase = unavailable >= MAX_CONSECUTIVE_UNAVAILABLE_TURNS ? 'paused' : unavailable >= 1 ? 'asked-handoff' : 'running';
    consider({ phase: telemetryPhase, reason: 'telemetry-unavailable', measured: unavailable, limit: MAX_CONSECUTIVE_UNAVAILABLE_TURNS, unit: 'turns' });
    return best;
  }

  private decideTurn(snapshot: AgentBudgetSnapshot, previousWeightedTokens: number, elapsedMs: number, duplicate: boolean,
    contextTokens?: number, turnTokens = 0): { warning: boolean; stopReason?: AgentBudgetStopReason; handoff: boolean } {
    const decision = this.assess(snapshot, elapsedMs, contextTokens, turnTokens);
    const contextCeiling = contextTokens !== undefined && contextTokens >= this.settings.handoffContextTokens * 2;
    const deferTokenStop = !duplicate && previousWeightedTokens < this.settings.stopWeightedTokens &&
      snapshot.weightedTokens >= this.settings.stopWeightedTokens && decision.stopReason === 'budget' && !contextCeiling;
    return {
      warning: !duplicate && (decision.warning || deferTokenStop),
      stopReason: duplicate && decision.stopReason === 'budget' && !contextCeiling ? undefined
        : deferTokenStop ? undefined : decision.stopReason,
      handoff: decision.handoff,
    };
  }

  evaluate(snapshot: AgentBudgetSnapshot, telemetry: AgentTurnTelemetry, elapsedMs: number, pricing: ModelPricing | null): AgentBudgetTransition {
    if (telemetry.status === 'unavailable') {
      if (!this.options.laneAccounting) return {
        snapshot: { ...snapshot, elapsedMs, stopped: true }, warning: false,
        stopReason: snapshot.stopped ? undefined : 'telemetry-unavailable', handoff: false, coverage: 'telemetry-unavailable',
        cost: { status: 'unavailable', reason: telemetry.reason },
      };
      if (snapshot.stopped) return {
        snapshot: { ...snapshot, elapsedMs }, warning: false, stopReason: undefined,
        handoff: false, coverage: 'telemetry-unavailable',
        cost: { status: 'unavailable', reason: telemetry.reason },
      };
      const duplicate = snapshot.turnIds.includes(telemetry.turnId);
      const unavailableTurns = duplicate ? snapshot.unavailableTurns : (snapshot.unavailableTurns ?? 0) + 1;
      const weightedTokens = snapshot.weightedTokens + (duplicate ? 0 : snapshot.largestTurnTokens ?? 0);
      const updated = { ...snapshot, elapsedMs, unavailableTurns, weightedTokens,
        turnIds: duplicate ? snapshot.turnIds : [...snapshot.turnIds, telemetry.turnId] };
      const decision = this.decideTurn(updated, snapshot.weightedTokens, elapsedMs, duplicate);
      const stopReason = !duplicate && unavailableTurns !== undefined && unavailableTurns >= MAX_CONSECUTIVE_UNAVAILABLE_TURNS
        ? 'telemetry-unavailable' as const : decision.stopReason;
      const warning = stopReason === 'telemetry-unavailable' ? false : decision.warning;
      return {
        snapshot: { ...updated, warned: snapshot.warned || warning, stopped: stopReason !== undefined },
        warning, stopReason, handoff: false, coverage: 'telemetry-unavailable',
        cost: { status: 'unavailable', reason: telemetry.reason },
      };
    }
    const usage = telemetry.usage;
    const duplicate = snapshot.turnIds.includes(usage.turnId);
    const raw = usage.inputTokens + usage.outputTokens;
    const cacheRead = usage.models?.length
      ? usage.models.reduce((sum, model) => sum + Math.min(model.inputTokens, Math.max(0, model.cacheReadTokens)), 0)
      : usage.cacheSemantics === 'verified-subsets' && usage.cacheReadTokens.status === 'reported'
        ? usage.cacheReadTokens.value : 0;
    const verifiedCacheRead = Math.min(usage.inputTokens, Math.max(0, cacheRead));
    const floor = raw - (1 - VERIFIED_CACHE_READ_WEIGHT) * verifiedCacheRead;
    const priced = usage.models?.length
      ? usage.models.reduce<number | null>((sum, model) => {
          if (sum === null) return null;
          const modelCost = pricedClasses({ ...usage, modelId: model.modelId,
            inputTokens: model.inputTokens, outputTokens: model.outputTokens,
            cacheReadTokens: { status: 'reported', value: model.cacheReadTokens, source: usage.source },
            cacheWriteTokens: { status: 'reported', value: model.cacheWriteTokens, source: usage.source },
            cacheSemantics: 'verified-subsets',
          }, findModelPricing(model.modelId));
          return modelCost === null ? null : sum + modelCost;
        }, 0)
      : pricedClasses(usage, pricing);
    const weighted = priced === null ? (this.options.laneAccounting ? floor : raw)
      : Math.max(this.options.laneAccounting ? floor : raw, priced / REFERENCE_INPUT_USD_PER_TOKEN);
    const rawTokens = snapshot.rawTokens + (duplicate ? 0 : raw);
    const weightedTokens = snapshot.weightedTokens + (duplicate ? 0 : weighted);
    const contextTokens = usage.requestContextTokens.status === 'reported' ? usage.requestContextTokens.value : undefined;
    const turnTokens = duplicate ? 0 : (this.options.laneAccounting ? weighted : Math.max(raw, weighted));
    const largestTurnTokens = Math.max(snapshot.largestTurnTokens ?? 0, turnTokens);
    const decision = this.options.laneAccounting
      ? this.decideTurn({ ...snapshot, rawTokens, weightedTokens, largestTurnTokens }, snapshot.weightedTokens, elapsedMs, duplicate, contextTokens, turnTokens)
      : this.assess({ ...snapshot, rawTokens, weightedTokens, largestTurnTokens }, elapsedMs, contextTokens, turnTokens);
    const warning = this.options.laneAccounting ? decision.warning : !duplicate && decision.warning;
    const stopReason = decision.stopReason;
    return {
      snapshot: { weightedTokens, rawTokens, elapsedMs, largestTurnTokens, ...(this.options.laneAccounting ? { unavailableTurns: duplicate ? snapshot.unavailableTurns : 0 } : {}), warned: snapshot.warned || warning, stopped: snapshot.stopped || stopReason !== undefined, turnIds: duplicate ? snapshot.turnIds : [...snapshot.turnIds, usage.turnId] },
      warning, stopReason,
      handoff: decision.handoff,
      coverage: priced === null ? 'price-weighting-degraded' : 'complete',
      cost: usage.models?.length && usage.providerCostUsd.status !== 'reported' && priced !== null
        ? { status: 'reported', value: priced, source: 'catalog' }
        : resolveAgentTurnCost(usage, pricing),
    };
  }
}
