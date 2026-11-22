import { z } from 'zod';
import type { CodexUsageCounters, CodexUsageEvidence } from '@ptah-extension/codex-runtime';
import { resolveContextCapacity, type PriceProvenance, type SessionCostBasis, type SessionStatsEntry } from '@ptah-extension/shared';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const MAX_USAGE_THREADS = 256;
const countersSchema = z.object({
  uncachedInputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheCreationTokens: count,
  reasoningOutputTokens: count,
  totalTokens: count,
}).strict();
const threadSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  parentThreadId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  modelContextWindow: count.positive().optional(),
  lastRequestTotalTokens: count.optional(),
  epoch: count,
  timestamp: count,
  terminalState: z.enum(['none', 'completed', 'failed', 'interrupted']),
  counters: countersSchema,
  accrued: countersSchema,
}).strict();
const provenanceSchema = z.object({
  modelIdUsed: z.string(),
  catalogSource: z.string().nullable().optional(),
  catalogVersion: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
}).strict();
const basisSchema = z.enum(['estimated', 'covered-by-subscription', 'unknown']);
const pricingSegmentSchema = z.object({
  basis: basisSchema,
  knownCost: z.number().finite().nonnegative(),
  turns: count.positive(),
}).strict();
const pricingSchema = z.object({
  throughRevision: count,
  knownCost: z.number().finite().nonnegative(),
  complete: z.boolean(),
  provenance: z.array(provenanceSchema).max(MAX_USAGE_THREADS),
  basis: basisSchema.optional(),
  segments: z.array(pricingSegmentSchema).max(MAX_USAGE_THREADS).optional(),
}).strict();
/**
 * Codex session Time: wall-clock time per turn, from turn start to its last
 * stats publish or exit, approval waits included. The finished turns' sum and
 * the latest turn are kept apart so a turn that publishes stats more than once
 * is counted once. Stored beside the checkpoint, never inside its strict
 * version-2 shape, so an older build still reads and writes the checkpoint.
 */
export const codexTurnDurationSchema = z.object({
  completedMs: count,
  turnId: z.string().min(1).optional(),
  turnMs: count,
});
export type CodexTurnDuration = z.infer<typeof codexTurnDurationSchema>;

/** Total milliseconds of a stored turn-time record. */
export function codexTurnDurationTotal(duration: CodexTurnDuration | undefined): number {
  return duration ? duration.completedMs + duration.turnMs : 0;
}
export const codexUsageCheckpointSchema = z.object({
  version: z.literal(2),
  sessionId: z.string().min(1),
  rootThreadId: z.string().min(1),
  revision: count,
  coverage: z.enum(['complete', 'partial']),
  childInclusion: z.enum(['disjoint', 'unverified']),
  cacheSemanticsAmbiguous: z.boolean(),
  /** Batch 3 pricing provenance placeholders. Null means no catalog was applied. */
  catalogSource: z.string().nullable(),
  catalogVersion: z.string().nullable(),
  total: countersSchema,
  childTotal: countersSchema,
  threads: z.array(threadSchema).max(MAX_USAGE_THREADS),
  pricing: pricingSchema.optional(),
  billingMode: z.enum(['subscription', 'api-key', 'unknown']).optional(),
}).strict();
export type CodexUsageCheckpoint = z.infer<typeof codexUsageCheckpointSchema>;
export type CodexUsageOwnerDiagnostic = 'invalid-checkpoint' | 'unknown-version' | 'session-mismatch' |
  'root-mismatch' | 'counter-decrease' | 'missing-parent' | 'missing-epoch' |
  'class-conflict' | 'classes-inconsistent' | 'reasoning-exceeds-output' |
  'thread-limit' | 'child-inclusion-unverified' | 'missing-usage-evidence' |
  'model-change';

const ZERO: CodexUsageCounters = Object.freeze({
  uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheCreationTokens: 0, reasoningOutputTokens: 0, totalTokens: 0,
});
const keys = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'reasoningOutputTokens', 'totalTokens'] as const;
type Thread = z.infer<typeof threadSchema>;
type MutableCounters = Record<keyof CodexUsageCounters, number>;

function sum(left: CodexUsageCounters, right: CodexUsageCounters): MutableCounters | null {
  const result: MutableCounters = { ...left };
  for (const key of keys) {
    result[key] += right[key];
    if (!Number.isSafeInteger(result[key])) return null;
  }
  return result;
}

