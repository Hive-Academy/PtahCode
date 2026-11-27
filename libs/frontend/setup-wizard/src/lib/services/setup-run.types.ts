/**
 * Setup run records (TASK_2026_2330).
 *
 * A Setup run is one background workflow of the Setup surface (analysis,
 * skill review, agent generation, project guidance, AI team builder). Its
 * record is the run's identity in the webview, independent of any chat tab.
 *
 * Frontend-only: records are persisted in localStorage and never cross RPC,
 * so the types live here and not in `@ptah-extension/shared`.
 */

/** The workflows a Setup run can track. */
export type SetupRunWorkflow =
  | 'analysis'
  | 'skill-review'
  | 'agent-generation'
  | 'project-guidance'
  | 'team-builder';

/** The lifecycle of a Setup run. */
export type SetupRunStatus =
  | 'running'
  | 'needs-input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

/** Statuses after which a run no longer changes on its own. */
export const TERMINAL_SETUP_RUN_STATUSES: readonly SetupRunStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'interrupted',
];

/** Whether `status` is terminal (the run no longer changes on its own). */
export function isTerminalSetupRunStatus(status: SetupRunStatus): boolean {
  return TERMINAL_SETUP_RUN_STATUSES.includes(status);
}

/** The ordered step ids of each workflow. */
export const SETUP_RUN_STEPS = {
  analysis: ['analyzing'],
  'skill-review': ['reviewing', 'selecting'],
  'agent-generation': ['preview', 'generating'],
  'project-guidance': ['generating'],
  'team-builder': [
    'intent',
    'review',
    'consent',
    'installing',
    'launching',
    'handed-off',
  ],
} as const satisfies Record<SetupRunWorkflow, readonly string[]>;

/** The step ids of one workflow. */
export type SetupRunStepOf<W extends SetupRunWorkflow> =
  (typeof SETUP_RUN_STEPS)[W][number];

/** Any workflow's step id. */
export type SetupRunStep = SetupRunStepOf<SetupRunWorkflow>;

/** One Setup run. */
export interface SetupRunRecord {
  /** `'setup-' + crypto.randomUUID()`; a valid onboarding identity value. */
  id: string;
  /** Normalized workspace path (trailing separators trimmed). */
  workspacePath: string;
  workflow: SetupRunWorkflow;
  status: SetupRunStatus;
  /** The workflow's current step (see {@link SETUP_RUN_STEPS}). */
  step: SetupRunStep;
  /** The backend run: analysis runId, generation runId or guidance runId. */
  backendRunId: string | null;
  /** The analysis this run uses (skill review, generation). */
  analysisRunId: string | null;
  /** The run this one was chained from: analysis -> skill-review -> generation -> guidance. */
  parentId: string | null;
  /** The caller that started the run (for example a chat-side launcher). */
  origin?: string;
  /** Skill review only: the saved selection. */
  selection?: { skillIds: string[] };
  /** Team builder only. */
  teamBuilder?: { intent: string; installed: string[] };
  /** Team builder only: the chat tab the conversation was handed off to. */
  handoffTabId?: string;
  /** User-facing text only; never a stack or a path. */
  error?: string;
  /** Terminal and not yet opened by the user; drives the badge. */
  unseen: boolean;
  createdAt: number;
  updatedAt: number;
}
