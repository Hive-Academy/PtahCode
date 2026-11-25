/**
 * Analyze workspace capture fixtures
 * (TASK_2026_ONBOARDING B3a). Wizard RPCs are mocked so captures do not depend
 * on a live analysis run. This file imports nothing from
 * `@ptah-extension/onboarding`; state text is asserted by the spec as literals.
 *
 * `wizard:deep-analyze` set to {@link NEVER_ANSWERED} keeps
 * `WizardAnalysisRunner.isRunning` true after Start analysis. Scan progress
 * and analysis-stream events are injected over the postMessage bridge.
 */
import { expect, type Page } from '@playwright/test';
import type {
  ModelPair,
  SkillJudgeResult,
  SkillShEntry,
  StackSummaryItem,
  WizardGetSetupModelResult,
  WizardRecommendAnalysisSkillsResult,
  WizardSetSetupModelResult,
} from '@ptah-extension/shared';
import {
  installPostMessageBridge,
  type PostMessageBridge,
} from '../../postmessage-bridge';
import { installCspStub } from '../../csp-stub';
import { rpcError } from '../marketplace/marketplace.fixtures';
import {
  installHost,
  installRpcAutoResponder,
} from '../settings/settings.fixtures';
import {
  CHECKED_AT,
  FLAG_DONE,
  NEVER_ANSWERED,
  onboardingReadyFixtures,
  type GlassAccent,
  type GlassScene,
  type OnboardingTheme,
} from './onboarding-ready.fixtures';

export { NEVER_ANSWERED, rpcError };

export const ANALYZE_SAVED_FILENAME = 'nest-api-2026-10-29';

export const ANALYZE_SAVED_METADATA = {
  filename: ANALYZE_SAVED_FILENAME,
  savedAt: CHECKED_AT,
  projectType: 'NestJS API',
  phaseCount: 4,
  model: 'claude-sonnet',
  durationMs: 42_000,
} as const;

const PHASES_COMPLETED = {
  'project-profile': {
    status: 'completed',
    file: '1-project-profile.md',
    durationMs: 10_000,
  },
  'architecture-assessment': {
    status: 'completed',
    file: '2-architecture-assessment.md',
    durationMs: 10_000,
  },
  'quality-audit': {
    status: 'completed',
    file: '3-quality-audit.md',
    durationMs: 10_000,
  },
  'elevation-plan': {
    status: 'completed',
    file: '4-elevation-plan.md',
    durationMs: 12_000,
  },
} as const;

const PHASE_CONTENTS = {
  'project-profile': 'NestJS API. TypeScript workspace.',
  'architecture-assessment': 'Modular Nest architecture.',
  'quality-audit': 'Unit tests present.',
  'elevation-plan': 'Raise coverage on the API layer.',
} as const;

function analysisResponse(
  lifecycle: 'running' | 'paused' | 'completed' | 'failed',
): Record<string, unknown> {
  return {
    isMultiPhase: true,
    analysisDir: `C:\\ptah-e2e-ws-a\\.ptah\\analysis\\${ANALYZE_SAVED_FILENAME}`,
    phaseContents: { ...PHASE_CONTENTS },
    manifest: {
      version: 3,
      runId: 'run-e2e-analyze-1',
      slug: ANALYZE_SAVED_FILENAME,
      analyzedAt: CHECKED_AT,
      updatedAt: CHECKED_AT,
      lifecycle,
      model: 'claude-sonnet',
      totalDurationMs: 42_000,
      phases: { ...PHASES_COMPLETED },
    },
  };
}

export const COMPLETED_ANALYSIS = analysisResponse('completed');
export const INTERRUPTED_ANALYSIS = analysisResponse('paused');

export const PHASE_TWO_SCAN_PROGRESS = {
  filesScanned: 80,
  totalFiles: 160,
  detections: ['NestJS', 'TypeScript'],
  currentPhase: 'architecture-assessment',
  phaseLabel: 'Architecture assessment',
  currentPhaseNumber: 2,
  totalPhaseCount: 4,
  phaseStatuses: [
    { id: 'project-profile', status: 'completed' },
    { id: 'architecture-assessment', status: 'running' },
    { id: 'quality-audit', status: 'pending' },
    { id: 'elevation-plan', status: 'pending' },
  ],
} as const;

export const RUNNING_STREAM_EVENTS = [
  { kind: 'text', content: 'Reading nest-cli.json', timestamp: 1 },
  { kind: 'thinking', content: 'Mapping modules', timestamp: 2 },
  { kind: 'tool_start', content: 'Read', toolName: 'Read', timestamp: 3 },
  { kind: 'error', content: 'Optional file missing', timestamp: 4 },
] as const;

export interface BootOnboardingAnalyzeOptions {
  readonly theme: OnboardingTheme;
  readonly rpc?: Record<string, unknown>;
  readonly scene?: GlassScene;
  readonly accent?: GlassAccent;
}

