import {
  AgentBudgetPolicy,
  type AgentBudgetSettings,
  type AgentBudgetSnapshot,
  type AgentBudgetTransition,
  type AgentTurnTelemetry,
  completedTurnTelemetry,
  initialAgentBudgetSnapshot,
  type ModelPricing,
} from '@ptah-extension/shared';
import type { CodexRuntimeEvent } from './codex-runtime.types';
import { z } from 'zod';

/** Bound for every map in one tap; the oldest tracked child is released first. */
export const CODEX_CHILD_BUDGET_MAX_ENTRIES = 128;

export interface CodexChildBudgetDecision {
  readonly parentThreadId: string;
  readonly childThreadId: string;
  readonly telemetry: AgentTurnTelemetry;
  readonly provenance: 'child-thread' | 'telemetry-unavailable';
  readonly transition: AgentBudgetTransition;
}

/** Decision side of Codex child budgets. The host owns interrupt and resume admission. */
export class CodexChildBudgetTap {
  private readonly policy: AgentBudgetPolicy;
  private readonly parents = new Map<string, string>();
  private readonly startedAt = new Map<string, number>();
  private readonly childModels = new Map<string, string>();
  private readonly pending = new Map<string, CodexRuntimeEvent>();
  private readonly snapshots = new Map<string, AgentBudgetSnapshot>();
  private readonly completed = new Map<string, CodexChildBudgetDecision>();

  constructor(
    settings: AgentBudgetSettings,
    private readonly now: () => number = Date.now,
  ) {
    this.policy = new AgentBudgetPolicy(settings);
  }

  /** Track attribution and accepted usage; events of untracked threads leave no state. */
  observe(event: CodexRuntimeEvent): void {
    if (event.parentThreadId) this.remember(event.threadId, event.parentThreadId);
    if ((event.type === 'toolStarted' || event.type === 'toolCompleted') && event.agentThreadIds) {
      const payload = event.type === 'toolStarted' ? event.input : event.output;
      const parsedModel = z.object({ model: z.string().min(1) }).safeParse(payload);
      const model = parsedModel.success ? parsedModel.data.model : undefined;
      for (const child of event.agentThreadIds) {
        this.remember(child, event.threadId);
        if (model) this.childModels.set(child, model);
      }
    }
    if ((event.type === 'usage' || event.type === 'terminal') && event.evidence?.parentThreadId)
      this.remember(event.threadId, event.evidence.parentThreadId);
    if (event.type === 'usage' && event.evidence?.accepted && this.parents.has(event.threadId))
      this.setBounded(this.pending, this.turnKey(event.threadId, event.turnId), event);
  }

  parentOf(childThreadId: string): string | undefined {
    return this.parents.get(childThreadId);
  }

  /** Model of the accepted usage for this child turn, when the terminal does not carry one. */
  modelIdFor(childThreadId: string, turnId: string): string | undefined {
    const event = this.pending.get(this.turnKey(childThreadId, turnId));
    return event?.type === 'usage' ? event.evidence?.modelId : undefined;
  }

  hasAcceptedUsage(childThreadId: string, turnId: string): boolean {
    return this.pending.has(this.turnKey(childThreadId, turnId));
  }

  isCompleted(childThreadId: string, turnId: string): boolean {
    return this.completed.has(this.turnKey(childThreadId, turnId));
  }

  /** Time since the child was first attributed; zero for an untracked child. */
  elapsedMs(childThreadId: string): number {
    const started = this.startedAt.get(childThreadId);
    return started === undefined ? 0 : Math.max(0, this.now() - started);
  }

  /** Number of tracked children; never more than CODEX_CHILD_BUDGET_MAX_ENTRIES. */
  get trackedChildren(): number {
    return this.parents.size;
  }

