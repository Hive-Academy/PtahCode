import type {
  ExecutorCompletionResultV1,
  LaneCompletionVerdict,
  LaneDeliverableCheck,
  PhaseKind,
  ToolProfileAdapterResultV1,
} from '@ptah-extension/shared';

export interface SdkSubagentCompletionInput {
  readonly agentId: string;
  readonly agentType: string | null;
  readonly parentSessionId: string | null;
  readonly phaseKind?: PhaseKind | null;
  readonly deliverableCheck?: readonly LaneDeliverableCheck[];
  /**
   * Phase tool names copied from the run. The SDK query applies them as
   * built-in denials, so a non-blank list records `filtered`.
   */
  readonly disallowedTools?: readonly string[];
  readonly failed?: boolean;
}

/**
 * Completion verdict for one SDK subagent stop. With no phase and no
 * declared deliverables the verdict is `unverified` and the adapter is null.
 */
export function buildSdkSubagentCompletion(
  input: SdkSubagentCompletionInput,
): ExecutorCompletionResultV1 {
  const deliverableCheck = input.deliverableCheck ?? [];
  const verdict = verdictOf(input.failed === true, deliverableCheck);
  const phaseKind = input.phaseKind ?? null;
  const parent = input.parentSessionId ?? 'none';
  const role = input.agentType ?? 'none';
  const parentSignal = [
    `SDK subagent ${input.agentId} finished: ${verdict}.`,
    `Executor: sdk-subagent.`,
    `Phase: ${phaseKind ?? 'none'}.`,
    `Role: ${role}.`,
    `Parent session: ${parent}.`,
    deliverableLine(deliverableCheck),
  ].join('\n');
  return {
    phaseKind,
    executorId: 'sdk-subagent',
    deliverableCheck,
    verdict,
    parentSignal,
    toolProfileAdapter: sdkAdapter(input.disallowedTools),
  };
}

function verdictOf(
  failed: boolean,
  deliverableCheck: readonly LaneDeliverableCheck[],
): LaneCompletionVerdict {
  if (failed) return 'failed';
  if (deliverableCheck.length === 0) return 'unverified';
  const allWritten = deliverableCheck.every(
    (check) =>
      check.exists &&
      (check.bytes ?? 0) > 0 &&
      check.writtenAfterSpawn !== false,
  );
  return allWritten ? 'delivered' : 'no-deliverable';
}

function deliverableLine(checks: readonly LaneDeliverableCheck[]): string {
  if (checks.length === 0) {
    return 'Deliverables: none were declared, so nothing was checked.';
  }
  return `Deliverables: ${checks.length} checked.`;
}

function sdkAdapter(
  disallowedTools: readonly string[] | undefined,
): ToolProfileAdapterResultV1 | null {
  if (!disallowedTools?.some((name) => name.trim().length > 0)) return null;
  return { executorId: 'sdk-subagent', toolProfileStatus: 'filtered' };
}
