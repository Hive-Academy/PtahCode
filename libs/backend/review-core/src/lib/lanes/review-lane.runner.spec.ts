import type { ReviewLaneSettings } from '@ptah-extension/review-contracts';
import { ReviewLaneRunner, type IReviewLaneFiles, type IReviewLaneGateway, type ReviewLaneRequest } from './review-lane.runner';
import { ReviewLaneAdmissionService, type IReviewLaneClock } from './review-lane-admission.service';
import { ReviewLaneAttempt } from './review-lane-attempt';
import { ReviewLaneSpawnError, UNKNOWN_LANE_RUN_USAGE } from './review-lane-usage';

const sha = 'a'.repeat(40);
/** What a gateway that read no usage resolves with. */
const ended = { usage: UNKNOWN_LANE_RUN_USAGE(false) };
const unknownRun = UNKNOWN_LANE_RUN_USAGE(false);
const counted = { inputTokens: 10, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsd: null, model: null };
const repo = { owner: 'Hive-Academy', name: 'PtahCode' } as const;
const baseRequest = { repo, prKey: 'repo#1', attemptId: 'attempt-1', attemptRoot: '/attempt', headSha: sha, kind: 'triage', prompt: 'review', runDeadlineMs: 1000 } as const;
const verdict = JSON.stringify({ schemaVersion: 1, candidateId: 'candidate', headSha: sha, verdict: 'inconclusive',
  checkedEvidence: [{ path: 'a.ts', line: 1, observation: 'checked' }], reason: 'no disproof', confidence: 0.5, verifierFamily: 'family-a' });