function equal(left: CodexUsageCounters, right: CodexUsageCounters): boolean {
  return keys.every((key) => left[key] === right[key]);
}

/** One owner per Ptah session. Native cumulative counters are never summed as notifications. */
export class CodexSessionUsageOwner {
  private readonly threads = new Map<string, Thread>();
  private total: CodexUsageCounters = ZERO;
  private childTotal: CodexUsageCounters = ZERO;
  private revision = 0;
  private coverage: 'complete' | 'partial' = 'complete';
  private cacheSemanticsAmbiguous = false;
  private readonly diagnostics = new Set<CodexUsageOwnerDiagnostic>();
  private restoredCheckpoint = false;
  private pricing: z.infer<typeof pricingSchema> = {
    throughRevision: 0, knownCost: 0, complete: true, provenance: [],
  };
  private duration: CodexTurnDuration = { completedMs: 0, turnMs: 0 };

  constructor(readonly sessionId: string, readonly rootThreadId: string,
    private readonly childInclusion: 'disjoint' | 'unverified' = 'unverified') {}

  static restore(sessionId: string, rootThreadId: string, raw: unknown): CodexSessionUsageOwner {
    const parsed = codexUsageCheckpointSchema.safeParse(raw);
    const owner = new CodexSessionUsageOwner(sessionId, rootThreadId,
      parsed.success ? parsed.data.childInclusion : 'unverified');
    if (!parsed.success) {
      // Caller logs the returned diagnostic when persisted data is rejected.
      owner.markPartial(typeof raw === 'object' && raw !== null && 'version' in raw && raw.version !== 2
        ? 'unknown-version' : 'invalid-checkpoint');
      return owner;
    }
    const saved = parsed.data;
    if (saved.sessionId !== sessionId || saved.rootThreadId !== rootThreadId) {
      owner.markPartial(saved.sessionId !== sessionId ? 'session-mismatch' : 'root-mismatch');
      return owner;
    }
    const seen = new Set<string>();
    let root: CodexUsageCounters = ZERO;
    let children: CodexUsageCounters = ZERO;
    for (const thread of saved.threads) {
      if (seen.has(thread.threadId) || thread.counters.reasoningOutputTokens > thread.counters.outputTokens ||
        keys.some((key) => thread.accrued[key] < thread.counters[key])) {
        owner.markPartial('invalid-checkpoint');
        return owner;
      }
      seen.add(thread.threadId);
      const next = sum(thread.threadId === rootThreadId ? root : children, thread.accrued);
      if (!next) { owner.markPartial('invalid-checkpoint'); return owner; }
      if (thread.threadId === rootThreadId) root = next;
      else children = next;
    }
    const computedTotal = saved.childInclusion === 'disjoint' ? sum(root, children) : root;
    const segments = saved.pricing?.segments;
    if (segments && saved.pricing) {
      const segmentCost = segments.reduce((total, segment) => total + segment.knownCost, 0);
      const firstSegment = segments[0];
      const segmentBasis = firstSegment === undefined ? undefined
        : segments.every((segment) => segment.basis === firstSegment.basis)
          ? firstSegment.basis : 'unknown';
      if (!Number.isFinite(segmentCost) || (saved.pricing.complete && (
        Math.abs(segmentCost - saved.pricing.knownCost) > 1e-9 ||
        segmentBasis !== saved.pricing.basis))) {
        owner.markPartial('invalid-checkpoint');
        return owner;
      }
    }
    if (saved.revision < saved.threads.length ||
      (saved.pricing !== undefined && saved.pricing.throughRevision > saved.revision) ||
      (saved.threads.length > 0 && !seen.has(rootThreadId) && saved.coverage !== 'partial') ||
      saved.threads.some((thread) => thread.parentThreadId === thread.threadId) ||
      saved.threads.some((thread) => thread.threadId !== rootThreadId &&
        (!thread.parentThreadId || thread.parentThreadId === thread.threadId ||
          !seen.has(thread.parentThreadId)) && saved.coverage !== 'partial') ||
      !computedTotal || !equal(computedTotal, saved.total) || !equal(children, saved.childTotal) ||
      (children.totalTokens > 0 && saved.childInclusion === 'unverified' && saved.coverage !== 'partial')) {
      owner.markPartial('invalid-checkpoint');
      return owner;
    }
    for (const thread of saved.threads) owner.threads.set(thread.threadId, thread);
    owner.total = saved.total;
    owner.childTotal = saved.childTotal;
    owner.revision = saved.revision;
    owner.coverage = saved.coverage;
    owner.cacheSemanticsAmbiguous = saved.cacheSemanticsAmbiguous;
    owner.pricing = saved.pricing ?? {
      throughRevision: 0, knownCost: 0,
      complete: saved.total.totalTokens === 0, provenance: [],
    };
    // Pre-fix checkpoints stored a single mode for all priced turns.
    if (saved.pricing && !saved.pricing.basis && saved.pricing.throughRevision > 0) {
      owner.pricing = { ...owner.pricing, basis: saved.billingMode === 'subscription'
        ? 'covered-by-subscription' : saved.billingMode === 'api-key'
          ? 'estimated' : 'unknown' };
    }
    if (saved.pricing && !saved.pricing.segments && saved.pricing.throughRevision > 0) {
      owner.pricing = { ...owner.pricing, segments: [{
        basis: owner.pricing.basis ?? 'unknown',
        knownCost: owner.pricing.knownCost,
        turns: 1,
      }] };
    }
    owner.restoredCheckpoint = true;
    return owner;
  }

