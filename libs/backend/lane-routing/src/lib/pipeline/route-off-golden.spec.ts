/**
 * Off-mode golden (TASK_2026_2328_5bd6, batch B1).
 *
 * Pins today's exact gate result of `RouteDecideService` on unchanged code.
 * The service is built with today's dependencies only: no
 * `performanceRouting` dependency exists yet, and the listing fixtures carry
 * no `efforts`. Later batches must keep these results identical when
 * performance routing is off. The fixture was generated once from unchanged
 * code; this spec never writes it.
 *
 * The model cases pin the decision-model path (answer `o1`, neutral matrix).
 * The ranking cases make the decision model time out so the deterministic
 * ranking path decides: a promoted listed model on a ptah-cli lane (system
 * CLI lanes are never promoted today), the configured-model fallback, and
 * local learned deltas with an exploration bonus. The guards keep a future
 * regeneration from silently producing an all-neutral fixture.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  createMockFileSystemProvider,
  createMockSecretStorage,
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import type {
  CliDetectionResult,
  CliType,
  LaneLimitState,
  LaneOutcomeReader,
  LaneOutcomeSummary,
} from '@ptah-extension/shared';

import type {
  ChosenEntry,
  GateResult,
} from '../contracts/route-decide-result.schema';
import { DecisionModelConfig } from '../decision-model/decision-model.config';
import type { DecisionPayload } from '../decision-model/decision-payload';
import type {
  SystemOneCallResult,
  SystemOneFetch,
} from '../decision-model/system-one.client';
import type {
  LaneModelEntry,
  LaneModelListing,
} from '../lane-model-listing.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { CapabilityMatrixStore } from '../matrix/capability-matrix.store';
import { FAMILY_PROFILE_MODEL } from '../matrix/matrix.types';
import { EMPTY_OUTCOME_FIGURES } from '../matrix/outcome-figures';
import {
  emptyRotationState,
  type RotationState,
} from '../ranking/rotation.store';
import type { RouteCandidateSource } from '../route-candidate-source.port';
import { RouteDecideService } from '../route-decide.service';
import type { RouteMatrix } from './gather';

const SELECTION_KEY = 'ptah.agentOrchestration.decisionModel';
const OLLAMA = { kind: 'ollama', model: 'nimble' } as const;
const FIXED_NOW_MS = 1_790_000_000_000;
const FIXED_MONOTONIC_MS = 500;

/** Today's decision-model failure that makes ranking decide. */
const TIMEOUT_REPLY: SystemOneCallResult = {
  ok: false,
  cause: 'timeout',
  notFound: false,
  detail: 'slow',
};

interface FakeRoute {
  readonly status: number;
  readonly body: string;
}

function testLogger(): LaneRoutingLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function lane(cli: CliType): CliDetectionResult {
  return { cli, installed: true, messagingMode: 'none' };
}

function ptahCliLane(): CliDetectionResult {
  return {
    cli: 'ptah-cli',
    installed: true,
    messagingMode: 'none',
    ptahCliId: 'openrouter-main',
    ptahCliName: 'OpenRouter Main',
    providerName: 'OpenRouter',
    providerId: 'openrouter',
  };
}

const GOLDEN_ROWS = [lane('codex'), lane('grok'), ptahCliLane()] as const;

function neutralMatrix(): RouteMatrix {
  return {
    load: async () => ({
      outcomeFigures: EMPTY_OUTCOME_FIGURES,
      reasons: [],
      resolve: (family, model, taskKind) => ({
        family,
        model,
        profileModel: FAMILY_PROFILE_MODEL,
        taskKind,
        cell: { kind: 'unknown' },
        score: 50,
        noProfile: true,
      }),
    }),
  };
}

function memoryRotation(): {
  load(): { state: RotationState; reason: null };
  save(state: RotationState): Promise<{ persisted: boolean }>;
} {
  let state = emptyRotationState();
  return {
    load: () => ({ state, reason: null }),
    save: async (next) => {
      state = next;
      return { persisted: true };
    },
  };
}

function fakeFetch(routes: Record<string, FakeRoute>): SystemOneFetch {
  return async (url) => {
    const path = new URL(url).pathname;
    const route = routes[path] ?? { status: 404, body: '404 page not found' };
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => route.body,
    };
  };
}

const warmResidency = fakeFetch({
  '/api/ps': { status: 200, body: '{"models":[{"name":"nimble:latest"}]}' },
});

