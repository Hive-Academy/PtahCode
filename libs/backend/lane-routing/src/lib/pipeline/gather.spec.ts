import 'reflect-metadata';
import type { CliDetectionResult, LaneLimitState } from '@ptah-extension/shared';
import type { LimitEvidence } from '../contracts/route-decide-result.schema';
import type { LaneModelListing } from '../lane-model-listing.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { FAMILY_PROFILE_MODEL } from '../matrix/matrix.types';
import { EMPTY_OUTCOME_FIGURES } from '../matrix/outcome-figures';
import type { PhaseDefinitionReader } from '../phase-definition-reader.port';
import { emptyRotationState } from '../ranking/rotation.store';
import type { RouteCandidateSource } from '../route-candidate-source.port';
import { NEUTRAL_SCORE } from '../routing-constants';
import { readCandidateTools } from './candidate-tools';
import { gatherRouteCall, type RouteMatrix, type RouteRotation } from './gather';
import {
  capRouteDeadline,
  createRouteDeadline,
  withinBudget,
} from './route-deadline';

function testLogger(): LaneRoutingLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function lane(
  cli: CliDetectionResult['cli'],
  extra: Partial<CliDetectionResult> = {},
): CliDetectionResult {
  return { cli, installed: true, messagingMode: 'none', ...extra };
}

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
        layers: {},
        cell: { kind: 'unknown' as const },
        score: NEUTRAL_SCORE,
        noProfile: true,
      }),
    }),
  };
}

function okRotation(): RouteRotation {
  return {
    load: () => ({ state: emptyRotationState(), reason: null }),
    save: async () => ({ persisted: true }),
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('route-deadline', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns deadline immediately without calling task when budget is exhausted', async () => {
    const deadline = createRouteDeadline(1000, () => 1000);
    const task = jest.fn(async () => 'never');
    const result = await withinBudget(deadline, task);
    expect(result).toEqual({ kind: 'deadline' });
    expect(task).not.toHaveBeenCalled();
  });

  it('caps a parent deadline to a smaller sub-budget', () => {
    let now = 500;
    const outer = createRouteDeadline(8500, () => now);
    const capped = capRouteDeadline(outer, 2000);
    expect(capped.remainingMs()).toBe(2000);
    now = 1500;
    expect(capped.remainingMs()).toBe(1000);
    now = 2600;
    expect(capped.remainingMs()).toBe(0);
  });

  it('aborts a hanging task on deadline and observes late rejections without throwing', async () => {
    jest.useFakeTimers();
    const lateError = jest.fn();
    let seenSignal: AbortSignal | undefined;
    const pending = deferred<string>();
    const deadline = createRouteDeadline(1050, () => 1000);

    const race = withinBudget(
      deadline,
      (signal) => {
        seenSignal = signal;
        return pending.promise;
      },
      lateError,
    );

    jest.advanceTimersByTime(50);
    await expect(race).resolves.toEqual({ kind: 'deadline' });
    expect(seenSignal?.aborted).toBe(true);

    pending.reject(new Error('late boom'));
    await Promise.resolve();
    await Promise.resolve();
    expect(lateError).toHaveBeenCalledTimes(1);
  });

  it('classifies abort-triggered rejection as deadline regardless of callback order', async () => {
    jest.useFakeTimers();
    const deadline = createRouteDeadline(1025, () => 1000);

    const race = withinBudget(
      deadline,
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('aborted immediately'));
          });
        }),
    );

    jest.advanceTimersByTime(25);
    await expect(race).resolves.toEqual({ kind: 'deadline' });
  });
});