/**
 * The Setup pair the analyze scenario runs with (design-spec section 12:
 * "Anthropic / claude-sonnet-4-5"). `wizard:get-setup-model` answers `set`
 * with it and the recommendation reports it as the immutable `analysisPair`.
 */
const SETUP_PAIR: ModelPair = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
};

const NESTJS_ITEM: StackSummaryItem = {
  kind: 'framework',
  name: 'NestJS',
  evidence: 'nest-cli.json in the repository root',
  sourcePhase: 'project-profile',
};

const DOMAIN_MODULES_ITEM: StackSummaryItem = {
  kind: 'pattern',
  name: 'Domain modules',
  evidence: 'Modules follow a domain folder layout',
  sourcePhase: 'architecture-assessment',
};

const GUARDRAILS_ITEM: StackSummaryItem = {
  kind: 'test-tool',
  name: 'Guardrails',
  evidence: 'e2e guard helpers referenced in tests',
  sourcePhase: 'quality-audit',
};

/** skills.sh entry shared by the installed candidate and the ranked `skills` row. */
const NEST_BLUEPRINT_SKILL: SkillShEntry = {
  source: 'vercel-labs/skills',
  skillId: 'nest-blueprint',
  name: 'Nest Blueprint',
  description: 'Scaffolds NestJS modules, services and tests.',
  installs: 1204,
  isInstalled: false,
};

/**
 * Typed judge payload (TASK_2026_2325_899d): item `item-nestjs` carries both
 * an install and a build verdict, candidate `cand-nest-blueprint` is shared
 * by two items with opposite per-item verdicts (installed for `item-nestjs`,
 * rejected with a reason for `item-domain-modules`), and the two candidates
 * share the name `Nest Blueprint` with a different `source`.
 */
const SKILL_JUDGE_RESULT: SkillJudgeResult = {
  method: 'mixed',
  counts: { decision: 1, normal: 1, notJudged: 1 },
  items: [
    {
      itemId: 'item-nestjs',
      item: NESTJS_ITEM,
      registry: 'matched',
      candidateIds: ['cand-nest-blueprint', 'cand-nest-blueprint-alt'],
      candidateAssessments: [
        { candidateId: 'cand-nest-blueprint', eligible: true },
        {
          candidateId: 'cand-nest-blueprint-alt',
          eligible: false,
          rejection: {
            reason:
              'Same name as the vercel-labs source, which covers this stack already.',
            stage: 'decision',
          },
        },
      ],
      outcomes: [
        {
          verdict: 'install',
          candidateId: 'cand-nest-blueprint',
          reason: 'Covers the Nest module scaffolding this project lacks.',
          stage: 'decision',
        },
        {
          verdict: 'build',
          proposalId: 'prop-e2e-guard',
          reason: 'No registry skill covers the e2e guard helper convention.',
          stage: 'normal',
        },
      ],
      judgedBy: 'normal',
    },
    {
      itemId: 'item-domain-modules',
      item: DOMAIN_MODULES_ITEM,
      registry: 'matched',
      candidateIds: ['cand-nest-blueprint', 'cand-nest-blueprint-alt'],
      candidateAssessments: [
        {
          candidateId: 'cand-nest-blueprint',
          eligible: false,
          rejection: {
            reason:
              'Scaffolds new modules but does not fit the existing domain folder layout.',
            stage: 'decision',
          },
        },
        {
          candidateId: 'cand-nest-blueprint-alt',
          eligible: false,
          rejection: {
            reason:
              'Duplicate of the vercel-labs source with no extra coverage.',
            stage: 'decision',
          },
        },
      ],
      outcomes: [
        {
          verdict: 'no-skill',
          reason: 'The domain folder layout is project-specific.',
          stage: 'decision',
        },
      ],
      judgedBy: 'decision',
    },
    {
      itemId: 'item-guardrails',
      item: GUARDRAILS_ITEM,
      registry: 'search-failed',
      registryFailure: { kind: 'timed-out', reason: 'skills.sh search timed out' },
      candidateIds: [],
      candidateAssessments: [],
      outcomes: [],
      judgedBy: 'none',
    },
  ],
  candidates: [
    {
      candidateId: 'cand-nest-blueprint',
      selectionKey: 'vercel-labs/skills:nest-blueprint',
      skill: NEST_BLUEPRINT_SKILL,
      deprecated: false,
    },
    {
      candidateId: 'cand-nest-blueprint-alt',
      selectionKey: 'anthropic/claude-skills:nest-blueprint',
      skill: {
        source: 'anthropic/claude-skills',
        skillId: 'nest-blueprint',
        name: 'Nest Blueprint',
        description: 'NestJS scaffolding for the Claude skill set.',
        installs: 388,
        isInstalled: false,
      },
      deprecated: false,
    },
  ],
  proposals: [
    {
      proposalId: 'prop-e2e-guard',
      name: 'E2e guard helper',
      description: 'Creates guard fixtures for the Nest e2e suites.',
      itemIds: ['item-nestjs'],
    },
  ],
  stages: [
    {
      stage: 'decision',
      status: 'used',
      pairConfigured: SETUP_PAIR,
      pairAttempted: SETUP_PAIR,
      pairUsed: SETUP_PAIR,
      itemsJudged: 2,
      invalidItemIds: [],
    },
    {
      stage: 'normal',
      status: 'used',
      pairConfigured: SETUP_PAIR,
      pairAttempted: SETUP_PAIR,
      pairUsed: SETUP_PAIR,
      itemsJudged: 1,
      invalidItemIds: [],
    },
  ],
};

