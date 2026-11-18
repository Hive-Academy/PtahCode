import { AgentBudgetPolicy, resolveContextCapacity, type AgentBudgetSnapshot, type AgentBudgetSettings, type ContextCapacityRoute } from '@ptah-extension/shared';
import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';

const assistant = z.object({ message: z.object({ model: z.string() }) });
const result = z.object({ modelUsage: z.record(z.string(), z.object({ contextWindow: z.number().positive().finite() })) });
export interface SubagentContextState {
  model?: string; contextWindow?: number; initialContext?: number; warningRequestCount?: number;
}
export function effectiveBudgetReached(settings: AgentBudgetSettings, snapshot: AgentBudgetSnapshot, contextTokens: number): boolean {
  const assessment = new AgentBudgetPolicy(settings).assess({ ...snapshot, stopped: false }, 0, contextTokens);
  return assessment.handoff || assessment.stopReason === 'budget';
}
/** Capacity is route-specific evidence, never a model-name heuristic. */
export class SubagentContextLimits {
  private readonly windows = new Map<string, number>();
  private readonly warnedSessions = new Set<string>();
  rekey(from: string, to: string): void {
    if (this.warnedSessions.delete(from)) this.warnedSessions.add(to);
  }
  release(sessionId: string): void { this.warnedSessions.delete(sessionId); }
  warnUnknown(sessionId: string, state: SubagentContextState, logger: Pick<Logger, 'warn'>): void {
    if (state.contextWindow || this.warnedSessions.has(sessionId)) return;
    this.warnedSessions.add(sessionId);
    logger.warn('[SubagentContextLimits] Model context window unknown; model-relative limit is not applied; using configured handoff cap', { sessionId, model: state.model });
  }
  observe(message: unknown, route?: ContextCapacityRoute): void {
    const parsed = result.safeParse(message);
    if (!parsed.success) return;
    for (const [model, usage] of Object.entries(parsed.data.modelUsage)) {
      const capacity = resolveContextCapacity({ route, model, sdkContextWindow: usage.contextWindow });
      if (capacity.source === 'sdk-native' && capacity.tokens) {
        const key = JSON.stringify([route, model]);
        const tokens = Math.min(this.windows.get(key) ?? capacity.tokens, capacity.tokens);
        this.windows.delete(key); this.windows.set(key, tokens);
        if (this.windows.size > 4096) {
          const oldest = this.windows.keys().next().value;
          if (oldest !== undefined) this.windows.delete(oldest);
        }
      }
    }
  }
  settings(settings: AgentBudgetSettings, state: SubagentContextState, message?: unknown, route?: ContextCapacityRoute): AgentBudgetSettings {
    const parsed = assistant.safeParse(message);
    if (parsed.success) {
      const model = parsed.data.message.model;
      if (state.model !== model) state.contextWindow = undefined;
      state.model = model;
      const catalog = resolveContextCapacity({ route, model }).tokens;
      const observed = this.windows.get(JSON.stringify([route, model]));
      state.contextWindow = catalog && observed ? Math.min(catalog, observed) : catalog ?? observed;
    }
    return { ...settings, handoffContextTokens: state.contextWindow
      ? Math.min(settings.handoffContextTokens, Math.max(1, Math.floor(0.9 * state.contextWindow)))
      : settings.handoffContextTokens };
  }
}