  /** Call after the child terminal and any trailing usage notifications are drained. */
  completeChildTurn(input: {
    parentThreadId: string;
    childThreadId: string;
    turnId: string;
    modelId?: string;
    elapsedMs: number;
    pricing: ModelPricing | null;
  }): CodexChildBudgetDecision {
    const { parentThreadId, childThreadId, turnId } = input;
    if (this.parents.get(childThreadId) !== parentThreadId)
      throw new Error('Codex child thread has no matching parent attribution');
    const turnKey = this.turnKey(childThreadId, turnId);
    const prior = this.completed.get(turnKey);
    if (prior) return prior;
    const event = this.pending.get(turnKey);
    const child = event?.type === 'usage' ? event : undefined;
    const evidence = child?.evidence;
    const useChild = child !== undefined && evidence?.accepted === true;
    const usage = useChild ? child.usage : undefined;
    // A missing model does not invalidate real counters. Keep the identity
    // explicit so the policy charges its raw-token floor without catalog cost.
    const modelId = evidence?.modelId ?? input.modelId ?? this.childModels.get(childThreadId) ?? 'codex/unknown';
    const telemetry = completedTurnTelemetry({
      turnId: `${childThreadId}:${turnId}`,
      modelId,
      source: 'stream',
      usage: usage && {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: evidence?.cacheSemanticsAmbiguous ? undefined : child?.usage.cachedInputTokens,
        cacheWriteTokens: evidence?.cacheSemanticsAmbiguous ? undefined : child?.usage.cacheWriteInputTokens,
        contextTokens: useChild ? evidence?.lastRequestTotalTokens : undefined,
      },
    });
    const provenance = telemetry.status === 'unavailable' ? 'telemetry-unavailable' : 'child-thread';
    const key = this.snapshotKey(parentThreadId, childThreadId);
    const transition = this.policy.evaluate(
      this.snapshots.get(key) ?? initialAgentBudgetSnapshot,
      telemetry,
      input.elapsedMs,
      input.pricing,
    );
    this.snapshots.set(key, transition.snapshot);
    const decision = { parentThreadId, childThreadId, telemetry, provenance, transition } as const;
    this.setBounded(this.completed, turnKey, decision);
    this.pending.delete(turnKey);
    return decision;
  }

  releaseChild(childThreadId: string): void {
    const parent = this.parents.get(childThreadId);
    if (parent) this.snapshots.delete(this.snapshotKey(parent, childThreadId));
    this.parents.delete(childThreadId);
    this.startedAt.delete(childThreadId);
    this.childModels.delete(childThreadId);
    for (const key of this.pending.keys())
      if (key.startsWith(`${childThreadId}\u0000`)) this.pending.delete(key);
    for (const key of this.completed.keys())
      if (key.startsWith(`${childThreadId}\u0000`)) this.completed.delete(key);
  }

  dispose(): void {
    this.parents.clear();
    this.startedAt.clear();
    this.childModels.clear();
    this.pending.clear();
    this.snapshots.clear();
    this.completed.clear();
  }

  private remember(child: string, parent: string): void {
    const prior = this.parents.get(child);
    if (prior === parent) return;
    if (prior === undefined) {
      while (this.parents.size >= CODEX_CHILD_BUDGET_MAX_ENTRIES) {
        const oldest = this.parents.keys().next().value;
        if (oldest === undefined) break;
        this.releaseChild(oldest);
      }
      this.startedAt.set(child, this.now());
    } else this.snapshots.delete(this.snapshotKey(prior, child));
    this.parents.set(child, parent);
  }

  private setBounded<T>(map: Map<string, T>, key: string, value: T): void {
    if (!map.has(key) && map.size >= CODEX_CHILD_BUDGET_MAX_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
  }

  private snapshotKey(parentThreadId: string, childThreadId: string): string {
    return `${parentThreadId}\u0000${childThreadId}`;
  }

  private turnKey(threadId: string, turnId: string): string {
    return `${threadId}\u0000${turnId}`;
  }
}
