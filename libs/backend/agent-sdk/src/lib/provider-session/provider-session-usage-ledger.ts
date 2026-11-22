/**
 * Session-lifetime usage of one provider-session chat (Antigravity, Grok,
 * OpenCode), the `sessionStats` snapshot the session side panel shows
 * (Tokens, Cost, Context, Time). Codex has `CodexSessionUsageOwner`; the
 * Claude SDK has its stats owner. A provider session had neither, so every
 * result reached the renderer without `sessionStats` and the panel read "—"
 * (GitHub issue #1459).
 *
 * In memory, per chat session record; every turn is also persisted through
 * the optional `SessionUsageSink` (producer `'provider-session'`). A session
 * restored from history (resume or load) is seeded with what was persisted
 * ({@link ProviderSessionUsageSeed}) and shows those totals, but its
 * snapshot always says `coverage: 'partial'` with a labeled `knownCost`,
 * never a complete lifetime total: writes are asynchronous, so a turn lost
 * at the end of an earlier process (crash, full queue, failed write) leaves
 * no trace the seed could reveal.
 *
 * Pricing: each turn is valued with `calculateExactMessageCost` from the
 * shared rate table. A provider-reported cost is used as reported. A model
 * without a published rate stays unpriced (`totalCost: null`,
 * `costUnavailableReason: 'rate-missing'`), never `$0`. ACP usage counters are
 * disjoint (agy reports `totalTokens = input + output + cachedRead`), so cache
 * reads are priced as their own class.
 *
 * Antigravity model ids carry a reasoning-effort suffix
 * (`gemini-4-hydrogen-low`, `claude-sonnet-5-5-medium`) that no rate table
 * lists. For that profile only, an id with no rate entry at all is priced at
 * its base id (`gemini-4-hydrogen`), and the provenance names the base id.
 */
import { randomUUID } from 'node:crypto';
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
import type { SessionUsageTotals } from '@ptah-extension/platform-core';

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

/**
 * Profiles whose model ids end in a reasoning-effort suffix the rate tables
 * do not carry. Anchored and narrow: only these exact suffixes are removed.
 */
const EFFORT_SUFFIX_BY_PROFILE: Readonly<Record<string, RegExp>> = {
  antigravity: /-(?:low|medium|high|xhigh)$/,
};

/** The base model id to price `model` at for `profile`, when it differs. */
export function providerSessionPricingFallback(
  profile: string | undefined,
  model: string | undefined,
): string | undefined {
  if (!profile || !model || !Object.hasOwn(EFFORT_SUFFIX_BY_PROFILE, profile))
    return undefined;
  const base = model.replace(EFFORT_SUFFIX_BY_PROFILE[profile], '');
  return base !== model && base.length > 0 ? base : undefined;
}

/** What a resumed session persisted before this process. */
export type ProviderSessionUsageSeed = SessionUsageTotals;

export interface ProviderSessionUsageLedgerOptions {
  /** The session's profile; selects the profile's pricing fallback. */
  readonly profile?: string;
  /** Persisted totals of a restored session. */
  readonly seed?: ProviderSessionUsageSeed | null;
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
  /** Persistence identity: this ledger's run and the turn's place in it. */
  readonly runId: string;
  readonly runTurn: number;
  /**
   * Monotonic across processes: time-based, above every revision this
   * ledger wrote or the seed carried. Completeness never depends on it.
   */
  readonly revision: number;
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
  /** Identity of this ledger's persisted turns (one per process lifetime). */
  readonly runId = randomUUID();
  private runTurns = 0;
  /** Every turn of the session is counted: a fresh session only. */
  private readonly complete: boolean;
  private lastRevision = 0;
  private readonly profile?: string;

  constructor(
    private readonly sessionId: string,
    private readonly billingMode: ProviderSessionBillingMode,
    /** Restored from history: earlier turns count only through a seed, as partial. */
    restored: boolean,
    options: ProviderSessionUsageLedgerOptions = {},
  ) {
    this.profile = options.profile;
    const seed = restored ? options.seed : undefined;
    this.complete = !restored;
    if (seed) this.applySeed(seed);
  }