function configFor(
  selection: unknown,
  fetchImpl: SystemOneFetch,
): DecisionModelConfig {
  return new DecisionModelConfig(
    createMockWorkspaceProvider({
      config: { [SELECTION_KEY]: selection },
    }),
    createMockSecretStorage(),
    createMockStateStorage(),
    testLogger(),
    undefined,
    { fetch: fetchImpl, now: () => FIXED_NOW_MS },
  );
}

function answersFor(payload: DecisionPayload): SystemOneCallResult {
  const answers: Record<
    string,
    {
      type: 'choice';
      choice: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  > = {};
  Object.keys(payload.questions).forEach((key) => {
    answers[key] = { type: 'choice', choice: 'o1', confidence: 0.9 };
  });
  return {
    ok: true,
    result: {
      model: 'nimble',
      answers,
      usage: { input_tokens: 10, output_tokens: 4 },
    },
  };
}

/**
 * Today's listing shape: model ids with provenance, no `efforts` field.
 * The `efforts` field arrives with performance routing.
 */
function listingFor(
  models: Record<string, readonly LaneModelEntry[]>,
): LaneModelListing {
  return {
    list: async (row) => models[row.cli] ?? [],
  };
}

const LISTED_MODELS: Record<string, readonly LaneModelEntry[]> = {
  codex: [{ id: 'gpt-5.2-codex', provenance: 'reported' }],
  grok: [{ id: 'grok-4.1-fast', provenance: 'reported' }],
  'ptah-cli': [{ id: 'glm-4.7-air', provenance: 'reported' }],
};

/**
 * `count` delivered implement runs for one family and model, newest last,
 * all inside the 90-day outcome window relative to the fixed `now`.
 * Each run is a unique `runId` with a distinct `endedAt`.
 */
function deliveredRuns(options: {
  readonly prefix: string;
  readonly laneId: string;
  readonly family: string;
  readonly model: string;
  readonly count: number;
}): LaneOutcomeSummary[] {
  return Array.from({ length: options.count }, (_, index) => ({
    runId: `${options.prefix}-${index}`,
    laneId: options.laneId,
    family: options.family,
    model: options.model,
    taskKind: 'implement',
    verdict: 'delivered',
    failureClass: null,
    finalReview: null,
    reviseRounds: 0,
    durationMs: null,
    endedAt: FIXED_NOW_MS - (options.count - index) * 3_600_000,
    routingSource: 'ranking',
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
  }));
}

/** The real matrix store over mock files and a fixed outcome reader. */
function outcomeMatrix(
  summaries: readonly LaneOutcomeSummary[],
): RouteMatrix {
  const reader: LaneOutcomeReader = {
    isPersistent: () => true,
    recentOutcomes: async () => summaries,
    recentWorkspaceOutcomes: async () => summaries,
  };
  return new CapabilityMatrixStore({
    fileSystem: createMockFileSystemProvider(),
    ptahHomeDir: '/ptah-home',
    outcomeReader: reader,
    logger: testLogger(),
  });
}

function goldenHarness(options: {
  readonly limits?: ReadonlyMap<string, LaneLimitState> | null;
  readonly matrix?: RouteMatrix;
  readonly listing?: LaneModelListing;
  readonly modelUnavailable?: boolean;
}): {
  readonly service: RouteDecideService;
  readonly source: RouteCandidateSource;
  readonly calls: readonly DecisionPayload[];
} {
  const calls: DecisionPayload[] = [];
  const rows = jest.fn(async () => GOLDEN_ROWS);
  const source: RouteCandidateSource = {
    rows,
    limits: async () =>
      options.limits === undefined ? new Map() : options.limits,
    roles: async () => [],
    tools: jest.fn(async (candidate) =>
      candidate.kind === 'subagent' ? ['ptah_browser_navigate'] : [],
    ),
  };
  const service = new RouteDecideService({
    rotationSetting: { isEnabled: () => true },
    config: configFor(
      OLLAMA,
      async (url) => {
        throw new Error(`unexpected probe ${url}`);
      },
    ),
    matrix: options.matrix ?? neutralMatrix(),
    rotation: memoryRotation(),
    logger: testLogger(),
    listing: options.listing ?? listingFor(LISTED_MODELS),
    seams: {
      now: () => FIXED_NOW_MS,
      monotonicNow: () => FIXED_MONOTONIC_MS,
      residencyFetch: warmResidency,
      systemOne: () => ({
        decide: async (payload) => {
          calls.push(payload);
          return options.modelUnavailable === true
            ? TIMEOUT_REPLY
            : answersFor(payload);
        },
      }),
    },
  });
  return { service, source, calls };
}

type GoldenCaseName =
  | 'implement-gate'
  | 'review-gate'
  | 'grok-at-limit'
  | 'ranking-implement'
  | 'ranking-configured'
  | 'ranking-learned';

interface GoldenPhase {
  readonly id: string;
  readonly kind: 'implement' | 'review';
}

interface GoldenCase {
  readonly name: GoldenCaseName;
  readonly phases: readonly GoldenPhase[];
  readonly limits?: ReadonlyMap<string, LaneLimitState> | null;
  readonly matrix?: RouteMatrix;
  readonly listing?: LaneModelListing;
  readonly modelUnavailable?: boolean;
  readonly guard?: (result: GateResult) => void;
}

function chosenEntry(result: GateResult): ChosenEntry {
  const chosen = result.roster.find(
    (entry): entry is ChosenEntry => entry.status === 'chosen',
  );
  if (chosen === undefined) {
    throw new Error(`expected a chosen roster entry for the golden case`);
  }
  return chosen;
}

function candidateRow(
  result: GateResult,
  candidateId: string,
): NonNullable<ChosenEntry['candidates']>[number] {
  const candidates = chosenEntry(result).candidates;
  if (candidates === undefined) {
    throw new Error('expected a candidates trace on the chosen roster entry');
  }
  const row = candidates.find((entry) => entry.candidate === candidateId);
  if (row === undefined) {
    throw new Error(`expected a candidates row for ${candidateId}`);
  }
  return row;
}

const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: 'implement-gate',
    phases: [{ id: 'impl-1', kind: 'implement' }],
  },
  {
    name: 'review-gate',
    phases: [{ id: 'rev-1', kind: 'review' }],
  },
  {
    name: 'grok-at-limit',
    limits: new Map<string, LaneLimitState>([['grok', 'at-limit']]),
    phases: [{ id: 'impl-1', kind: 'implement' }],
  },
  {
    name: 'ranking-implement',
    phases: [{ id: 'impl-1', kind: 'implement' }],
    listing: listingFor({
      codex: [{ id: 'gpt-5.2-codex', provenance: 'reported' }],
      grok: [{ id: 'grok-4.1-fast', provenance: 'reported' }],
      'ptah-cli': [
        { id: 'glm-4.7-air', provenance: 'reported' },
        { id: 'glm-4.7-max', provenance: 'reported' },
      ],
    }),
    matrix: outcomeMatrix([
      // Would promote on a ptah-cli lane; codex is a system CLI lane, so
      // today it must keep `lane-default` and its baseline total.
      ...deliveredRuns({
        prefix: 'codex-promotable',
        laneId: 'codex',
        family: 'codex',
        model: 'gpt-5.2-codex',
        count: 5,
      }),
      // Beats the family cell by more than CLOSENESS_BAND, so the ptah-cli
      // lane gets a promoted listed model.
      ...deliveredRuns({
        prefix: 'openrouter-promoted',
        laneId: 'openrouter-main',
        family: 'openrouter',
        model: 'glm-4.7-max',
        count: 5,
      }),
      // Puts grok inside the closeness band, so the decision request is
      // made (and then times out) instead of skipped for too few options.
      ...deliveredRuns({
        prefix: 'grok-in-band',
        laneId: 'grok',
        family: 'grok',
        model: 'lane-default',
        count: 3,
      }),
    ]),
    modelUnavailable: true,
    guard: (result) => {
      expect(chosenEntry(result)).toMatchObject({
        status: 'chosen',
        source: 'ranking',
        fallbackCause: 'timeout',
        executor: { kind: 'lane', id: 'openrouter-main' },
        model: 'glm-4.7-max',
        provenance: 'reported',
        score: 67,
      });
      expect(candidateRow(result, 'openrouter-main')).toMatchObject({
        total: 60,
        parts: { learned: 15, exploration: 0, sampleCount: 5 },
      });
      expect(candidateRow(result, 'grok')).toMatchObject({
        total: 57,
        parts: { learned: 12, exploration: 0, sampleCount: 3 },
      });
      // System CLI lanes are not promoted today: codex keeps the baseline
      // total even though its listed model would clear the band (60 > 50).
      expect(candidateRow(result, 'codex')).toMatchObject({
        total: 50,
        parts: { learned: 5, exploration: 5, sampleCount: 0 },
      });
    },
  },
  {
    name: 'ranking-configured',
    phases: [{ id: 'impl-1', kind: 'implement' }],
    listing: listingFor({
      codex: [{ id: 'gpt-5.2-codex', provenance: 'reported' }],
      grok: [{ id: 'grok-4.1-fast', provenance: 'reported' }],
      'ptah-cli': [{ id: 'glm-4.7-air', provenance: 'configured' }],
    }),
    matrix: outcomeMatrix([
      // Family-profile evidence for the ptah-cli lane; no exact profile for
      // the configured id, so no promotion and the configured model is used.
      ...deliveredRuns({
        prefix: 'openrouter-configured',
        laneId: 'openrouter-main',
        family: 'openrouter',
        model: 'lane-default',
        count: 4,
      }),
      // Puts grok inside the closeness band, so the decision request is
      // made (and then times out) instead of skipped for too few options.
      ...deliveredRuns({
        prefix: 'grok-in-band',
        laneId: 'grok',
        family: 'grok',
        model: 'lane-default',
        count: 3,
      }),
    ]),
    modelUnavailable: true,
    guard: (result) => {
      expect(chosenEntry(result)).toMatchObject({
        source: 'ranking',
        fallbackCause: 'timeout',
        executor: { kind: 'lane', id: 'openrouter-main' },
        model: 'glm-4.7-air',
        provenance: 'configured',
        score: 64,
      });
      expect(candidateRow(result, 'openrouter-main')).toMatchObject({
        total: 59,
        parts: { learned: 14, exploration: 0, sampleCount: 4 },
      });
      expect(candidateRow(result, 'grok')).toMatchObject({
        total: 57,
        parts: { learned: 12, exploration: 0, sampleCount: 3 },
      });
    },
  },
  {
    name: 'ranking-learned',
    phases: [{ id: 'impl-1', kind: 'implement' }],
    matrix: outcomeMatrix([
      // Three samples: a non-zero learned delta with no exploration bonus.
      ...deliveredRuns({
        prefix: 'grok-learned',
        laneId: 'grok',
        family: 'grok',
        model: 'lane-default',
        count: 3,
      }),
      // Two samples: the exploration bonus applies.
      ...deliveredRuns({
        prefix: 'subagent-explore',
        laneId: 'subagent',
        family: 'claude',
        model: 'lane-default',
        count: 2,
      }),
    ]),
    modelUnavailable: true,
    guard: (result) => {
      expect(chosenEntry(result)).toMatchObject({
        source: 'ranking',
        fallbackCause: 'timeout',
        executor: { kind: 'subagent' },
      });
      expect(candidateRow(result, 'subagent:implement')).toMatchObject({
        total: 58,
        parts: { learned: 13, exploration: 5, sampleCount: 2 },
      });
      expect(candidateRow(result, 'grok')).toMatchObject({
        total: 57,
        parts: { learned: 12, exploration: 0, sampleCount: 3 },
      });
    },
  },
];

