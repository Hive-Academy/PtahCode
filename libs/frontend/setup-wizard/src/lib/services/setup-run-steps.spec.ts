import { isOnboardingIdentityValue } from '@ptah-extension/core';
import { nextStep, stepTarget } from './setup-run-steps';
import type {
  SetupRunRecord,
  SetupRunStatus,
  SetupRunStep,
  SetupRunWorkflow,
} from './setup-run.types';

const RUN_ID = 'setup-3f1c2a9e-7b4d-4e8a-9c1f-0a2b3c4d5e6f';
const ANALYSIS_ID = 'analysis-run-42';

function record(overrides: Partial<SetupRunRecord> = {}): SetupRunRecord {
  return {
    id: RUN_ID,
    workspacePath: '/work/project',
    workflow: 'analysis',
    status: 'running',
    step: 'analyzing',
    backendRunId: null,
    analysisRunId: null,
    parentId: null,
    unseen: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/** A representative step per (workflow, status) cell of plan section 3. */
const STEP: Record<SetupRunWorkflow, Record<SetupRunStatus, SetupRunStep>> = {
  analysis: {
    running: 'analyzing',
    'needs-input': 'analyzing',
    completed: 'analyzing',
    failed: 'analyzing',
    cancelled: 'analyzing',
    interrupted: 'analyzing',
  },
  'skill-review': {
    running: 'reviewing',
    'needs-input': 'selecting',
    completed: 'selecting',
    failed: 'reviewing',
    cancelled: 'reviewing',
    interrupted: 'selecting',
  },
  'agent-generation': {
    running: 'generating',
    'needs-input': 'preview',
    completed: 'generating',
    failed: 'generating',
    cancelled: 'generating',
    interrupted: 'generating',
  },
  'project-guidance': {
    running: 'generating',
    'needs-input': 'generating',
    completed: 'generating',
    failed: 'generating',
    cancelled: 'generating',
    interrupted: 'generating',
  },
  'team-builder': {
    running: 'installing',
    'needs-input': 'consent',
    completed: 'handed-off',
    failed: 'review',
    cancelled: 'intent',
    interrupted: 'review',
  },
};

type Cell = [SetupRunWorkflow, SetupRunStatus, string];

/**
 * The expected route of every (workflow, status) cell.
 *
 * Agent generation follows D7: `analyze/generate` for running, failed,
 * interrupted and needs-input (preview-required); `analyze/done` for
 * completed; `analyze/skills` (the redirect target of `analyze/agents`) for
 * cancelled. A completed skill review lands on `analyze/skills`, where the
 * plan's `analyze/agents` redirects.
 */
const CELLS: Cell[] = [
  ['analysis', 'running', 'analyze'],
  ['analysis', 'needs-input', 'analyze'],
  ['analysis', 'completed', 'analyze/skills'],
  ['analysis', 'failed', 'analyze'],
  ['analysis', 'cancelled', 'analyze'],
  ['analysis', 'interrupted', 'analyze'],

  ['skill-review', 'running', 'analyze/skills'],
  ['skill-review', 'needs-input', 'analyze/skills'],
  ['skill-review', 'completed', 'analyze/skills'],
  ['skill-review', 'failed', 'analyze/skills'],
  ['skill-review', 'cancelled', 'analyze/skills'],
  ['skill-review', 'interrupted', 'analyze/skills'],

  ['agent-generation', 'running', 'analyze/generate'],
  ['agent-generation', 'needs-input', 'analyze/generate'],
  ['agent-generation', 'completed', 'analyze/done'],
  ['agent-generation', 'failed', 'analyze/generate'],
  ['agent-generation', 'cancelled', 'analyze/skills'],
  ['agent-generation', 'interrupted', 'analyze/generate'],

  ['team-builder', 'running', 'team-builder'],
  ['team-builder', 'needs-input', 'team-builder'],
  ['team-builder', 'completed', 'team-builder'],
  ['team-builder', 'failed', 'team-builder'],
  ['team-builder', 'cancelled', 'team-builder'],
  ['team-builder', 'interrupted', 'team-builder'],
];

/** Project guidance: [status, chained route, standalone route]. */
const GUIDANCE_CELLS: [SetupRunStatus, string, string][] = [
  ['running', 'analyze/guidance', 'guidance'],
  ['needs-input', 'analyze/guidance', 'guidance'],
  ['completed', 'analyze/done', 'guidance'],
  ['failed', 'analyze/guidance', 'guidance'],
  ['cancelled', 'analyze/guidance', 'guidance'],
  ['interrupted', 'analyze/guidance', 'guidance'],
];

describe('setup-run-steps', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  describe('stepTarget', () => {
    it.each(CELLS)('%s / %s opens %s', (workflow, status, route) => {
      const target = stepTarget(
        record({ workflow, status, step: STEP[workflow][status] }),
      );

      expect(target.subPath.join('/')).toBe(route);
      expect(target.queryParams).toEqual({ tab: RUN_ID });
      expect(warn).not.toHaveBeenCalled();
    });

    it.each(GUIDANCE_CELLS)(
      'project-guidance / %s opens %s chained and %s standalone',
      (status, chainedRoute, standaloneRoute) => {
        const step = STEP['project-guidance'][status];
        const chained = stepTarget(
          record({
            workflow: 'project-guidance',
            status,
            step,
            parentId: 'setup-parent',
          }),
        );
        const standalone = stepTarget(
          record({ workflow: 'project-guidance', status, step }),
        );

        expect(chained.subPath.join('/')).toBe(chainedRoute);
        expect(standalone.subPath.join('/')).toBe(standaloneRoute);
        expect(warn).not.toHaveBeenCalled();
      },
    );

    it('covers every (workflow, status) cell', () => {
      const covered = new Set(CELLS.map(([w, s]) => `${w}:${s}`));
      for (const [status] of GUIDANCE_CELLS) {
        covered.add(`project-guidance:${status}`);
      }
      const workflows = Object.keys(STEP) as SetupRunWorkflow[];
      const statuses = Object.keys(STEP.analysis) as SetupRunStatus[];

      expect(covered.size).toBe(workflows.length * statuses.length);
    });

    it('carries analysis=<analysisRunId> when the analysis is known', () => {
      const target = stepTarget(
        record({
          workflow: 'skill-review',
          status: 'needs-input',
          step: 'selecting',
          analysisRunId: ANALYSIS_ID,
        }),
      );

      expect(target.queryParams).toEqual({
        tab: RUN_ID,
        analysis: ANALYSIS_ID,
      });
    });

    it('uses the backend run of an analysis record as its analysis id', () => {
      const target = stepTarget(
        record({
          workflow: 'analysis',
          status: 'completed',
          backendRunId: ANALYSIS_ID,
        }),
      );

      expect(target.subPath).toEqual(['analyze', 'skills']);
      expect(target.queryParams).toEqual({
        tab: RUN_ID,
        analysis: ANALYSIS_ID,
      });
    });

    it('does not use the backend run of a non-analysis record as analysis', () => {
      const target = stepTarget(
        record({
          workflow: 'agent-generation',
          status: 'running',
          step: 'generating',
          backendRunId: 'generation-run-7',
        }),
      );

      expect(target.queryParams).toEqual({ tab: RUN_ID });
    });

    it('omits an analysis id that is not a valid identity value', () => {
      const target = stepTarget(
        record({
          workflow: 'skill-review',
          status: 'running',
          step: 'reviewing',
          analysisRunId: 'C:\\escape/../path',
        }),
      );

      expect(target.queryParams).toEqual({ tab: RUN_ID });
    });

    it.each<[SetupRunWorkflow, string, string | null, string]>([
      ['analysis', 'selecting', null, 'analyze'],
      ['skill-review', 'generating', null, 'analyze/skills'],
      ['agent-generation', 'reviewing', null, 'analyze/skills'],
      ['project-guidance', 'intent', null, 'guidance'],
      ['project-guidance', 'intent', 'setup-parent', 'analyze/guidance'],
      ['team-builder', 'analyzing', null, 'team-builder'],
    ])(
      'an unknown step of %s (%s) opens the entry route and warns',
      (workflow, step, parentId, route) => {
        const target = stepTarget(
          record({
            workflow,
            status: 'completed',
            step: step as SetupRunStep,
            parentId,
          }),
        );

        expect(target.subPath.join('/')).toBe(route);
        expect(target.queryParams).toEqual({ tab: RUN_ID });
        expect(warn).toHaveBeenCalledTimes(1);
      },
    );

    it('keeps a setup-<uuid> run id a valid onboarding identity', () => {
      const id = `setup-${crypto.randomUUID()}`;
      const target = stepTarget(record({ id }));

      expect(isOnboardingIdentityValue(id)).toBe(true);
      expect(isOnboardingIdentityValue(target.queryParams['tab'])).toBe(true);
    });
  });

  describe('nextStep', () => {
    it.each<[SetupRunWorkflow, SetupRunStep, SetupRunStep | null]>([
      ['analysis', 'analyzing', null],
      ['skill-review', 'reviewing', 'selecting'],
      ['skill-review', 'selecting', null],
      ['agent-generation', 'preview', 'generating'],
      ['agent-generation', 'generating', null],
      ['project-guidance', 'generating', null],
      ['team-builder', 'intent', 'review'],
      ['team-builder', 'review', 'consent'],
      ['team-builder', 'consent', 'installing'],
      ['team-builder', 'installing', 'launching'],
      ['team-builder', 'launching', 'handed-off'],
      ['team-builder', 'handed-off', null],
    ])('%s: %s -> %s', (workflow, step, expected) => {
      expect(nextStep(workflow, step)).toBe(expected);
    });

    it('returns null for a step outside the workflow', () => {
      expect(nextStep('analysis', 'selecting' as never)).toBeNull();
    });
  });
});