/** Ready-home fixtures plus wizard RPC answers. Never-answered keys are stripped. */
export function onboardingAnalyzeFixtures(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const fixtures: Record<string, unknown> = {
    ...onboardingReadyFixtures('ready'),
    'config:models-list': {
      models: [
        {
          id: 'claude-sonnet-4-5',
          name: 'Claude Sonnet 4.5',
          description: 'Balanced model',
          isSelected: true,
          providerModelId: null,
        },
        {
          id: 'claude-opus-4-1',
          name: 'Claude Opus 4.1',
          description: 'Deep reasoning model',
          isSelected: false,
          providerModelId: null,
        },
      ],
    },
    'wizard:list-analyses': { analyses: [] },
    'wizard:get-resumable-run': { analysis: null, generation: null },
    'wizard:get-generation-run-state': { run: null },
    'wizard:get-setup-model': {
      state: { kind: 'set', pair: SETUP_PAIR },
    } satisfies WizardGetSetupModelResult,
    'wizard:set-setup-model': {
      committed: SETUP_PAIR,
      state: { kind: 'set', pair: SETUP_PAIR },
      commitSeq: 1,
    } satisfies WizardSetSetupModelResult,
    'wizard:recommend-analysis-skills': {
      skills: [
        {
          skill: NEST_BLUEPRINT_SKILL,
          evidence: NESTJS_ITEM.evidence,
          score: 0.92,
          rankedBy: 'decision-model',
          reason: 'Covers the Nest module scaffolding this project lacks.',
          rank: 1,
        },
      ],
      judge: SKILL_JUDGE_RESULT,
      analysisPair: SETUP_PAIR,
      detectedItems: [NESTJS_ITEM, DOMAIN_MODULES_ITEM, GUARDRAILS_ITEM],
      unmatchedItems: [],
      searchFailures: [
        { item: GUARDRAILS_ITEM.name, reason: 'skills.sh search timed out' },
      ],
      summarySource: 'structured',
    } satisfies WizardRecommendAnalysisSkillsResult,
    ...overrides,
  };
  for (const [method, value] of Object.entries(fixtures)) {
    if (value === NEVER_ANSWERED) delete fixtures[method];
  }
  return fixtures;
}

/**
 * Boots Electron onboarding Home (flag done, Claude ready, workspace open)
 * with analyze RPC overrides. Returns the bridge for scan-progress injects.
 */
export async function bootOnboardingAnalyze(
  page: Page,
  fixtureUrl: string,
  options: BootOnboardingAnalyzeOptions,
): Promise<PostMessageBridge> {
  await installCspStub(page);
  const bridge = await installPostMessageBridge(page);
  await installHost(page, 'electron', 'chat');
  await installRpcAutoResponder(
    page,
    onboardingAnalyzeFixtures(options.rpc ?? {}),
  );
  await page.addInitScript(
    (seed: {
      theme: string;
      flag: string;
      scene: string | null;
      accent: string | null;
    }) => {
      localStorage.setItem('ptah-theme-v2', seed.theme);
      localStorage.setItem('ptah.onboarding.v1', seed.flag);
      if (seed.scene !== null) localStorage.setItem('ptah-scene', seed.scene);
      if (seed.accent !== null)
        localStorage.setItem('ptah-accent', seed.accent);
    },
    {
      theme: options.theme,
      flag: JSON.stringify(FLAG_DONE),
      scene: options.scene ?? null,
      accent: options.accent ?? null,
    },
  );
  await page.goto(fixtureUrl, { timeout: 30_000 });
  await expect(page.locator('ptah-electron-shell').first()).toBeVisible();
  await bridge.inject({ type: 'switchView', payload: { view: 'onboarding' } });
  await expect(page.locator('[data-testid="onboarding-home"]')).toBeVisible();
  return bridge;
}

export async function injectScanProgress(
  bridge: PostMessageBridge,
): Promise<void> {
  await bridge.inject({
    type: 'setup-wizard:scan-progress',
    payload: { ...PHASE_TWO_SCAN_PROGRESS },
  });
}

export async function injectRunningStream(
  bridge: PostMessageBridge,
): Promise<void> {
  for (const payload of RUNNING_STREAM_EVENTS) {
    await bridge.inject({
      type: 'setup-wizard:analysis-stream',
      payload: { ...payload },
    });
  }
}