describe('gatherRouteCall', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('records a thrown child eligibility check as ineligible with a reason', async () => {
    const logger = testLogger();
    const gathered = await gatherRouteCall({
      source: {
        rows: async () => [] as CliDetectionResult[],
        limits: async () => new Map(),
        roles: async () => [],
        childSessionEligible: () => {
          throw new Error('unavailable');
        },
      },
      listing: undefined,
      matrix: neutralMatrix(),
      rotation: okRotation(),
      logger,
      nowMs: 0,
      listingBudgetMs: 1,
    });
    expect(gathered.childSessionEligible).toBe(false);
    expect(gathered.detailReasons).toContain(
      'Child session eligibility could not be checked',
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('prefers limitEvidence over legacy limits and never calls legacy limits when present', async () => {
    const limits = jest.fn(async () => new Map<string, LaneLimitState>());
    const evidenceMap = new Map<string, LimitEvidence>([
      [
        'codex',
        {
          state: 'confirmed-room',
          lookup: 'ok',
          status: 'available',
          readAt: 1_700_000_000_000,
        },
      ],
      [
        'kimi-cli',
        {
          state: 'near-limit',
          lookup: 'ok',
          status: 'available',
          readAt: 1_700_000_010_000,
        },
      ],
    ]);
    const limitEvidence = jest.fn(async () => evidenceMap);
    const gathered = await gatherRouteCall({
      source: {
        rows: async () => [
          lane('codex'),
          lane('ptah-cli', { ptahCliId: 'kimi-cli', ptahCliName: 'Kimi Code' }),
        ],
        limits,
        limitEvidence,
        roles: async () => ['custom-role'],
      },
      listing: {
        list: async () => [{ id: 'gpt-5', provenance: 'reported' }],
      },
      matrix: neutralMatrix(),
      rotation: okRotation(),
      logger: testLogger(),
      nowMs: 1_700_000_060_000,
      listingBudgetMs: 100,
    });

    expect(limitEvidence).toHaveBeenCalledTimes(1);
    expect(limits).not.toHaveBeenCalled();
    expect(gathered.lanes[0]).toMatchObject({
      id: 'codex',
      limitState: 'confirmed-room',
      limitEvidence: evidenceMap.get('codex'),
    });
    expect(gathered.lanes[1]).toMatchObject({
      id: 'kimi-cli',
      displayName: 'Kimi Code',
      limitState: 'near-limit',
      limitEvidence: evidenceMap.get('kimi-cli'),
    });
    expect(gathered.missing).not.toContain('limits');
    expect(gathered.nowMs).toBe(1_700_000_060_000);
  });

  it('records per-lane model listing statuses (ok, timeout, error, empty, unregistered) without global line', async () => {
    jest.useFakeTimers();
    const rows = [
      lane('codex'),
      lane('grok'),
      lane('opencode'),
      lane('ptah-cli', { ptahCliId: 'kimi-cli', ptahCliName: 'Kimi Code' }),
    ];
    const listing: LaneModelListing = {
      list: async (row, signal) => {
        if (row.cli === 'codex') {
          return [
            { id: 'codex-default', provenance: 'configured' },
            { id: 'codex-fast', provenance: 'reported' },
          ];
        }
        if (row.cli === 'grok') {
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('listing aborted'));
            });
          });
        }
        if (row.cli === 'opencode') {
          throw new Error('provider failed');
        }
        return [];
      },
    };
    const promise = gatherRouteCall({
      source: {
        rows: async () => rows,
        limits: async () => new Map(),
        roles: async () => [],
      },
      listing,
      matrix: neutralMatrix(),
      rotation: okRotation(),
      logger: testLogger(),
      nowMs: 1000,
      listingBudgetMs: 40,
    });

    await jest.advanceTimersByTimeAsync(40);
    const gathered = await promise;

    expect(gathered.models.get('codex')).toMatchObject({
      status: 'ok',
      configuredModel: { id: 'codex-default', provenance: 'configured' },
    });
    expect(gathered.models.get('grok')).toEqual({
      models: [],
      status: 'timeout',
    });
    expect(gathered.models.get('opencode')).toEqual({
      models: [],
      status: 'error',
    });
    expect(gathered.models.get('kimi-cli')).toEqual({
      models: [],
      status: 'empty',
    });
    expect(gathered.missing).not.toContain('model-lists');
    expect(gathered.detailReasons).toEqual([
      'models unknown for grok (timeout)',
      'models unknown for opencode (error)',
      'models unknown for kimi-cli (empty)',
    ]);

    const unregistered = await gatherRouteCall({
      source: {
        rows: async () => [
          lane('ptah-cli', { ptahCliId: 'ollama-code', ptahCliName: 'Ollama Code' }),
        ],
        limits: async () => new Map(),
        roles: async () => [],
      },
      listing: undefined,
      matrix: neutralMatrix(),
      rotation: okRotation(),
      logger: testLogger(),
      nowMs: 1000,
      listingBudgetMs: 40,
    });
    expect(unregistered.models.get('ollama-code')).toEqual({
      models: [],
      status: 'unregistered',
    });
    expect(unregistered.missing).not.toContain('model-lists');
    expect(unregistered.detailReasons).toEqual([
      'models unknown for ollama-code (unregistered)',
    ]);
  });

  it('bounds never-resolving ports, keeps completed siblings, and ignores late results', async () => {
    jest.useFakeTimers();
    const deadline = createRouteDeadline(Date.now() + 100, () => Date.now());

    const limitsDeferred = deferred<ReadonlyMap<string, LimitEvidence> | null>();
    const matrixDeferred = deferred<Awaited<ReturnType<RouteMatrix['load']>>>();
    const slowListing = deferred<readonly { id: string; provenance: 'reported' }[]>();
    const slowPhaseDef = deferred<string>();
    const slowTools = deferred<readonly string[] | null>();

    const source: RouteCandidateSource = {
      rows: async () => [lane('codex'), lane('grok')],
      limits: async () => new Map(),
      limitEvidence: () => limitsDeferred.promise,
      roles: async () => ['custom-role'],
      tools: (candidate) =>
        candidate.id === 'codex'
          ? Promise.resolve(['ptah_browser_navigate'])
          : slowTools.promise,
    };
    const listing: LaneModelListing = {
      list: (row) =>
        row.cli === 'codex'
          ? Promise.resolve([{ id: 'codex-1', provenance: 'reported' }])
          : slowListing.promise,
    };
    const phaseDefinitionReader: PhaseDefinitionReader = {
      read: (kind) =>
        kind === 'visual-review'
          ? slowPhaseDef.promise
          : Promise.resolve('---\nversion: 2\n---\n'),
    };

    const gatherPromise = gatherRouteCall({
      source,
      listing,
      matrix: { load: () => matrixDeferred.promise },
      rotation: okRotation(),
      logger: testLogger(),
      nowMs: 50_000,
      listingBudgetMs: 500,
      deadline,
      phases: [
        { id: 'look', kind: 'visual-review' },
        { id: 'build', kind: 'implement' },
      ],
      phaseDefinitionReader,
    });

    await jest.advanceTimersByTimeAsync(100);
    const gathered = await gatherPromise;

    // Completed siblings preserved.
    expect(gathered.lanes.map((entry) => entry.id)).toEqual(['codex', 'grok']);
    expect(gathered.roles).toEqual(['custom-role']);
    expect(gathered.models.get('codex')?.status).toBe('ok');
    expect(gathered.models.get('codex')?.models.map((m) => m.id)).toEqual([
      'codex-1',
    ]);

    // Timed-out siblings degraded cleanly with explicit reasons.
    expect(gathered.lanes.every((entry) => entry.limitState === 'unknown')).toBe(
      true,
    );
    expect(gathered.missing).toContain('limits');
    expect(gathered.missing).toContain('matrix-file');
    expect(gathered.models.get('grok')).toEqual({
      models: [],
      status: 'timeout',
    });
    expect(gathered.detailReasons).toContain('models unknown for grok (timeout)');
    expect(gathered.detailReasons).toContain(
      'phase definition unavailable for visual-review (timeout)',
    );
    expect(gathered.resolvedPhases?.[0].requiredCapabilities).toEqual([
      'browser',
    ]);
    // Matrix degraded to neutral.
    expect(
      gathered.matrix.resolve('codex', 'lane-default', 'implement').score,
    ).toBe(NEUTRAL_SCORE);
    // Tools timed out because deadline already reached 0 -> null (capability unknown).
    expect(gathered.toolNamesByPhase?.get('look')?.get('codex')).toBeNull();
    expect(gathered.toolNamesByPhase?.get('look')?.get('grok')).toBeNull();
    expect(gathered.detailReasons).toContain(
      'tool evidence unavailable for phase look (timeout)',
    );

    // Late resolutions/rejections after deadline must not mutate snapshot or throw.
    limitsDeferred.resolve(
      new Map([
        [
          'codex',
          {
            state: 'at-limit',
            lookup: 'ok',
            status: 'available',
            readAt: 50_000,
          },
        ],
      ]),
    );
    matrixDeferred.reject(new Error('late matrix crash'));
    slowListing.reject(new Error('late listing crash'));
    slowPhaseDef.reject(new Error('late phase-def crash'));
    slowTools.resolve(['ptah_browser_navigate']);
    await Promise.resolve();
    await Promise.resolve();

    expect(gathered.lanes[0].limitState).toBe('unknown');
    expect(gathered.models.get('grok')?.status).toBe('timeout');
    expect(gathered.toolNamesByPhase?.get('look')?.get('grok')).toBeNull();
  });

  it('starts roles immediately so completed roles survive a rows timeout', async () => {
    jest.useFakeTimers();
    const deadline = createRouteDeadline(Date.now() + 50, () => Date.now());
    const hangingRows = deferred<readonly CliDetectionResult[]>();

    const gatherPromise = gatherRouteCall({
      source: {
        rows: () => hangingRows.promise,
        limits: async () => new Map(),
        roles: async () => ['specialist'],
      },
      listing: undefined,
      matrix: neutralMatrix(),
      rotation: okRotation(),
      logger: testLogger(),
      nowMs: 1000,
      listingBudgetMs: 100,
      deadline,
    });

    await jest.advanceTimersByTimeAsync(50);
    const gathered = await gatherPromise;

    expect(gathered.lanes).toEqual([]);
    expect(gathered.roles).toEqual(['specialist']);
    expect(gathered.missing).toContain('agent-list');
    expect(gathered.missing).not.toContain('roles');
  });
});