  getDiagnostics(): readonly CodexUsageOwnerDiagnostic[] { return [...this.diagnostics]; }
  isRestoredCheckpoint(): boolean { return this.restoredCheckpoint; }

  recordTurnPrice(price: {
    readonly totalCost: number | null;
    readonly costBasis: SessionCostBasis;
    readonly priceProvenance?: PriceProvenance;
  }): void {
    const basis = price.costBasis === 'reported' ? 'unknown' : price.costBasis;
    const addition = price.totalCost !== null && price.totalCost >= 0 &&
      Number.isFinite(price.totalCost) ? price.totalCost : null;
    const nextCost = this.pricing.knownCost + (addition ?? 0);
    const newProvenance = price.priceProvenance &&
      !this.pricing.provenance.some((item) =>
        item.modelIdUsed === price.priceProvenance?.modelIdUsed &&
        item.catalogVersion === price.priceProvenance?.catalogVersion)
      ? price.priceProvenance : undefined;
    const provenance = newProvenance &&
      this.pricing.provenance.length < MAX_USAGE_THREADS
      ? [...this.pricing.provenance, newProvenance]
      : this.pricing.provenance;
    const previousSegments = this.pricing.segments ?? [];
    const lastSegment = previousSegments.at(-1);
    const canAppendSegment = lastSegment?.basis === basis ||
      previousSegments.length < MAX_USAGE_THREADS;
    const segments = lastSegment?.basis === basis
      ? [...previousSegments.slice(0, -1), {
          basis: lastSegment.basis,
          knownCost: lastSegment.knownCost + (addition ?? 0),
          turns: lastSegment.turns + 1,
        }]
      : canAppendSegment
        ? [...previousSegments, { basis,
            knownCost: addition ?? 0, turns: 1 }]
        : previousSegments;
    this.pricing = {
      throughRevision: this.revision,
      knownCost: Number.isFinite(nextCost) ? nextCost : this.pricing.knownCost,
      complete: this.pricing.complete && addition !== null &&
        Number.isFinite(nextCost) &&
        (!newProvenance || provenance.length > this.pricing.provenance.length) &&
        canAppendSegment,
      provenance,
      segments,
      basis: this.pricing.basis === undefined ? basis
        : this.pricing.basis === basis ? this.pricing.basis : 'unknown',
    };
  }

  /**
   * Restore the turn time stored beside the checkpoint. An absent or invalid
   * record leaves the time unknown; it never affects usage coverage.
   */
  restoreDuration(raw: unknown): void {
    const parsed = codexTurnDurationSchema.safeParse(raw);
    if (parsed.success &&
      Number.isSafeInteger(codexTurnDurationTotal(parsed.data)))
      this.duration = parsed.data;
  }

  /** The turn-time record to persist beside the checkpoint. */
  serializeDuration(): CodexTurnDuration {
    return { ...this.duration };
  }

  /**
   * Record a turn's wall-clock elapsed time. A repeated call for the same turn replaces
   * that turn's figure (a turn may publish stats more than once); a new turn
   * folds the previous one into the finished sum.
   */
  recordTurnDuration(turnId: string, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const turnMs = Math.round(ms);
    if (this.duration.turnId === turnId) {
      this.duration = { ...this.duration, turnMs: Math.max(this.duration.turnMs, turnMs) };
      return;
    }
    const completedMs = this.duration.completedMs + this.duration.turnMs;
    if (!Number.isSafeInteger(completedMs + turnMs)) return;
    this.duration = { completedMs, turnId, turnMs };
  }