function gateArgs(
  phases: readonly GoldenPhase[],
): {
  readonly stage: 'gate-0.1';
  readonly request: string;
  readonly taskType: 'FEATURE';
  readonly depth: 'Full';
  readonly phases: readonly GoldenPhase[];
} {
  return {
    stage: 'gate-0.1',
    request: 'ship the change',
    taskType: 'FEATURE',
    depth: 'Full',
    phases,
  };
}

type GoldenFixture = Record<GoldenCaseName, unknown>;

async function loadGoldenFixture(): Promise<GoldenFixture> {
  const raw = await readFile(
    join(__dirname, '__fixtures__', 'route-off-golden.json'),
    'utf8',
  );
  return JSON.parse(raw) as GoldenFixture;
}

describe('route off golden', () => {
  it.each(GOLDEN_CASES)(
    "pins today's off-mode gate result for $name",
    async (goldenCase) => {
      const fixture = await loadGoldenFixture();
      const run = goldenHarness({
        limits: goldenCase.limits,
        matrix: goldenCase.matrix,
        listing: goldenCase.listing,
        modelUnavailable: goldenCase.modelUnavailable,
      });
      const result = await run.service.decide(
        gateArgs(goldenCase.phases),
        run.source,
      );
      // `routeId` arrives with performance routing; deleting it is a no-op
      // today and keeps later batches comparable against this fixture.
      delete (result as { routeId?: unknown }).routeId;
      expect(result).toEqual(fixture[goldenCase.name]);
      if (goldenCase.guard !== undefined && result.stage === 'gate-0.1') {
        goldenCase.guard(result);
      }
    },
  );
});
