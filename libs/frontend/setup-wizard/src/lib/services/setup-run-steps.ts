/**
 * The deterministic step model of Setup runs (TASK_2026_2330, plan section 3).
 *
 * One pure table from `(workflow, status, step)` to the `/onboarding` route
 * Setup opens for a run. Every entry point (Home list, nav badge,
 * notification, launcher, restored URL) resolves a run through
 * {@link stepTarget}, so a run always re-opens at the same place.
 *
 * The query always carries `tab=<record.id>`. When the run's analysis is
 * known it also carries `analysis=<analysisRunId>`, which the skills page
 * reads.
 *
 * Pure: no Angular, no Router, no I/O.
 */

import {
  ONBOARDING_QUERY,
  isOnboardingIdentityValue,
  type OnboardingTarget,
} from '@ptah-extension/core';
import {
  SETUP_RUN_STEPS,
  type SetupRunRecord,
  type SetupRunStatus,
  type SetupRunStepOf,
  type SetupRunWorkflow,
} from './setup-run.types';

type SubPath = readonly string[];

const ANALYZE: SubPath = ['analyze'];
const ANALYZE_SKILLS: SubPath = ['analyze', 'skills'];
const ANALYZE_GENERATE: SubPath = ['analyze', 'generate'];
const ANALYZE_GUIDANCE: SubPath = ['analyze', 'guidance'];
const ANALYZE_DONE: SubPath = ['analyze', 'done'];
const GUIDANCE: SubPath = ['guidance'];
const TEAM_BUILDER: SubPath = ['team-builder'];

/**
 * The route each status re-opens, per workflow.
 *
 * Agent generation (D7): `analyze/generate` hosts the live run, its errors,
 * retry and resume, and the preview-required state (`needs-input`). A
 * cancelled run goes back to `analyze/skills`, where generation starts again
 * (the redirect target of the retired `analyze/agents`).
 *
 * Skill review: every status stays on `analyze/skills`. A completed review
 * (selection confirmed) is where agent generation is launched from; the plan's
 * `analyze/agents` final step redirects there, so the table names the landing
 * route instead of a redirect.
 */
const RE_ENTRY: Record<
  Exclude<SetupRunWorkflow, 'project-guidance'>,
  Record<SetupRunStatus, SubPath>
> = {
  analysis: {
    running: ANALYZE,
    'needs-input': ANALYZE,
    completed: ANALYZE_SKILLS,
    failed: ANALYZE,
    cancelled: ANALYZE,
    interrupted: ANALYZE,
  },
  'skill-review': {
    running: ANALYZE_SKILLS,
    'needs-input': ANALYZE_SKILLS,
    completed: ANALYZE_SKILLS,
    failed: ANALYZE_SKILLS,
    cancelled: ANALYZE_SKILLS,
    interrupted: ANALYZE_SKILLS,
  },
  'agent-generation': {
    running: ANALYZE_GENERATE,
    'needs-input': ANALYZE_GENERATE,
    completed: ANALYZE_DONE,
    failed: ANALYZE_GENERATE,
    cancelled: ANALYZE_SKILLS,
    interrupted: ANALYZE_GENERATE,
  },
  'team-builder': {
    running: TEAM_BUILDER,
    'needs-input': TEAM_BUILDER,
    completed: TEAM_BUILDER,
    failed: TEAM_BUILDER,
    cancelled: TEAM_BUILDER,
    interrupted: TEAM_BUILDER,
  },
};

/**
 * Project guidance is chained (started from agent generation, `parentId`
 * set) or standalone. Its entry is `analyze/guidance` or `guidance`; a
 * completed chained run shows `analyze/done`, a completed standalone run its
 * own entry with the result.
 */
function guidanceSubPath(record: SetupRunRecord): SubPath {
  const chained = record.parentId !== null;
  if (record.status === 'completed') return chained ? ANALYZE_DONE : GUIDANCE;
  return chained ? ANALYZE_GUIDANCE : GUIDANCE;
}

/** The route a workflow starts at; `chained` guidance starts inside analysis. */
export function entrySubPathFor(
  workflow: SetupRunWorkflow,
  chained = false,
): SubPath {
  switch (workflow) {
    case 'analysis':
      return ANALYZE;
    case 'skill-review':
    case 'agent-generation':
      return ANALYZE_SKILLS;
    case 'project-guidance':
      return chained ? ANALYZE_GUIDANCE : GUIDANCE;
    case 'team-builder':
      return TEAM_BUILDER;
  }
}

/** The route a workflow starts at; also the fallback for an unknown step. */
function entrySubPath(record: SetupRunRecord): SubPath {
  return entrySubPathFor(record.workflow, record.parentId !== null);
}

function isStepOf(workflow: SetupRunWorkflow, step: unknown): boolean {
  return (SETUP_RUN_STEPS[workflow] as readonly unknown[]).includes(step);
}

/** The analysis run a record's query carries, or `null` when unknown. */
function analysisIdOf(record: SetupRunRecord): string | null {
  const id =
    record.analysisRunId ??
    (record.workflow === 'analysis' ? record.backendRunId : null);
  return isOnboardingIdentityValue(id) ? id : null;
}

function queryOf(record: SetupRunRecord): Record<string, string> {
  const queryParams: Record<string, string> = {
    [ONBOARDING_QUERY.tab]: record.id,
  };
  const analysisId = analysisIdOf(record);
  if (analysisId !== null) queryParams[ONBOARDING_QUERY.analysis] = analysisId;
  return queryParams;
}

/**
 * Where Setup opens `record`: the route for its workflow and status, with
 * `tab=<record.id>` and, when known, `analysis=<analysisRunId>`.
 *
 * A step that does not belong to the record's workflow falls back to the
 * workflow's entry route and logs a warning.
 */
export function stepTarget(record: SetupRunRecord): OnboardingTarget {
  let subPath: SubPath;
  if (!isStepOf(record.workflow, record.step)) {
    console.warn(
      `[setup-run-steps] Unknown step "${String(record.step)}" for workflow ` +
        `"${record.workflow}"; opening the workflow entry.`,
    );
    subPath = entrySubPath(record);
  } else if (record.workflow === 'project-guidance') {
    subPath = guidanceSubPath(record);
  } else {
    subPath = RE_ENTRY[record.workflow][record.status];
  }
  return { subPath, queryParams: queryOf(record) };
}

/**
 * The step that follows `step` in `workflow`, or `null` when `step` is the
 * workflow's last step or not one of its steps.
 */
export function nextStep<W extends SetupRunWorkflow>(
  workflow: W,
  step: SetupRunStepOf<W>,
): SetupRunStepOf<W> | null {
  const steps = SETUP_RUN_STEPS[workflow] as readonly SetupRunStepOf<W>[];
  const index = steps.indexOf(step);
  if (index < 0 || index === steps.length - 1) return null;
  return steps[index + 1];
}