  private durationMs(): number | null {
    const total = this.duration.completedMs + this.duration.turnMs;
    return total > 0 ? total : null;
  }

  lifetimePrice(): {
    totalCost: number | null;
    costBasis: 'unknown' | 'estimated' | 'covered-by-subscription';
    pricingCoverage: 'none' | 'partial' | 'full';
    priceProvenance?: z.infer<typeof provenanceSchema>[];
  } {
    const complete = this.pricing.basis !== undefined && this.pricing.basis !== 'unknown' &&
      this.pricing.complete &&
      this.pricing.throughRevision === this.revision && this.coverage === 'complete';
    return {
      totalCost: complete ? this.pricing.knownCost : null,
      costBasis: complete ? this.pricing.basis ?? 'unknown' : 'unknown',
      pricingCoverage: complete ? 'full' : this.pricing.knownCost > 0 ? 'partial' : 'none',
      ...(this.pricing.provenance.length
        ? { priceProvenance: this.pricing.provenance } : {}),
    };
  }

  accept(evidence: CodexUsageEvidence): boolean {
    if (!evidence.accepted) return false;
    const prior = this.threads.get(evidence.threadId);
    if (!prior && this.threads.size >= MAX_USAGE_THREADS) {
      this.markPartial('thread-limit'); return false;
    }
    if (!prior && evidence.epoch > 0) this.markPartial('missing-epoch');
    const reset = prior !== undefined && evidence.epoch > prior.epoch &&
      evidence.resetOrStale && evidence.diagnostics.includes('counter-reset');
    const firstProvedReset = !prior && evidence.epoch > 0 && evidence.resetOrStale &&
      evidence.diagnostics.includes('counter-reset');
    if (prior && evidence.epoch < prior.epoch) return false;
    if (prior && evidence.epoch > prior.epoch && !reset) {
      this.markPartial('counter-decrease');
      return false;
    }
    if (prior && evidence.epoch === prior.epoch && evidence.timestamp < prior.timestamp) return false;
    if (evidence.resetOrStale && !reset && !firstProvedReset) {
      this.markPartial('counter-decrease');
      return false;
    }
    if (prior && !reset && evidence.total.totalTokens === prior.counters.totalTokens &&
      keys.some((key) => evidence.total[key] !== prior.counters[key])) {
      this.markPartial('class-conflict'); return false;
    }
    if (evidence.lastExceedsTotal || evidence.diagnostics.includes('classes-inconsistent'))
      this.markPartial('classes-inconsistent');
    this.cacheSemanticsAmbiguous ||= evidence.cacheSemanticsAmbiguous;
    const baseline = reset || !prior ? ZERO : prior.counters;
    const delta: Record<keyof CodexUsageCounters, number> = { ...ZERO };
    for (const key of keys) {
      if (evidence.total[key] < baseline[key]) {
        this.markPartial('counter-decrease');
        return false;
      }
      delta[key] = evidence.total[key] - baseline[key];
    }
    if (evidence.total.reasoningOutputTokens > evidence.total.outputTokens) {
      this.markPartial('reasoning-exceeds-output');
      return false;
    }
    const accrued = sum(prior?.accrued ?? ZERO, delta);
    const isRoot = evidence.threadId === this.rootThreadId;
    const root = isRoot ? sum(this.rootAccrued(), delta) : this.rootAccrued();
    const children = isRoot ? this.childTotal : sum(this.childTotal, delta);
    const total = root && children
      ? this.childInclusion === 'disjoint' ? sum(root, children) : root
      : null;
    if (!accrued || !children || !total) {
      this.markPartial('counter-decrease'); return false;
    }
    const terminalState = evidence.terminalState === 'none' && prior?.turnId === evidence.turnId
      ? prior.terminalState : evidence.terminalState;
    const changed = keys.some((key) => delta[key] > 0);
    const modelChanged = !!evidence.modelId && evidence.modelId !== prior?.modelId;
    const contextChanged = evidence.modelContextWindow !== undefined &&
      evidence.modelContextWindow !== prior?.modelContextWindow;
    const requestChanged = evidence.lastRequestTotalTokens !== undefined &&
      evidence.lastRequestTotalTokens !== prior?.lastRequestTotalTokens;
    if (!changed && prior && !reset && evidence.turnId === prior.turnId &&
      terminalState === prior.terminalState && !modelChanged && !contextChanged &&
      !requestChanged) return false;
    this.total = total;
    this.childTotal = children;
    this.threads.set(evidence.threadId, {
      threadId: evidence.threadId, turnId: evidence.turnId,
      ...(evidence.parentThreadId ? { parentThreadId: evidence.parentThreadId } :
        prior?.parentThreadId ? { parentThreadId: prior.parentThreadId } : {}),
      ...(evidence.modelId ? { modelId: evidence.modelId } :
        prior?.modelId ? { modelId: prior.modelId } : {}),
      ...(evidence.modelContextWindow ? { modelContextWindow: evidence.modelContextWindow } :
        !modelChanged && prior?.modelContextWindow
          ? { modelContextWindow: prior.modelContextWindow } : {}),
      ...(evidence.lastRequestTotalTokens !== undefined
        ? { lastRequestTotalTokens: evidence.lastRequestTotalTokens }
        : !modelChanged && prior?.lastRequestTotalTokens !== undefined
          ? { lastRequestTotalTokens: prior.lastRequestTotalTokens } : {}),
      epoch: evidence.epoch, timestamp: evidence.timestamp,
      terminalState, counters: evidence.total, accrued,
    });
    if (changed || reset || !prior || evidence.turnId !== prior.turnId ||
      terminalState !== prior.terminalState) this.revision += 1;
    if (!isRoot && (!evidence.parentThreadId ||
      !this.threads.has(evidence.parentThreadId)))
      this.markPartial('missing-parent');
    if (!this.threads.has(this.rootThreadId)) this.markPartial('missing-parent');
    if (!isRoot && this.childInclusion === 'unverified')
      this.markPartial('child-inclusion-unverified');
    return true;
  }

