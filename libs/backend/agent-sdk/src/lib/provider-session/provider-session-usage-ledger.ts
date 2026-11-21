/**
 * Session-lifetime usage of one provider-session chat (Antigravity, Grok,
 * OpenCode), the `sessionStats` snapshot the session side panel shows
 * (Tokens, Cost, Context, Time). Codex has `CodexSessionUsageOwner`; the
 * Claude SDK has its stats owner. A provider session had neither, so every
 * result reached the renderer without `sessionStats` and the panel read "—"
 * (GitHub issue #1459).
 *
 * In memory, per chat session record. A session restored from history
 * (resume or load) counts only the turns run since it was restored, so its
 * snapshot says `coverage: 'partial'`, never a complete lifetime total.
 *
 * Pricing: each turn is valued with `calculateExactMessageCost` from the
 * shared rate table. A provider-reported cost is used as reported. A model
 * without a published rate stays unpriced (`totalCost: null`,
 * `costUnavailableReason: 'rate-missing'`), never `$0`. ACP usage counters are
 * disjoint (agy reports `totalTokens = input + output + cachedRead`), so cache
 * reads are priced as their own class.
 */
import {
  calculateExactMessageCost,
  type ContextCapacity,
  type ExactCostResult,
  type PriceProvenance,
  type SessionCostBasis,
  type SessionCostUnavailableReason,
  type SessionStatsEntry,
  type SessionStatsPricingCoverage,
} from '@ptah-extension/shared';
import type { ProviderUsage } from '@ptah-extension/provider-session-contracts';

/**
 * How a profile's sign-in bills. Antigravity and Grok run on the user's
 * signed-in account (a plan), so a priced turn is a published-rate value
 * covered by that plan. OpenCode can bill any provider key: unknown.
 */
export type ProviderSessionBillingMode = 'subscription' | 'unknown';

const BILLING_BY_PROFILE: Readonly<Record<string, ProviderSessionBillingMode>> =
  {
    antigravity: 'subscription',
    grok: 'subscription',
  };

export function providerSessionBillingMode(
  profile: string,
): ProviderSessionBillingMode {
  return Object.hasOwn(BILLING_BY_PROFILE, profile)
    ? BILLING_BY_PROFILE[profile]
    : 'unknown';
}

interface ModelTotals {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  /** Sum of the priced turns of this model. */
  knownCost: number;
  pricedTurns: number;
  unpricedTurns: number;
  contextCapacity?: ContextCapacity;
}

/** One recorded turn: its own price and the lifetime snapshot after it. */
export interface ProviderSessionTurnUsage {
  readonly turnPrice: ExactCostResult;
  readonly snapshot: SessionStatsEntry;
}

export class ProviderSessionUsageLedger {
  private readonly models = new Map<string, ModelTotals>();
  private turnCount = 0;
  private durationMs = 0;
  private knownCost = 0;
  private pricedTurns = 0;
  private unpricedTurns = 0;
  /** Every unpriced turn so far was unpriced for a missing rate only. */
  private onlyRateMissing = true;
  private bases = new Set<SessionCostBasis>();
  private readonly provenance = new Map<string, PriceProvenance>();
  private lastContext?: {
    readonly model: string;
    readonly contextTokens: number;
    readonly capacity: ContextCapacity;
  };

  constructor(
    private readonly sessionId: string,
    private readonly billingMode: ProviderSessionBillingMode,
    /** Restored from history: turns before the restore are not counted. */
    private readonly restored: boolean,
  ) {}

