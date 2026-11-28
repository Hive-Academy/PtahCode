import {
  MAX_SETUP_RUNS_PER_WORKSPACE,
  SETUP_RUNS_STORAGE_KEY,
  capWorkspaceRuns,
  isSetupRunStepOf,
  normalizeSetupWorkspacePath,
  parseSetupRunRecord,
  readSetupRunIndex,
  serializeSetupRunIndex,
  writeSetupRunIndex,
} from './setup-run-persistence';
import type { SetupRunRecord } from './setup-run.types';

const WORKSPACE = '/home/dev/project';

function record(overrides: Partial<SetupRunRecord> = {}): SetupRunRecord {
  return {
    id: 'setup-1',
    workspacePath: WORKSPACE,
    workflow: 'analysis',
    status: 'running',
    step: 'analyzing',
    backendRunId: 'run-1',
    analysisRunId: null,
    parentId: null,
    unseen: false,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

/** In-memory Storage double holding the raw stored string. */
function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: jest.fn((key: string) =>
      key === SETUP_RUNS_STORAGE_KEY ? value : null,
    ),
    setItem: jest.fn((key: string, next: string) => {
      if (key === SETUP_RUNS_STORAGE_KEY) value = next;
    }),
    raw: () => value,
  };
}

function stored(byWorkspace: Record<string, unknown>, version: unknown = 1) {
  return JSON.stringify({ version, byWorkspace });
}