  /** Count one completed turn and return its price and the new snapshot. */
  record(
    model: string | undefined,
    usage: ProviderUsage,
    duration: number,
    contextCapacity: ContextCapacity | undefined,
  ): ProviderSessionTurnUsage {
    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheCreation = usage.cacheWriteTokens ?? 0;
    const turnPrice = priceTurn(model, usage, this.billingMode, this.profile);
    this.turnCount += 1;
    this.runTurns += 1;
    const revision = this.nextRevision();
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
    const totals = this.models.get(key) ?? emptyTotals();
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
    return {
      turnPrice,
      snapshot: this.snapshot(),
      runId: this.runId,
      runTurn: this.runTurns,
      revision,
    };
  }

  private nextRevision(): number {
    this.lastRevision = Math.max(Date.now(), this.lastRevision + 1);
    return this.lastRevision;
  }

  /** Count what a restored session persisted before this process. */
  private applySeed(seed: ProviderSessionUsageSeed): void {
    this.lastRevision = seed.maxRevision;
    this.turnCount = seed.events;
    if (Number.isFinite(seed.durationMs) && seed.durationMs > 0)
      this.durationMs = seed.durationMs;
    for (const row of seed.models) {
      const priced = Math.max(0, row.events - row.unpricedEvents);
      const knownCost = (row.knownCostMicroUsd ?? 0) / 1e6;
      this.pricedTurns += priced;
      this.unpricedTurns += row.unpricedEvents;
      this.knownCost += knownCost;
      // A persisted unpriced turn without a model had no rate to miss.
      if (row.unpricedEvents > 0 && row.modelId === null)
        this.onlyRateMissing = false;
      if (priced > 0) {
        for (const authority of row.costAuthorities) {
          if (authority === 'provider-reported') this.bases.add('reported');
          else if (authority === 'model-priced')
            this.bases.add(
              this.billingMode === 'subscription'
                ? 'covered-by-subscription'
                : 'estimated',
            );
        }
      }
      const key = row.modelId ?? '';
      const totals = this.models.get(key) ?? emptyTotals();
      totals.inputTokens += row.inputTokens;
      totals.outputTokens += row.outputTokens;
      totals.cacheRead += row.cacheReadTokens;
      totals.cacheCreation += row.cacheCreationTokens;
      totals.knownCost += knownCost;
      totals.pricedTurns += priced;
      totals.unpricedTurns += row.unpricedEvents;
      this.models.set(key, totals);
    }
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
    const complete = this.complete;
    // A restored session's uncounted earlier turns: never a total.
    const totalCost =
      complete && pricingCoverage === 'full' ? round(this.knownCost) : null;
    const costBasis: SessionCostBasis =
      totalCost === null
        ? 'unknown'
        : this.bases.size === 1
          ? [...this.bases][0]
          : 'estimated';
    // The cause holds for a restored session too: the turns it counted have
    // no published rate, whatever ran before the restore. Only a session
    // with a priced turn (a partial known subtotal) loses the label.
    const costUnavailableReason: SessionCostUnavailableReason | undefined =
      totalCost === null &&
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
      // A labeled subtotal: some turns unpriced, or earlier turns uncounted.
      ...(pricingCoverage === 'partial' ||
      (!complete && this.pricedTurns > 0)
        ? { knownCost: round(this.knownCost) }
        : {}),
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

/**
 * One turn's price. A provider-reported cost wins; no model is unpriced. A
 * model with no rate entry at all is priced at the profile's base id
 * ({@link providerSessionPricingFallback}) when that id has one.
 */
export function priceTurn(
  model: string | undefined,
  usage: ProviderUsage,
  billingMode: ProviderSessionBillingMode,
  profile?: string,
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
  const price = (id: string) =>
    calculateExactMessageCost(
      id,
      {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheHit: usage.cacheReadTokens ?? 0,
        cacheCreation: usage.cacheWriteTokens ?? 0,
      },
      { billingMode, cacheSemantics: 'disjoint', usageObserved: true },
    );
  const exact = price(model ?? '');
  // Only a model the tables do not list at all: a listed model whose rate
  // is incomplete stays as its own entry says.
  if (exact.totalCost !== null || exact.priceProvenance) return exact;
  const base = providerSessionPricingFallback(profile, model);
  if (!base) return exact;
  const fallback = price(base);
  return fallback.priceProvenance ? fallback : exact;
}

function emptyTotals(): ModelTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheCreation: 0,
    knownCost: 0,
    pricedTurns: 0,
    unpricedTurns: 0,
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
