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

export interface CodexChildBudgetDecision {
  readonly parentThreadId: string;
  readonly childThreadId: string;
  readonly telemetry: AgentTurnTelemetry;
  /** The parent delta is safe only when the caller can isolate one child turn. */
  readonly provenance: 'child-thread' | 'parent-delta' | 'telemetry-unavailable';
  readonly transition: AgentBudgetTransition;
}

/** Decision side of Codex child budgets. The host owns interrupt and resume admission. */
export class CodexChildBudgetTap {
  private readonly policy: AgentBudgetPolicy;
  private readonly parents = new Map<string, string>();
  private readonly pending = new Map<string, CodexRuntimeEvent>();
  private readonly snapshots = new Map<string, AgentBudgetSnapshot>();
  private readonly completed = new Map<string, CodexChildBudgetDecision>();

  constructor(settings: AgentBudgetSettings) {
    this.policy = new AgentBudgetPolicy(settings);
  }

  observe(event: CodexRuntimeEvent): void {
    if ((event.type === 'toolStarted' || event.type === 'toolCompleted') && event.agentThreadIds) {
      for (const child of event.agentThreadIds) this.parents.set(child, event.threadId);
    }
    if (event.type === 'usage' && event.evidence?.accepted) {
      this.pending.set(this.turnKey(event.threadId, event.turnId), event);
      if (event.evidence.parentThreadId)
        this.parents.set(event.threadId, event.evidence.parentThreadId);
    }
    if (event.type === 'terminal' && event.evidence?.parentThreadId)
      this.parents.set(event.threadId, event.evidence.parentThreadId);
  }

  /** Call after the child terminal and any trailing usage notifications are drained. */
  completeChildTurn(input: {
    parentThreadId: string;
    childThreadId: string;
    turnId: string;
    modelId?: string;
    elapsedMs: number;
    pricing: ModelPricing | null;
    /** Explicitly isolated parent-thread delta; never infer it from a shared parent turn. */
    parentDelta?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
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
    const usage = useChild ? child.usage : input.parentDelta;
    const modelId = evidence?.modelId ?? input.modelId;
    const telemetry = completedTurnTelemetry({
      turnId: `${childThreadId}:${turnId}`,
      modelId,
      source: 'stream',
      usage: usage && {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: useChild
          ? evidence?.cacheSemanticsAmbiguous ? undefined : child?.usage.cachedInputTokens
          : input.parentDelta?.cacheReadTokens,
        cacheWriteTokens: useChild
          ? evidence?.cacheSemanticsAmbiguous ? undefined : child?.usage.cacheWriteInputTokens
          : input.parentDelta?.cacheWriteTokens,
        contextTokens: useChild ? evidence?.lastRequestTotalTokens : undefined,
      },
    });
    const provenance = telemetry.status === 'unavailable' ? 'telemetry-unavailable' :
      useChild ? 'child-thread' : 'parent-delta';
    const key = `${parentThreadId}\u0000${childThreadId}`;
    const transition = this.policy.evaluate(
      this.snapshots.get(key) ?? initialAgentBudgetSnapshot,
      telemetry,
      input.elapsedMs,
      input.pricing,
    );
    this.snapshots.set(key, transition.snapshot);
    const decision = { parentThreadId, childThreadId, telemetry, provenance, transition } as const;
    this.completed.set(turnKey, decision);
    this.pending.delete(turnKey);
    return decision;
  }

  releaseChild(childThreadId: string): void {
    const parent = this.parents.get(childThreadId);
    if (parent) this.snapshots.delete(`${parent}\u0000${childThreadId}`);
    this.parents.delete(childThreadId);
    for (const key of this.pending.keys())
      if (key.startsWith(`${childThreadId}\u0000`)) this.pending.delete(key);
    for (const key of this.completed.keys())
      if (key.startsWith(`${childThreadId}\u0000`)) this.completed.delete(key);
  }

  dispose(): void {
    this.parents.clear();
    this.pending.clear();
    this.snapshots.clear();
    this.completed.clear();
  }

  private turnKey(threadId: string, turnId: string): string {
    return `${threadId}\u0000${turnId}`;
  }
}