describe('readCandidateTools', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps completed candidate tools and degrades timed-out or failing reads to null', async () => {
    jest.useFakeTimers();
    const deadline = createRouteDeadline(Date.now() + 60, () => Date.now());
    const slow = deferred<readonly string[] | null>();
    const logger = testLogger();

    const promise = readCandidateTools(
      [{ id: 'look', kind: 'visual-review', requiredCapabilities: ['browser'] }],
      {
        lanes: [
          {
            kind: 'lane',
            id: 'codex',
            cli: 'codex',
            family: 'codex',
            installed: true,
            disabled: false,
            limitState: 'confirmed-room',
          },
          {
            kind: 'lane',
            id: 'grok',
            cli: 'grok',
            family: 'grok',
            installed: true,
            disabled: false,
            limitState: 'confirmed-room',
          },
          {
            kind: 'lane',
            id: 'opencode',
            cli: 'opencode',
            family: 'opencode',
            installed: true,
            disabled: false,
            limitState: 'confirmed-room',
          },
        ],
        roles: [],
      },
      {
        rows: async () => [],
        limits: async () => new Map(),
        roles: async () => [],
        tools: (candidate) => {
          if (candidate.id === 'codex') {
            return Promise.resolve(['ptah_browser_navigate']);
          }
          if (candidate.id === 'grok') {
            return Promise.reject(new Error('tools boom'));
          }
          return slow.promise;
        },
      },
      logger,
      deadline,
    );

    await jest.advanceTimersByTimeAsync(60);
    const byPhase = await promise;

    expect(byPhase.get('look')?.get('codex')).toEqual(['ptah_browser_navigate']);
    expect(byPhase.get('look')?.get('grok')).toBeNull();
    expect(byPhase.get('look')?.get('opencode')).toBeNull();
    expect(byPhase.get('look')?.get('subagent:visual-review')).toBeNull();

    slow.reject(new Error('late tool rejection'));
    await Promise.resolve();
    await Promise.resolve();
    expect(byPhase.get('look')?.get('opencode')).toBeNull();
  });
});
