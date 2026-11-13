import type {
  AgentProcessInfo,
  ExecutorCompletionResultV1,
  LaneCompletionSignal,
  LaneCompletionVerdict,
  LaneDeliverableCheck,
  PhaseKind,
  ToolProfileAdapterResultV1,
} from '@ptah-extension/shared';

export function phaseKindFromAgentInfo(info: AgentProcessInfo): PhaseKind | null {
  return info.phaseKind ?? null;
}

export interface LaneCompletionResultInput {
  readonly signal: Pick<LaneCompletionSignal, 'deliverables' | 'verdict'>;
  readonly executorId: string;
  readonly phaseKind: PhaseKind | null;
  readonly parentSignal: string;
  readonly toolProfileAdapter?: ToolProfileAdapterResultV1 | null;
}

/** The lane's existing verdict and deliverable checks, plus phase attribution. */
export function buildLaneCompletionResult(
  input: LaneCompletionResultInput,
): ExecutorCompletionResultV1 {
  return {
    phaseKind: input.phaseKind,
    executorId: input.executorId,
    deliverableCheck: input.signal.deliverables,
    verdict: input.signal.verdict,
    parentSignal: input.parentSignal,
    toolProfileAdapter: input.toolProfileAdapter ?? null,
  };
}

export interface SessionCompletionResultInput {
  readonly executorId: string;
  readonly phaseKind: PhaseKind | null;
  readonly deliverableCheck: readonly LaneDeliverableCheck[];
  readonly verdict: LaneCompletionVerdict;
  readonly parentSignal: string;
  readonly disallowedTools?: readonly string[];
}

/**
 * A child session has no built-in deny channel. A phase that names at least
 * one tool records `unfiltered`. An empty list or a missing phase records none.
 */
export function buildSessionCompletionResult(
  input: SessionCompletionResultInput,
): ExecutorCompletionResultV1 {
  return {
    phaseKind: input.phaseKind,
    executorId: input.executorId,
    deliverableCheck: input.deliverableCheck,
    verdict: input.verdict,
    parentSignal: input.parentSignal,
    toolProfileAdapter: unfilteredAdapter(
      input.executorId,
      input.disallowedTools,
    ),
  };
}

function unfilteredAdapter(
  executorId: string,
  disallowedTools: readonly string[] | undefined,
): ToolProfileAdapterResultV1 | null {
  if (!disallowedTools?.some((name) => name.trim().length > 0)) return null;
  return { executorId, toolProfileStatus: 'unfiltered' };
}
