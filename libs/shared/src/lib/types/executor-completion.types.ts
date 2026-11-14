import type {
  LaneCompletionVerdict,
  LaneDeliverableCheck,
} from './agent-process.types';
import type { PhaseKind, ToolProfileAdapterResultV1 } from './phase-contract.types';

/**
 * One completion verdict for an SDK subagent, a child session, or a lane.
 * `phaseKind` and `toolProfileAdapter` stay null when the run had no phase,
 * so that run keeps today's verdict and parent text.
 */
export interface ExecutorCompletionResultV1 {
  readonly phaseKind: PhaseKind | null;
  readonly executorId: string;
  readonly deliverableCheck: readonly LaneDeliverableCheck[];
  readonly verdict: LaneCompletionVerdict;
  readonly parentSignal: string;
  readonly toolProfileAdapter: ToolProfileAdapterResultV1 | null;
}
