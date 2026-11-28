import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type {
  SetupGenerationResultFacts,
  SetupGenerationRunBinding,
  SetupGenerationRunLifecycle,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  SetupGenerationWorkflow,
} from '@ptah-extension/shared';
import { normalizeSetupWorkspacePath } from '../setup-run-persistence';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
  type SetupRunWorkflow,
} from '../setup-run.types';

const BOUND_WORKFLOW = {
  'agent-generation': 'setup-agent-generation',
  'project-guidance': 'setup-project-prompt',
} satisfies Partial<Record<SetupRunWorkflow, SetupGenerationWorkflow>>;

export function isBound(
  workflow: SetupRunWorkflow,
): workflow is keyof typeof BOUND_WORKFLOW {
  return Object.hasOwn(BOUND_WORKFLOW, workflow);
}

export function bindingOf(
  record: SetupRunRecord,
): SetupGenerationTabBinding | null {
  return isBound(record.workflow)
    ? {
        tabId: record.id,
        workflow: BOUND_WORKFLOW[record.workflow],
        workspacePath: record.workspacePath,
      }
    : null;
}

export function workflowOfBinding(
  workflow: SetupGenerationWorkflow,
): keyof typeof BOUND_WORKFLOW {
  return workflow === 'setup-agent-generation'
    ? 'agent-generation'
    : 'project-guidance';
}

export const RUN_FAILURE_COPY = {
  'setup-agent-generation': 'Agent generation did not finish.',
  'setup-project-prompt': 'Project guidance did not finish.',
} satisfies Record<SetupGenerationWorkflow, string>;

const LIFECYCLE_STATUS = {
  starting: 'running',
  running: 'running',
  cancelling: 'running',
  completed: 'completed',
  failed: 'failed',
  'timed-out': 'failed',
  cancelled: 'cancelled',
} satisfies Record<SetupGenerationRunLifecycle, SetupRunStatus>;

export function isRunLifecycle(
  value: unknown,
): value is SetupGenerationRunLifecycle {
  return typeof value === 'string' && Object.hasOwn(LIFECYCLE_STATUS, value);
}

export function isTerminalLifecycle(
  value: SetupGenerationRunLifecycle,
): boolean {
  return isTerminalSetupRunStatus(LIFECYCLE_STATUS[value]);
}

export function matchesBinding(
  expected: SetupGenerationTabBinding | null,
  actual: SetupGenerationTabBinding,
): boolean {
  if (expected === null) return false;
  const expectedPath = normalizeSetupWorkspacePath(expected.workspacePath);
  return (
    expectedPath !== null &&
    expected.tabId === actual.tabId &&
    expected.workflow === actual.workflow &&
    expectedPath === normalizeSetupWorkspacePath(actual.workspacePath)
  );
}

export function isRunBinding(
  value: unknown,
): value is SetupGenerationRunBinding {
  if (!value || typeof value !== 'object') return false;
  const { tabId, runId, workflow, workspacePath } = value as Record<
    string,
    unknown
  >;
  return (
    isOnboardingIdentityValue(tabId) &&
    isOnboardingIdentityValue(runId) &&
    (workflow === 'setup-agent-generation' ||
      workflow === 'setup-project-prompt') &&
    typeof workspacePath === 'string' &&
    !!normalizeSetupWorkspacePath(workspacePath)
  );
}

export const FOREIGN_WORKSPACE_COPY = 'This run belongs to another workspace.';
export const START_REFUSED_COPY = 'The run could not be started.';

export function startRefusalCopy(reason?: string): string {
  if (reason === 'invalid-binding' || reason === 'workspace-mismatch')
    return FOREIGN_WORKSPACE_COPY;
  if (reason === 'SETUP_MODEL_INVALID')
    return 'The Setup model could not be resolved. Update Background models and retry.';
  return START_REFUSED_COPY;
}

export function hasCommittedGuidance(run: SetupGenerationRunState): boolean {
  const committed = run.committedState ?? run.result?.committedState;
  return committed === 'committed' || committed === 'unchanged';
}

type FinalizationState = Pick<SetupGenerationRunState, 'status'> & {
  result?: Pick<SetupGenerationResultFacts, 'finalizationFailed'>;
};

export function isFinalizationCorrection(
  previous: FinalizationState,
  run: SetupGenerationRunState,
): boolean {
  return (
    previous.status === 'failed' &&
    previous.result?.finalizationFailed === true &&
    run.status === 'completed' &&
    run.interrupted !== true &&
    !!run.result?.counts &&
    Array.isArray(run.result.agentOutcomes)
  );
}

export function verifiedRunStatus(
  run: SetupGenerationRunState | null,
  binding: SetupGenerationTabBinding | null,
): SetupRunStatus | null {
  if (
    !isRunBinding(run?.binding) ||
    !matchesBinding(binding, run.binding) ||
    !isRunLifecycle(run.status) ||
    (run.source?.kind !== 'workspace-discovery' &&
      !(
        run.source?.kind === 'verified-analysis' &&
        isOnboardingIdentityValue(run.source.analysisRunId)
      ))
  ) {
    return null;
  }
  if (run.interrupted === true) return 'interrupted';
  if (
    run.binding.workflow === 'setup-project-prompt' &&
    run.status === 'completed' &&
    !hasCommittedGuidance(run)
  )
    return 'failed';
  return LIFECYCLE_STATUS[run.status];
}

/** An unseen backend binding starts with its tab id as the record id. */
export function createBoundRunRecord(
  binding: SetupGenerationTabBinding,
): SetupRunRecord | null {
  const workspace = normalizeSetupWorkspacePath(binding.workspacePath);
  if (!workspace || !isOnboardingIdentityValue(binding.tabId)) return null;
  const now = Date.now();
  return {
    id: binding.tabId,
    workspacePath: workspace,
    workflow: workflowOfBinding(binding.workflow),
    status: 'running',
    step: 'generating',
    backendRunId: null,
    analysisRunId: null,
    parentId: null,
    unseen: false,
    createdAt: now,
    updatedAt: now,
  };
}