describe('ReviewLaneRunner', () => {
  let now: number;
  let clock: IReviewLaneClock;
  let gateway: IReviewLaneGateway;
  let files: IReviewLaneFiles;
  let runner: ReviewLaneRunner;
  let laneSettings: ReviewLaneSettings | Error;
  let request: ReviewLaneRequest;
  const logger = { error: jest.fn() };
  const attemptFor = (): ReviewLaneAttempt => new ReviewLaneAttempt({ source: gateway, clock, logger: { warn: jest.fn() },
    settings: { get: async () => { if (laneSettings instanceof Error) throw laneSettings; return laneSettings; } } });

  beforeEach(() => {
    now = 0;
    clock = { now: () => now, setTimeout, clearTimeout };
    laneSettings = { pool: [], pins: {} };
    gateway = {
      list: async () => ({ lanes: [{ id: 'lane', label: 'lane', family: 'family-a', limitState: 'confirmed-room' }], maxConcurrentAgents: 4 }),
      listModels: async () => ({}),
      modelBlocked: () => false,
      spawn: async () => ended,
    };
    request = { ...baseRequest, attempt: attemptFor() };
    files = { prepare: jest.fn().mockResolvedValue('same'), sourceChecksum: jest.fn().mockResolvedValue('same'),
      clearOutput: jest.fn().mockResolvedValue(undefined),
      readOutput: jest.fn().mockImplementation(async (_root: string, name: string) => name === 'walkthrough.md'
        ? '# Observed behavior\n\n# Inferred risks\n\n# Risk map\n'
        : JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] })) };
    runner = new ReviewLaneRunner(gateway, files, clock, new ReviewLaneAdmissionService(clock), logger,
      { resolve: async () => ({ repoRoot: '/repo', attemptsRoot: '/attempts' }),
        settings: async () => ({ repositories: [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }],
          maintainerLogins: ['maintainer'], pollMinutes: 10, globalPublicationPaused: false, laneCapPerPr: 6, fallbackFamilies: [] }),
        baseConfig: async () => null });
    logger.error.mockClear();
  });

  it('runs in the attempt root and accepts a validated payload', async () => {
    const spawn = jest.spyOn(gateway, 'spawn');
    expect(await runner.run(request)).toMatchObject({ status: 'completed', family: 'family-a' });
    expect(files.prepare).toHaveBeenCalledWith(repo, '/attempt', sha, expect.any(AbortSignal));
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/attempt' }));
    expect(files.readOutput).toHaveBeenCalledWith('/attempt', 'lane-output.json');
    expect(files.clearOutput).toHaveBeenCalledWith('/attempt', expect.any(Boolean));
  });

  it('does not reuse lane one findings when lane two writes nothing', async () => {
    let output: string | undefined;
    files.clearOutput = jest.fn().mockImplementation(async () => { output = undefined; });
    gateway.spawn = jest.fn().mockImplementation(async () => {
      if (output === undefined && (gateway.spawn as jest.Mock).mock.calls.length === 1) {
        output = JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [{
          schemaVersion: 1, lens: 'correctness-lifecycle', title: 'Prior finding', failureMode: 'A prior lane found a defect',
          affectedBehavior: 'Review result', scenario: 'The next lane writes no output', path: 'src/file.ts', line: 1,
          evidence: [{ path: 'src/file.ts', line: 1, excerpt: 'example' }], affectedCaller: null,
          severity: 'Major', category: 'functional', confidence: 0.9, suggestedDiff: null, fixPrompt: 'Fix the defect',
        }], coverage: ['finding'] });
      }
      return ended;
    });
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => {
      if (name === 'walkthrough.md') return '# Observed behavior\n# Inferred risks\n# Risk map\n';
      if (output === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return output;
    });
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'output-missing' });
    expect(files.clearOutput).toHaveBeenCalledTimes(3);
  });

  it('reads the file after spawn instead of treating stdout as the payload', async () => {
    gateway.spawn = async () => ended;
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
  });

  it('accepts a UTF-8 BOM on JSON and the triage walkthrough', async () => {
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => name === 'walkthrough.md'
      ? '\uFEFF# Observed behavior\n# Inferred risks\n# Risk map\n'
      : `\uFEFF${JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] }, null, 2)}`);
    expect(await runner.run(request)).toMatchObject({ status: 'completed', output: { findings: [] } });
  });

  it('reports missing output after a completed lane', async () => {
    files.readOutput = jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'output-missing' });
  });

  it('reports the schema path for invalid output', async () => {
    files.readOutput = jest.fn().mockResolvedValue(JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: 7 }));
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'output-invalid: coverage' });
  });

  it('preserves precise status and timeout failures', async () => {
    gateway.spawn = async () => { throw new Error('status-failed: quota'); };
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'status-failed: quota' });
    gateway.spawn = async () => { throw new Error('timeout'); };
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'timeout' });
  });

  it('keeps the review when the walkthrough lacks required headings, and logs the cause', async () => {
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => name === 'walkthrough.md'
      ? '# Observed behavior\n' : JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] }));
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('without the required headings') }));
  });

  it('accepts a valid out/triage.json without an earlier-format walkthrough', async () => {
    const triage = { schemaVersion: 1, summary: 'A change.', changeType: 'fix', risk: { level: 'low', reason: 'Small.' },
      areas: [{ name: 'Core', paths: ['a.ts'], summary: 'Fixes a bug.', details: [] }], risks: [], apiChanges: [],
      tests: { summary: 'Covered.', gaps: [] } };
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => {
      if (name === 'walkthrough.md') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return name === 'triage.json' ? JSON.stringify(triage) : JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] });
    });
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
  });

  it('keeps the review when out/triage.json is invalid and no walkthrough.md exists', async () => {
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => {
      if (name === 'triage.json') return '{"schemaVersion":1}';
      if (name === 'walkthrough.md') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] });
    });
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('triage.json invalid at summary, risk, areas') }));
    expect(files.clearOutput).toHaveBeenCalledTimes(1);
  });

  it('keeps the review when out/triage.json and walkthrough.md are both missing', async () => {
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => {
      if (name === 'triage.json' || name === 'walkthrough.md') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] });
    });
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('triage.json missing; walkthrough.md missing') }));
  });

  it('accepts a triage.json with over-long text instead of failing the lane', async () => {
    const triage = { schemaVersion: 1, summary: 'x'.repeat(900), changeType: 'other', risk: { level: 'low', reason: 'Small.' },
      areas: [{ name: 'Core', paths: ['a.ts'], summary: 'Fixes a bug.', details: [], extra: true }], risks: [], apiChanges: [],
      tests: { summary: 'Covered.', gaps: [] } };
    files.readOutput = jest.fn().mockImplementation(async (_root: string, name: string) => name === 'triage.json'
      ? JSON.stringify(triage) : JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] }));
    expect(await runner.run(request)).toMatchObject({ status: 'completed' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('removes a partial walkthrough when triage is aborted after spawn', async () => {
    gateway.spawn = async () => { now = 1000; return ended; };
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'deadline' });
    expect(files.clearOutput).toHaveBeenLastCalledWith('/attempt', true);
  });

  it('runs when capacity is unknown and records the missing check', async () => {
    gateway.list = async () => ({ lanes: [{ id: 'lane', label: 'lane', family: 'family-a', limitState: 'unknown' }], maxConcurrentAgents: 4 });
    const spawn = jest.spyOn(gateway, 'spawn');
    expect(await runner.run(request)).toMatchObject({ status: 'completed', limitCheck: 'unavailable' });
    expect(spawn).toHaveBeenCalled();
  });

  it('stores a sanitized lane failure reason', async () => {
    const secret = 'ghp_123456789012345678901234567890';
    gateway.spawn = async () => { throw new Error(`codex exit 1; ${secret}`); };
    const result = await runner.run(request);
    expect(result).toMatchObject({ status: 'partial', reason: expect.stringContaining('codex exit 1') });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects a lane that changed the exact-SHA source', async () => {
    files.prepare = jest.fn().mockResolvedValue('before');
    const checksum = jest.fn().mockResolvedValue('after');
    files.sourceChecksum = checksum;
    expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'source-mutated', lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] }, run: unknownRun });
    expect(checksum).toHaveBeenCalledTimes(1);
  });

  it('does not start after the deadline', async () => {
    now = 1000;
    const spawn = jest.spyOn(gateway, 'spawn');
    expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'deadline' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('marks a lane that finishes after its deadline partial', async () => {
    gateway.spawn = async () => {
      now = 1000;
      return ended;
    };
    expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'deadline', lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] }, run: unknownRun });
    expect(files.sourceChecksum).toHaveBeenCalledTimes(1);
  });

  it('reports deadline when the after-spawn snapshot aborts', async () => {
    gateway.spawn = async () => { now = 1000; return ended; };
    files.sourceChecksum = jest.fn().mockRejectedValue(new Error('Review snapshot aborted'));
    expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'deadline', lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] }, run: unknownRun });
  });

  it('reports caller abort when the after-spawn snapshot aborts', async () => {
    const caller = new AbortController();
    gateway.spawn = async () => { caller.abort(); return ended; };
    files.sourceChecksum = jest.fn().mockRejectedValue(new Error('Review snapshot aborted'));
    expect(await runner.run({ ...request, signal: caller.signal })).toEqual({ status: 'partial', reason: 'aborted', lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] }, run: unknownRun });
  });

  it('allows the verifier the same 480 second lane window as lenses', async () => {
    const setTimer = jest.spyOn(clock, 'setTimeout');
    files.readOutput = jest.fn().mockResolvedValue(verdict);
    expect(await runner.run({ ...request, kind: 'verifier', runDeadlineMs: 600_000 })).toMatchObject({ status: 'completed' });
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 480_000);
  });

  it('allows triage a 480 second lane window', async () => {
    const setTimer = jest.spyOn(clock, 'setTimeout');
    expect(await runner.run({ ...request, runDeadlineMs: 600_000 })).toMatchObject({ status: 'completed' });
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 480_000);
  });

  it('sends the chosen pool model on spawn and records the lane use on a completed result (Req 2.5)', async () => {
    laneSettings = { pool: [{ lane: 'lane', model: 'model-x' }], pins: {} };
    request = { ...baseRequest, attempt: attemptFor() };
    const spawn = jest.spyOn(gateway, 'spawn');
    const result = await runner.run(request);
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ laneId: 'lane', model: 'model-x' }));
    expect(result).toMatchObject({ status: 'completed', family: 'family-a',
      lane: { lane: 'lane', model: 'model-x', family: 'family-a', fallback: [] } });
  });

  it('sends no model key when the lane default applies (Req 2.1)', async () => {
    const spawn = jest.spyOn(gateway, 'spawn');
    expect(await runner.run(request)).toMatchObject({ lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] } });
    expect(spawn.mock.calls[0][0]).not.toHaveProperty('model');
  });

  it('records the lane use on a partial result after a started lane fails', async () => {
    gateway.spawn = async () => { throw new Error('status-failed: quota'); };
    expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'status-failed: quota',
      lane: { lane: 'lane', family: 'family-a' } });
  });

  it('ends no-confirmed-room with the skipped pool entries when no pool entry is available (Req 4.4, 4.5)', async () => {
    laneSettings = { pool: [{ lane: 'missing', model: null }], pins: {} };
    request = { ...baseRequest, attempt: attemptFor() };
    const spawn = jest.spyOn(gateway, 'spawn');
    expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'no-confirmed-room',
      lane: { lane: null, model: null, family: null,
        fallback: [{ source: 'pool', lane: 'missing', model: null, reason: 'lane-not-listed' }] } });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('ends partial without guessing when the lane settings cannot be read, and logs it once per attempt', async () => {
    laneSettings = new Error('storage unavailable');
    request = { ...baseRequest, attempt: attemptFor() };
    const spawn = jest.spyOn(gateway, 'spawn');
    const list = jest.spyOn(gateway, 'list');
    expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'lane-settings-unavailable' });
    expect(await runner.run({ ...request, kind: 'correctness-lifecycle' })).toEqual({ status: 'partial', reason: 'lane-settings-unavailable' });
    expect(spawn).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('lane settings could not be read') }));
  });

  it('throws a lane list failure as before', async () => {
    gateway.list = async () => { throw new Error('detection failed'); };
    await expect(runner.run(request)).rejects.toThrow('detection failed');
  });

  it('passes verifier author counts to selection and reports no runner-level evidence strength (A10)', async () => {
    gateway.list = async () => ({ lanes: [
      { id: 'a', label: 'a', family: 'family-a', limitState: 'confirmed-room' },
      { id: 'b', label: 'b', family: 'family-b', limitState: 'confirmed-room' },
    ], maxConcurrentAgents: 4 });
    files.readOutput = jest.fn().mockResolvedValue(verdict);
    const result = await runner.run({ ...request, kind: 'verifier', authorFamilyCounts: { 'family-a': 2 } });
    expect(result).toMatchObject({ status: 'completed', family: 'family-b', lane: { lane: 'b' } });
    expect(result).not.toHaveProperty('evidenceStrength');
  });

  it('prefers a family outside the used lens families (Req 2.2)', async () => {
    gateway.list = async () => ({ lanes: [
      { id: 'a', label: 'a', family: 'family-a', limitState: 'confirmed-room' },
      { id: 'b', label: 'b', family: 'family-b', limitState: 'confirmed-room' },
    ], maxConcurrentAgents: 4 });
    expect(await runner.run({ ...request, kind: 'contracts-callers', usedFamilies: ['family-a'] }))
      .toMatchObject({ status: 'completed', family: 'family-b' });
  });

  describe('lane run usage', () => {
    it('(a) carries the resolved usage on a completed result', async () => {
      gateway.spawn = async () => ({ usage: { ...counted, partial: false } });
      expect(await runner.run(request)).toMatchObject({ status: 'completed', run: { ...counted, partial: false } });
    });

    it('(b) keeps unread counters null, never 0 (Req 1.3)', async () => {
      gateway.spawn = async () => ({ usage: { ...UNKNOWN_LANE_RUN_USAGE(false), inputTokens: 10 } });
      expect((await runner.run(request)).run).toEqual({ ...counted, partial: false });
    });

    it('(c) keeps the usage of a started lane that failed (Req 1.6)', async () => {
      gateway.spawn = async () => { throw new ReviewLaneSpawnError(new Error('status-failed: quota'), true, { ...counted, partial: true }); };
      const result = await runner.run(request);
      expect(result).toMatchObject({ status: 'partial', reason: 'status-failed: quota', lane: { lane: 'lane' } });
      expect(result.run).toMatchObject({ inputTokens: 10, partial: true });
    });

    it('records an unknown partial run when a started lane failed without usage', async () => {
      gateway.spawn = async () => { throw new ReviewLaneSpawnError(new Error('timeout'), true, null); };
      expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'timeout', run: UNKNOWN_LANE_RUN_USAGE(true) });
    });

    it('(d) records no run for a lane that never started (Req 1.5)', async () => {
      gateway.spawn = async () => { throw new ReviewLaneSpawnError(new Error('Review lane unavailable'), false, null); };
      const result = await runner.run(request);
      expect(result.status).toBe('partial');
      expect(result).not.toHaveProperty('run');
    });

    it('(e) records no run and keeps the reason for a plain error (Req 1.4, F1)', async () => {
      gateway.spawn = async () => { throw new Error('status-failed: quota'); };
      expect(await runner.run(request)).toEqual({ status: 'partial', reason: 'status-failed: quota',
        lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] } });
    });

    it('(e2) keeps the reason of a wrapped error byte-identical, name included (F2)', async () => {
      const bare = new TypeError('boom');
      gateway.spawn = async () => { throw bare; };
      const plain = await runner.run(request);
      gateway.spawn = async () => { throw ReviewLaneSpawnError.from(bare, true, null); };
      const wrapped = await runner.run(request);
      expect(plain).toMatchObject({ status: 'partial', reason: 'lane-failed: lane; TypeError; boom' });
      expect(wrapped).toMatchObject({ status: 'partial', reason: 'lane-failed: lane; TypeError; boom', run: UNKNOWN_LANE_RUN_USAGE(true) });
    });

    it('(f) carries partial usage when the caller aborts mid-spawn (Req 1.2)', async () => {
      const caller = new AbortController();
      gateway.spawn = async () => {
        caller.abort();
        throw new ReviewLaneSpawnError(new Error('cancelled'), true, { ...counted, partial: true });
      };
      expect(await runner.run({ ...request, signal: caller.signal })).toEqual({ status: 'partial', reason: 'aborted',
        lane: { lane: 'lane', model: null, family: 'family-a', fallback: [] }, run: { ...counted, partial: true } });
    });

    it('carries the run when the lane mutated the source', async () => {
      gateway.spawn = async () => ({ usage: { ...counted, partial: false } });
      files.sourceChecksum = jest.fn().mockResolvedValue('after');
      expect(await runner.run(request)).toMatchObject({ status: 'partial', reason: 'source-mutated', run: { ...counted, partial: false } });
    });

    it('(g) records an unknown, not partial run when an old gateway resolves undefined', async () => {
      // An old fake that resolves void; only a cast can model it against the current port.
      gateway.spawn = (async () => undefined) as unknown as IReviewLaneGateway['spawn'];
      expect(await runner.run(request)).toMatchObject({ status: 'completed', run: UNKNOWN_LANE_RUN_USAGE(false) });
    });

    it('records an unknown run when the resolved usage is invalid', async () => {
      gateway.spawn = async () => ({ usage: { ...counted, inputTokens: -1, partial: false } });
      expect((await runner.run(request)).run).toEqual(UNKNOWN_LANE_RUN_USAGE(false));
    });

    it('passes the repository to the gateway', async () => {
      const spawn = jest.spyOn(gateway, 'spawn');
      await runner.run(request);
      expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ repo }));
    });

    it('records no run when the role stops before spawn', async () => {
      now = 1000;
      expect(await runner.run(request)).not.toHaveProperty('run');
    });
  });
});
