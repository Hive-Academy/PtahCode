/**
 * Whether a subagent should be resumed or replaced by a fresh one, from what
 * the subagent budget monitor knows about it, and the refusal text for a
 * SendMessage that must not reach it.
 */
import { formatBudgetPauseNotice } from '@ptah-extension/shared';
import type { AgentBudgetState } from './subagent-budget-monitor';

export type SubagentResumeAdvice = 'fresh' | 'resume';

/**
 * A refusal for a SendMessage target, or null to permit forwarding.
 *
 * - A live agent whose new work is paused is never stopped: the refusal does not interrupt it,
 *   says the execution remains live, and leaves the decision to the parent.
 * - An agent that returned normally after a handoff request routes new work to a successor.
 * - An explicit stop and an idle agent past the budget warning retain their resume guidance.
 *
 * `id` names the target in the pause copy; it defaults to a neutral phrase.
 */
export function buildBudgetResumeRefusal(state: AgentBudgetState, id = 'this agent'): string | null {
  const guidance = state.recordPath
    ? `Start a new agent with a short brief from the handoff record.`
    : `Start a new agent with a short brief from the available context.`;
  const record = state.recordPath ? ` (handoff record: ${state.recordPath})` : '';
  const contextWarning = state.contextTokens !== null &&
    state.contextTokens >= state.warningRatio * state.handoffTokens;
  const contextDetail = contextWarning
    ? ` (current: ${state.contextTokens} context tokens; handoff limit: ${state.handoffTokens} tokens)`
    : '';
  if (state.sdkOutcome) return `The SDK reports that ${id} ${state.sdkOutcome}. ${guidance}`;
  if (state.stopState === 'stopped') return `Ptah's budget monitor stopped this agent${contextDetail}${record}. ${guidance}`;
  if (state.lifecycle === 'finalizing' || state.stopState === 'pending') {
    return `${id} is returning its handoff to Ptah. Wait for the handoff before delegating more work.`;
  }
  if (state.lifecycle === 'settled' || state.stopped) {
    return `${id} already returned its handoff to Ptah${contextDetail}${record}. ${guidance}`;
  }
  if (state.lifecycle === 'paused' || state.admission === 'paused') {
    const pause = state.pauseNotice
      ? formatBudgetPauseNotice(state.pauseNotice, id)
      : `Ptah budget monitor paused new work for ${id}. The execution remains live. Review its progress and decide how it should continue.`;
    return `${pause} New delegated work was not sent to it.`;
  }
  if (state.lifecycle === 'running' || state.lifecycle === 'asked' || state.admission === 'asked-handoff') return null;
  if (!state.warned && (state.running || !contextWarning)) return null;
  return `Ptah's budget monitor refuses this resume at the ${Math.round(state.warningRatio * 100)}% budget warning${contextDetail}${record}. ${guidance}`;
}

export interface SubagentResumeAdviceInput {
  /** The agent already returned its handoff (or was stopped explicitly). */
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
 * Whether to resume a subagent or start a fresh one: `fresh` when it already
 * returned its handoff or was stopped, its prompt cache is cold, its context reached 85% of the handoff size, or
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