describe('setup-run-persistence', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('uses the versioned storage key and a cap of 20', () => {
    expect(SETUP_RUNS_STORAGE_KEY).toBe('ptah.setup-runs.v1');
    expect(MAX_SETUP_RUNS_PER_WORKSPACE).toBe(20);
  });

  describe('normalizeSetupWorkspacePath', () => {
    it('trims whitespace and trailing separators', () => {
      expect(normalizeSetupWorkspacePath('  /a/b/  ')).toBe('/a/b');
      expect(normalizeSetupWorkspacePath('C:\\work\\repo\\\\')).toBe(
        'C:\\work\\repo',
      );
    });

    it('keeps a bare root and rejects empty input', () => {
      expect(normalizeSetupWorkspacePath('/')).toBe('/');
      expect(normalizeSetupWorkspacePath('   ')).toBeNull();
      expect(normalizeSetupWorkspacePath(null)).toBeNull();
      expect(normalizeSetupWorkspacePath(undefined)).toBeNull();
      expect(normalizeSetupWorkspacePath('/' + 'a'.repeat(5000))).toBeNull();
    });
  });

  describe('isSetupRunStepOf', () => {
    it('accepts only steps of the given workflow', () => {
      expect(isSetupRunStepOf('skill-review', 'selecting')).toBe(true);
      expect(isSetupRunStepOf('analysis', 'selecting')).toBe(false);
      expect(isSetupRunStepOf('team-builder', 'handed-off')).toBe(true);
      expect(isSetupRunStepOf('team-builder', 42)).toBe(false);
    });
  });

  describe('parseSetupRunRecord', () => {
    it.each([5_000, 'skipped', 'consumed'] as const)(
      'round-trips guidance hand-off state %s for completed agent generation',
      (guidanceHandoff) => {
        const agent = {
          ...record({
            workflow: 'agent-generation',
            status: 'completed',
            step: 'generating',
          }),
          guidanceHandoff,
        };
        const stored = serializeSetupRunIndex({ [WORKSPACE]: [agent] });
        expect(
          readSetupRunIndex({ getItem: () => stored }).index[WORKSPACE],
        ).toEqual([agent]);
      },
    );

    it('drops invalid hand-off metadata and metadata on unrelated records', () => {
      expect(
        parseSetupRunRecord({ ...record(), guidanceHandoff: 'skipped' }),
      ).toEqual(record());
      const agent = record({
        workflow: 'agent-generation',
        status: 'completed',
        step: 'generating',
      });
      expect(parseSetupRunRecord({ ...agent, guidanceHandoff: -1 })).toEqual(
        agent,
      );
    });

    it('round-trips a valid record and normalizes its workspace', () => {
      const parsed = parseSetupRunRecord({
        ...record(),
        workspacePath: `${WORKSPACE}/`,
      });
      expect(parsed).toEqual(record());
    });

    it('drops unknown and sensitive fields', () => {
      const parsed = parseSetupRunRecord({
        ...record(),
        transcript: 'model output',
        apiKey: 'sk-secret',
        fileContents: 'contents',
      });
      expect(parsed).toEqual(record());
      expect(Object.keys(parsed ?? {})).not.toEqual(
        expect.arrayContaining(['transcript', 'apiKey', 'fileContents']),
      );
    });

    it.each([
      ['a non-object', 'nope'],
      ['an array', []],
      ['an id with a path separator', { ...record(), id: 'a/b' }],
      ['an empty workspace', { ...record(), workspacePath: '  ' }],
      ['an unknown workflow', { ...record(), workflow: 'deploy' }],
      ['an unknown status', { ...record(), status: 'paused' }],
      ['a step of another workflow', { ...record(), step: 'selecting' }],
      ['a non-boolean unseen', { ...record(), unseen: 'yes' }],
      ['a negative timestamp', { ...record(), createdAt: -1 }],
      ['a non-finite timestamp', { ...record(), updatedAt: Infinity }],
      ['an invalid backend run id', { ...record(), backendRunId: 'x:y' }],
      ['a missing parent id', { ...record(), parentId: undefined }],
    ])('rejects %s', (_label, value) => {
      expect(parseSetupRunRecord(value)).toBeNull();
    });

    it('keeps the skill-review selection only for skill-review runs', () => {
      const review = parseSetupRunRecord({
        ...record({ workflow: 'skill-review', step: 'selecting' }),
        selection: { skillIds: ['a', 'b'] },
      });
      expect(review?.selection).toEqual({ skillIds: ['a', 'b'] });

      const analysis = parseSetupRunRecord({
        ...record(),
        selection: { skillIds: ['a'] },
      });
      expect(analysis).not.toHaveProperty('selection');
    });

    it('drops an invalid selection without rejecting the record', () => {
      const parsed = parseSetupRunRecord({
        ...record({ workflow: 'skill-review', step: 'reviewing' }),
        selection: { skillIds: ['ok', 7] },
      });
      expect(parsed).not.toBeNull();
      expect(parsed).not.toHaveProperty('selection');
    });

    it('keeps team-builder fields only for team-builder runs', () => {
      const team = parseSetupRunRecord({
        ...record({ workflow: 'team-builder', step: 'handed-off' }),
        teamBuilder: { intent: '', installed: ['skill-a'] },
        handoffTabId: 'tab-1',
      });
      expect(team?.teamBuilder).toEqual({ intent: '', installed: ['skill-a'] });
      expect(team?.handoffTabId).toBe('tab-1');

      const withRecovery = parseSetupRunRecord({
        ...record({ workflow: 'team-builder', step: 'consent' }),
        teamBuilder: {
          intent: 'Build QA',
          installed: ['skill-a'],
          selectedIds: ['owner/repo/a'],
          ownerDecision: 'raise',
          installCompleted: true,
          hadAttachments: true,
        },
      });
      expect(withRecovery?.teamBuilder).toEqual({
        intent: 'Build QA',
        installed: ['skill-a'],
        selectedIds: ['owner/repo/a'],
        ownerDecision: 'raise',
        installCompleted: true,
        hadAttachments: true,
      });

      const invalidOptional = parseSetupRunRecord({
        ...record({ workflow: 'team-builder', step: 'consent' }),
        teamBuilder: {
          intent: 'Build QA',
          installed: [],
          selectedIds: [42],
          ownerDecision: 'invalid',
          installCompleted: 'yes',
          hadAttachments: 1,
        },
      });
      expect(invalidOptional?.teamBuilder).toEqual({
        intent: 'Build QA',
        installed: [],
      });

      const other = parseSetupRunRecord({
        ...record(),
        teamBuilder: { intent: 'x', installed: [] },
        handoffTabId: 'tab-1',
      });
      expect(other).not.toHaveProperty('teamBuilder');
      expect(other).not.toHaveProperty('handoffTabId');
    });

    it('keeps bounded origin and error text and drops oversized text', () => {
      const parsed = parseSetupRunRecord({
        ...record({ status: 'failed' }),
        origin: 'chat-launcher',
        error: 'x'.repeat(501),
      });
      expect(parsed?.origin).toBe('chat-launcher');
      expect(parsed).not.toHaveProperty('error');
    });
  });

  describe('capWorkspaceRuns', () => {
    it('returns the records unchanged at or under the cap', () => {
      const runs = Array.from({ length: 20 }, (_, i) =>
        record({ id: `setup-${i}`, status: 'completed', updatedAt: i }),
      );
      expect(capWorkspaceRuns(runs)).toEqual(runs);
    });

    it('evicts the oldest terminal records first', () => {
      const live = record({
        id: 'setup-live',
        status: 'running',
        updatedAt: 0,
      });
      const terminal = Array.from({ length: 21 }, (_, i) =>
        record({ id: `setup-t${i}`, status: 'completed', updatedAt: 100 + i }),
      );
      const capped = capWorkspaceRuns([live, ...terminal]);

      expect(capped).toHaveLength(20);
      const ids = capped.map((r) => r.id);
      expect(ids).toContain('setup-live');
      expect(ids).not.toContain('setup-t0');
      expect(ids).not.toContain('setup-t1');
      expect(ids).toContain('setup-t2');
    });

    it('never drops a live record, even over the cap', () => {
      const runs = Array.from({ length: 22 }, (_, i) =>
        record({
          id: `setup-${i}`,
          status: i % 2 === 0 ? 'running' : 'needs-input',
          updatedAt: i,
        }),
      );
      expect(capWorkspaceRuns(runs)).toHaveLength(22);
    });
  });

  describe('readSetupRunIndex', () => {
    it('returns an empty, non-corrupt index when nothing is stored', () => {
      expect(readSetupRunIndex(memoryStorage())).toEqual({
        index: {},
        corrupt: false,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('reads valid records per workspace', () => {
      const storage = memoryStorage(stored({ [WORKSPACE]: [record()] }));
      expect(readSetupRunIndex(storage)).toEqual({
        index: { [WORKSPACE]: [record()] },
        corrupt: false,
      });
      expect(storage.getItem).toHaveBeenCalledWith('ptah.setup-runs.v1');
    });

    it.each([
      ['unparseable JSON', '{not json'],
      ['a wrong version', stored({ [WORKSPACE]: [record()] }, 2)],
      ['a non-object payload', JSON.stringify([1, 2])],
      ['a missing byWorkspace', JSON.stringify({ version: 1 })],
    ])('discards %s as corrupt with a warning', (_label, raw) => {
      expect(readSetupRunIndex(memoryStorage(raw))).toEqual({
        index: {},
        corrupt: true,
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('treats a throwing storage read as corrupt', () => {
      const storage = {
        getItem: jest.fn(() => {
          throw new Error('denied');
        }),
      };
      expect(readSetupRunIndex(storage)).toEqual({ index: {}, corrupt: true });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('discards invalid, misfiled and duplicate records and keeps the rest', () => {
      const other = '/home/dev/other';
      const storage = memoryStorage(
        stored({
          [WORKSPACE]: [
            record(),
            record({ id: 'setup-2', status: 'bogus' as never }),
            record({ id: 'setup-3', workspacePath: other }),
            record({ status: 'completed' }),
          ],
          [other]: 'not-a-list',
        }),
      );
      const result = readSetupRunIndex(storage);

      expect(result.corrupt).toBe(false);
      expect(result.index).toEqual({ [WORKSPACE]: [record()] });
      expect(warnSpy).toHaveBeenCalledTimes(4);
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(WORKSPACE);
    });

    it('merges buckets whose keys normalize to the same workspace', () => {
      const storage = memoryStorage(
        stored({
          [WORKSPACE]: [record()],
          [`${WORKSPACE}/`]: [record({ id: 'setup-2' })],
        }),
      );
      expect(
        readSetupRunIndex(storage).index[WORKSPACE].map((r) => r.id),
      ).toEqual(['setup-1', 'setup-2']);
    });

    it('caps each workspace on read', () => {
      const runs = Array.from({ length: 25 }, (_, i) =>
        record({ id: `setup-${i}`, status: 'failed', updatedAt: i }),
      );
      const storage = memoryStorage(stored({ [WORKSPACE]: runs }));
      const kept = readSetupRunIndex(storage).index[WORKSPACE];
      expect(kept).toHaveLength(20);
      expect(kept[0].id).toBe('setup-5');
    });
  });

  describe('serializeSetupRunIndex / writeSetupRunIndex', () => {
    it('writes a versioned payload that reads back identically', () => {
      const storage = memoryStorage();
      const index = {
        [WORKSPACE]: [
          record(),
          record({
            id: 'setup-2',
            workflow: 'skill-review',
            step: 'selecting',
            status: 'needs-input',
            parentId: 'setup-1',
            analysisRunId: 'run-1',
            selection: { skillIds: ['s1'] },
          }),
        ],
      };

      expect(writeSetupRunIndex(storage, index)).toBe(true);
      expect(storage.setItem).toHaveBeenCalledWith(
        'ptah.setup-runs.v1',
        expect.any(String),
      );
      expect(JSON.parse(storage.raw() ?? '')).toMatchObject({ version: 1 });
      expect(readSetupRunIndex(storage)).toEqual({ index, corrupt: false });
    });

    it('persists no field outside the record whitelist', () => {
      const leaky = {
        ...record(),
        transcript: 'model output',
        credentials: 'token',
      } as SetupRunRecord;
      const json = serializeSetupRunIndex({ [WORKSPACE]: [leaky] });

      expect(json).not.toContain('model output');
      expect(json).not.toContain('token');
      const keys = Object.keys(JSON.parse(json).byWorkspace[WORKSPACE][0]);
      expect(keys.sort()).toEqual(Object.keys(record()).sort());
    });

    it('drops invalid records, empty workspaces and caps on write', () => {
      const runs = Array.from({ length: 21 }, (_, i) =>
        record({ id: `setup-${i}`, status: 'cancelled', updatedAt: i }),
      );
      const json = serializeSetupRunIndex({
        [WORKSPACE]: [...runs, record({ id: 'bad/id' })],
        '/empty': [],
      });
      const parsed = JSON.parse(json).byWorkspace;

      expect(Object.keys(parsed)).toEqual([WORKSPACE]);
      expect(parsed[WORKSPACE]).toHaveLength(20);
      expect(parsed[WORKSPACE][0].id).toBe('setup-1');
    });

    it('returns false with a warning when storage refuses the write', () => {
      const storage = {
        setItem: jest.fn(() => {
          throw new Error('QuotaExceededError');
        }),
      };
      expect(writeSetupRunIndex(storage, { [WORKSPACE]: [record()] })).toBe(
        false,
      );
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