  /** Count one completed turn and return its price and the new snapshot. */
  record(
    model: string | undefined,
    usage: ProviderUsage,
    duration: number,
    contextCapacity: ContextCapacity | undefined,
  ): ProviderSessionTurnUsage {
    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheCreation = usage.cacheWriteTokens ?? 0;
    const turnPrice = priceTurn(model, usage, this.billingMode);
    this.turnCount += 1;
    if (Number.isFinite(duration) && duration > 0) this.durationMs += duration;
    if (turnPrice.totalCost === null) {
      this.unpricedTurns += 1;
      if (turnPrice.costUnavailableReason !== 'rate-missing')
        this.onlyRateMissing = false;
    } else {
      this.pricedTurns += 1;
      this.knownCost += turnPrice.totalCost;
      this.bases.add(turnPrice.costBasis);
    }
    if (turnPrice.priceProvenance) {
      this.provenance.set(
        turnPrice.priceProvenance.modelIdUsed,
        turnPrice.priceProvenance,
      );
    }
    const key = model ?? '';
    const totals = this.models.get(key) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheCreation: 0,
      knownCost: 0,
      pricedTurns: 0,
      unpricedTurns: 0,
    };
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.cacheRead += cacheRead;
    totals.cacheCreation += cacheCreation;
    if (turnPrice.totalCost === null) totals.unpricedTurns += 1;
    else {
      totals.pricedTurns += 1;
      totals.knownCost += turnPrice.totalCost;
    }
    if (contextCapacity) totals.contextCapacity = contextCapacity;
    this.models.set(key, totals);
    if (
      model &&
      contextCapacity &&
      contextCapacity.tokens !== null &&
      contextCapacity.tokens > 0 &&
      usage.contextTokens !== undefined
    ) {
      this.lastContext = {
        model,
        contextTokens: Math.min(usage.contextTokens, contextCapacity.tokens),
        capacity: contextCapacity,
      };
    }
    return { turnPrice, snapshot: this.snapshot() };
  }

  snapshot(): SessionStatsEntry {
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheCreation = 0;
    for (const totals of this.models.values()) {
      input += totals.inputTokens;
      output += totals.outputTokens;
      cacheRead += totals.cacheRead;
      cacheCreation += totals.cacheCreation;
    }
    const pricingCoverage: SessionStatsPricingCoverage =
      this.unpricedTurns === 0 && this.pricedTurns > 0
        ? 'full'
        : this.pricedTurns > 0
          ? 'partial'
          : 'none';
    const complete = !this.restored;
    // A restored session's earlier turns are not counted: never a total.
    const totalCost =
      complete && pricingCoverage === 'full' ? round(this.knownCost) : null;
    const costBasis: SessionCostBasis =
      totalCost === null
        ? 'unknown'
        : this.bases.size === 1
          ? [...this.bases][0]
          : 'estimated';
    const costUnavailableReason: SessionCostUnavailableReason | undefined =
      totalCost === null &&
      complete &&
      pricingCoverage === 'none' &&
      this.unpricedTurns > 0 &&
      this.onlyRateMissing
        ? 'rate-missing'
        : undefined;
    const modelUsageList = [...this.models.entries()]
      .filter(([model]) => model !== '')
      .map(([model, totals]) => ({
        model,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheRead: totals.cacheRead,
        cacheCreation: totals.cacheCreation,
        costUSD:
          totals.unpricedTurns === 0 && totals.pricedTurns > 0
            ? round(totals.knownCost)
            : null,
        ...(totals.contextCapacity
          ? {
              contextWindow: totals.contextCapacity.tokens ?? 0,
              contextCapacity: totals.contextCapacity,
            }
          : {}),
      }));
    return {
      sessionId: this.sessionId,
      model: this.primaryModel(),
      totalCost,
      costBasis,
      pricingCoverage,
      ...(pricingCoverage === 'partial' ? { knownCost: round(this.knownCost) } : {}),
      ...(this.provenance.size > 0
        ? { priceProvenance: [...this.provenance.values()] }
        : {}),
      ...(costUnavailableReason ? { costUnavailableReason } : {}),
      tokens: { input, output, cacheRead, cacheCreation },
      tokenCount: input + output + cacheRead + cacheCreation,
      messageCount: this.turnCount,
      ...(complete ? { turnCount: this.turnCount } : {}),
      ...(modelUsageList.length > 0 ? { modelUsageList } : {}),
      status: this.turnCount > 0 ? 'ok' : 'empty',
      coverage: complete ? 'complete' : 'partial',
      scope: 'session',
      durationMs: this.durationMs > 0 ? this.durationMs : null,
      ...(this.lastContext
        ? {
            contextSnapshot: {
              model: this.lastContext.model,
              contextTokens: this.lastContext.contextTokens,
              contextWindow: this.lastContext.capacity.tokens ?? 0,
              contextCapacity: this.lastContext.capacity,
            },
          }
        : {}),
    };
  }

  /** The model with the highest known cost, then the most tokens. */
  private primaryModel(): string | null {
    let best: { model: string; cost: number; tokens: number } | undefined;
    for (const [model, totals] of this.models) {
      if (!model) continue;
      const tokens =
        totals.inputTokens +
        totals.outputTokens +
        totals.cacheRead +
        totals.cacheCreation;
      if (
        !best ||
        totals.knownCost > best.cost ||
        (totals.knownCost === best.cost && tokens > best.tokens)
      ) {
        best = { model, cost: totals.knownCost, tokens };
      }
    }
    return best?.model ?? null;
  }
}

/** One turn's price. A provider-reported cost wins; no model is unpriced. */
export function priceTurn(
  model: string | undefined,
  usage: ProviderUsage,
  billingMode: ProviderSessionBillingMode,
): ExactCostResult {
  if (
    usage.costUsd !== undefined &&
    Number.isFinite(usage.costUsd) &&
    usage.costUsd >= 0
  ) {
    return calculateExactMessageCost(
      model ?? '',
      {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheHit: usage.cacheReadTokens ?? 0,
        cacheCreation: usage.cacheWriteTokens ?? 0,
      },
      {
        billingMode: 'api-key',
        providerReportedCost: usage.costUsd,
        usageObserved: true,
      },
    );
  }
  return calculateExactMessageCost(
    model ?? '',
    {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheHit: usage.cacheReadTokens ?? 0,
      cacheCreation: usage.cacheWriteTokens ?? 0,
    },
    { billingMode, cacheSemantics: 'disjoint', usageObserved: true },
  );
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