  serialize(): CodexUsageCheckpoint {
    return {
      version: 2, sessionId: this.sessionId, rootThreadId: this.rootThreadId,
      revision: this.revision, coverage: this.coverage, childInclusion: this.childInclusion,
      cacheSemanticsAmbiguous: this.cacheSemanticsAmbiguous,
      // Batch 3 will fill pricing provenance after applying a catalog.
      catalogSource: null, catalogVersion: null, total: this.total, childTotal: this.childTotal,
      threads: [...this.threads.values()].sort((a, b) => a.threadId.localeCompare(b.threadId)),
      pricing: this.pricing,
    };
  }

  snapshot(messageCount = 0): SessionStatsEntry {
    const root = this.threads.get(this.rootThreadId);
    const model = root?.modelId ??
      [...this.threads.values()].sort((a, b) => a.threadId.localeCompare(b.threadId))[0]?.modelId ?? null;
    const capacity = model ? resolveContextCapacity({
      route: { kind: 'native', providerId: null }, model,
      sdkContextWindow: root?.modelContextWindow,
    }) : undefined;
    const contextWindow = capacity?.tokens;
    const price = this.lifetimePrice();
    return {
      sessionId: this.sessionId, model,
      totalCost: price.totalCost, costBasis: price.costBasis,
      pricingCoverage: price.pricingCoverage,
      ...(price.priceProvenance ? { priceProvenance: price.priceProvenance } : {}),
      ...(model && capacity && contextWindow && root?.lastRequestTotalTokens !== undefined
        ? { contextSnapshot: {
            model, contextTokens: Math.min(root.lastRequestTotalTokens, contextWindow),
            contextWindow, contextCapacity: capacity,
          } } : {}),
      tokens: {
        input: this.total.uncachedInputTokens, output: this.total.outputTokens,
        cacheRead: this.total.cacheReadTokens, cacheCreation: this.total.cacheCreationTokens,
      },
      tokenCount: this.total.uncachedInputTokens + this.total.outputTokens + this.total.cacheReadTokens + this.total.cacheCreationTokens,
      messageCount, status: this.threads.size ? 'ok' : 'empty',
      coverage: this.coverage, scope: 'session',
      durationMs: this.durationMs(),
    };
  }

  markMissingCheckpoint(): void {
    this.markPartial('invalid-checkpoint');
  }

  markMissingEvidence(): void {
    this.markPartial('missing-usage-evidence');
  }

  private rootAccrued(): CodexUsageCounters {
    return this.threads.get(this.rootThreadId)?.accrued ?? ZERO;
  }

  private markPartial(reason: CodexUsageOwnerDiagnostic): void {
    this.coverage = 'partial';
    this.diagnostics.add(reason);
  }
}
