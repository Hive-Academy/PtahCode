import { z } from 'zod';
import type { AgentTurnTelemetry, AgentTurnUsage } from '../types/agent-turn-usage.types';
import { findModelPricing, type ModelPricing } from './pricing.utils';
import { findAdvancedSetting } from '../types/advanced-settings.types';

/** Fixed $3 per million input tokens, independent of catalog updates. */
export const REFERENCE_INPUT_USD_PER_TOKEN = 0.000003;

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
  if (!descriptor || descriptor.kind !== 'number') throw new Error(`Missing agent budget default: ${key}`);
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
}
export interface AgentBudgetTransition {
  readonly snapshot: AgentBudgetSnapshot;
  readonly warning: boolean;
  readonly stopReason?: AgentBudgetStopReason;
  readonly handoff: boolean;
  readonly coverage: AgentBudgetCoverage;
  readonly cost: AgentBudgetCost;
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
  constructor(private readonly settings: AgentBudgetSettings) { agentBudgetSettingsSchema.parse(settings); }

  /** The same threshold decision applies to completed turns and persisted ledgers. */
  assess(snapshot: AgentBudgetSnapshot, elapsedMs: number, contextTokens?: number, nextTurnTokens = 0): { warning: boolean; stopReason?: AgentBudgetStopReason; handoff: boolean } {
    const total = Math.max(snapshot.rawTokens, snapshot.weightedTokens);
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

  evaluate(snapshot: AgentBudgetSnapshot, telemetry: AgentTurnTelemetry, elapsedMs: number, pricing: ModelPricing | null): AgentBudgetTransition {
    if (telemetry.status === 'unavailable') return {
      snapshot: { ...snapshot, elapsedMs, stopped: true }, warning: false,
      stopReason: snapshot.stopped ? undefined : 'telemetry-unavailable', handoff: false, coverage: 'telemetry-unavailable',
      cost: { status: 'unavailable', reason: telemetry.reason },
    };
    const usage = telemetry.usage;
    const duplicate = snapshot.turnIds.includes(usage.turnId);
    const raw = usage.inputTokens + usage.outputTokens;
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
    const weighted = priced === null ? raw : Math.max(raw, priced / REFERENCE_INPUT_USD_PER_TOKEN);
    const rawTokens = snapshot.rawTokens + (duplicate ? 0 : raw);
    const weightedTokens = snapshot.weightedTokens + (duplicate ? 0 : weighted);
    const contextTokens = usage.requestContextTokens.status === 'reported' ? usage.requestContextTokens.value : undefined;
    const turnTokens = duplicate ? 0 : Math.max(raw, weighted);
    const largestTurnTokens = Math.max(snapshot.largestTurnTokens ?? 0, turnTokens);
    const decision = this.assess({ ...snapshot, rawTokens, weightedTokens, largestTurnTokens }, elapsedMs, contextTokens, turnTokens);
    const warning = !duplicate && decision.warning;
    const stopReason = decision.stopReason;
    return {
      snapshot: { weightedTokens, rawTokens, elapsedMs, largestTurnTokens, warned: snapshot.warned || warning, stopped: snapshot.stopped || stopReason !== undefined, turnIds: duplicate ? snapshot.turnIds : [...snapshot.turnIds, usage.turnId] },
      warning, stopReason,
      handoff: decision.handoff,
      coverage: priced === null ? 'price-weighting-degraded' : 'complete',
      cost: usage.models?.length && usage.providerCostUsd.status !== 'reported' && priced !== null
        ? { status: 'reported', value: priced, source: 'catalog' }
        : resolveAgentTurnCost(usage, pricing),
    };
  }
}
