/**
 * Whether a subagent should be resumed or replaced by a fresh one, from what
 * the subagent budget monitor knows about it.
 */

export type SubagentResumeAdvice = 'fresh' | 'resume';

import type { AgentBudgetState } from './subagent-budget-monitor';

/** A refusal for a known stopped or near-limit agent; null permits forwarding. */
export function buildBudgetResumeRefusal(state: AgentBudgetState): string | null {
  if (!state.stopped && !state.warned && (state.running || state.contextTokens === null ||
      state.contextTokens < state.warningRatio * state.handoffTokens)) return null;
  const guidance = state.recordPath
    ? `Start a new agent with a short brief from the handoff record.`
    : `Start a new agent with a short brief from the available context.`;
  return `Ptah's budget monitor ${state.stopped ? 'stopped this agent' : 'refuses this resume at the 85% budget warning'} (current: ${state.contextTokens ?? 'unknown'} tokens; limit: ${state.handoffTokens} tokens${state.recordPath ? `; handoff record: ${state.recordPath}` : ''}). ${guidance}`;
}

export interface SubagentResumeAdviceInput {
  readonly stopped: boolean;
  readonly cacheState: 'warm' | 'cold';
  /** Last known context size; `undefined` when the monitor saw no usage. */
  readonly contextTokens: number | undefined;
  /** `compaction.subagentHandoffTokens`. */
  readonly handoffTokens: number;
  /** Fraction of the handoff size at which a fresh agent is required. */
  readonly warningRatio?: number;
  readonly budgetReached: boolean;
}

/**
 * Whether to resume a subagent or start a fresh one: `fresh` when it was
 * stopped, its prompt cache is cold, its context reached 85% of the handoff size, or
 * it reached its weighted budget; otherwise `resume`.
 */
export function adviseSubagentResume(
  input: SubagentResumeAdviceInput,
): SubagentResumeAdvice {
  if (input.stopped || input.budgetReached || input.cacheState === 'cold') {
    return 'fresh';
  }
  if (
    input.contextTokens !== undefined &&
    input.contextTokens >= (input.warningRatio ?? 0.85) * input.handoffTokens
  ) {
    return 'fresh';
  }
  return 'resume';
}
