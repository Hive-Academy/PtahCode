// Pass-through mock: every mutating `node:fs/promises` call is a spy, so the
// spec can prove the step never writes, renames, removes or creates anything
// (AC 4.1). Fixtures are built with the synchronous `node:fs` API instead.
jest.mock('node:fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    writeFile: jest.fn(actual.writeFile),
    appendFile: jest.fn(actual.appendFile),
    rename: jest.fn(actual.rename),
    rm: jest.fn(actual.rm),
    rmdir: jest.fn(actual.rmdir),
    unlink: jest.fn(actual.unlink),
    mkdir: jest.fn(actual.mkdir),
    mkdtemp: jest.fn(actual.mkdtemp),
    copyFile: jest.fn(actual.copyFile),
    cp: jest.fn(actual.cp),
    symlink: jest.fn(actual.symlink),
    link: jest.fn(actual.link),
    truncate: jest.fn(actual.truncate),
    readdir: jest.fn(actual.readdir),
  };
});

import * as fsSync from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  TaskEndDisposeOutcome,
  TaskEndRunRecord,
  TaskEndStepKind,
  TaskEndStepOutcome,
  TaskEndStepRecord,
  TaskStatus,
} from '@ptah-extension/shared';
import type { TaskEndHookSettings } from '../config/task-end-hook-config';
import type {
  ITaskEndStore,
  TaskEndExpandableStep,
} from '../persistence/task-end-store.interface';
import type { ActivityPort } from '../ports/activity.port';
import type {
  GitReadResult,
  GitReadRunner,
  GitReadRunOptions,
} from '../ports/git-read-runner.port';
import type { PrStatusPort, TaskEndPrStatus } from '../ports/pr-status.port';
import { assertReadOnlyGitVector } from '../ports/read-only-git';
import type { SessionLinkPort } from '../ports/session-link.port';
import { DisposeEvaluateStep } from './dispose-evaluate.step';

const MUTATING_FS = [
  'writeFile',
  'appendFile',
  'rename',
  'rm',
  'rmdir',
  'unlink',
  'mkdir',
  'mkdtemp',
  'copyFile',
  'cp',
  'symlink',
  'link',
  'truncate',
] as const;

const TASK = 'TASK_2026_001_abcd';
const OTHER_TASK = 'TASK_2026_002_beef';
const SHA = 'a'.repeat(40);

// ---------------------------------------------------------------------------
// In-memory store: the step-facing subset of ITaskEndStore (Decision D3)
// ---------------------------------------------------------------------------

type MutableEntry = {
  step: TaskEndStepKind;
  subject: string;
  outcome: TaskEndStepOutcome | { readonly state: 'pending' | 'running' };
  attempts: number;
};

class InMemoryStepStore implements Pick<
  ITaskEndStore,
  'getRun' | 'markStepRunning' | 'upsertStep' | 'expandStep'
> {
  readonly entries: MutableEntry[];
  readonly calls: string[] = [];

  constructor(private readonly base: TaskEndRunRecord) {
    this.entries = base.steps.map((s) => ({
      step: s.step,
      subject: s.subject,
      outcome: s.outcome,
      attempts: s.attempts,
    }));
  }

  getRun(runId: string): TaskEndRunRecord | null {
    if (runId !== this.base.runId) return null;
    return { ...this.base, steps: this.entries.map(toRecord) };
  }

  markStepRunning(
    runId: string,
    step: TaskEndStepKind,
    subject: string,
  ): number {
    this.calls.push(`running:${step}:${subject}`);
    const entry = this.find(runId, step, subject);
    entry.outcome = { state: 'running' };
    entry.attempts += 1;
    return entry.attempts;
  }

  upsertStep<K extends TaskEndStepKind>(
    runId: string,
    step: K,
    subject: string,
    outcome: Extract<TaskEndStepOutcome, { readonly step: K }>,
  ): void {
    this.calls.push(`upsert:${step}:${subject}`);
    this.find(runId, step, subject).outcome = outcome;
  }

  expandStep(
    runId: string,
    step: TaskEndExpandableStep,
    subjects: readonly string[],
  ): void {
    this.calls.push(`expand:${step}:${subjects.length}`);
    if (runId !== this.base.runId || subjects.length === 0) return;
    const at = this.entries.findIndex(
      (e) => e.step === step && e.subject === '',
    );
    if (at === -1) return;
    const rows = [...new Set(subjects)].map((subject): MutableEntry => ({
      step,
      subject,
      outcome: { state: 'pending' },
      attempts: 0,
    }));
    this.entries.splice(at, 1, ...rows);
  }

  dispose(): Array<{ subject: string; outcome: MutableEntry['outcome'] }> {
    return this.entries
      .filter((e) => e.step === 'dispose')
      .map((e) => ({ subject: e.subject, outcome: e.outcome }));
  }

  private find(
    runId: string,
    step: TaskEndStepKind,
    subject: string,
  ): MutableEntry {
    const entry = this.entries.find(
      (e) => e.step === step && e.subject === subject,
    );
    if (runId !== this.base.runId || entry === undefined) {
      throw new Error(`no step entry ${step}/${subject}`);
    }
    return entry;
  }
}

function toRecord(entry: MutableEntry): TaskEndStepRecord {
  return {
    step: entry.step,
    subject: entry.subject,
    outcome:
      entry.outcome.state === 'running' ? { state: 'pending' } : entry.outcome,
    message: '',
    updatedAt: 0,
    attempts: entry.attempts,
  } as TaskEndStepRecord;
}

// ---------------------------------------------------------------------------
// Fixture repository on disk (read by the collector; never written by it)
// ---------------------------------------------------------------------------

let tmp: string;
let main: string;
let agentDir: string;

function writeCarrier(root: string, taskId: string, status: TaskStatus): void {
  const dir = path.join(root, '.ptah', 'specs', taskId);
  fsSync.mkdirSync(dir, { recursive: true });
  fsSync.writeFileSync(
    path.join(dir, 'task.md'),
    `---\nid: ${taskId}\nstatus: ${status}\ntitle: Fixture ${taskId}\n---\n\nBody.\n`,
  );
}

function writeContext(root: string, taskId: string, worktree: string): void {
  const dir = path.join(root, '.ptah', 'specs', taskId);
  fsSync.mkdirSync(dir, { recursive: true });
  fsSync.writeFileSync(
    path.join(dir, 'context.md'),
    `# Context\n\n## Worktree\n\n\`${worktree}\`, branch \`feat/x\`.\n`,
  );
}

function makeWorktree(name: string): string {
  const dir = path.join(agentDir, name);
  fsSync.mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  tmp = fsSync.realpathSync(
    fsSync.mkdtempSync(path.join(os.tmpdir(), 'teh-dispose-')),
  );
  main = path.join(tmp, 'main');
  agentDir = path.join(main, '.claude-worktrees');
  fsSync.mkdirSync(agentDir, { recursive: true });
  writeCarrier(main, TASK, 'done');
  jest.clearAllMocks();
});

afterEach(() => {
  fsSync.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fake host ports
// ---------------------------------------------------------------------------

interface ListedWorktree {
  readonly path: string;
  readonly branch: string | null;
  readonly locked?: boolean;
}

interface GitScript {
  readonly worktrees: readonly ListedWorktree[];
  /** Raw `git status -z` output per worktree real path; default clean. */
  readonly status?: Readonly<Record<string, string>>;
  /** `git merge-base --is-ancestor` exit code; default 0 (merged). */
  readonly ancestorExit?: number;
}

function worktreeListOutput(worktrees: readonly ListedWorktree[]): string {
  const blocks = [
    { path: main, branch: 'main' as string | null },
    ...worktrees,
  ].map((wt) => {
    const lines = [`worktree ${wt.path}`, `HEAD ${SHA}`];
    lines.push(
      wt.branch === null ? 'detached' : `branch refs/heads/${wt.branch}`,
    );
    if ('locked' in wt && wt.locked) lines.push('locked');
    return lines.map((line) => `${line}\0`).join('');
  });
  return blocks.map((block) => `${block}\0`).join('');
}

function gitRunner(script: GitScript): jest.Mock {
  return jest.fn(
    async (
      args: readonly string[],
      cwd: string,
      _options: GitReadRunOptions,
    ): Promise<GitReadResult> => {
      const ok = (stdout: string): GitReadResult => ({
        stdout,
        stderr: '',
        exitCode: 0,
      });
      if (args[0] === 'worktree')
        return ok(worktreeListOutput(script.worktrees));
      if (args[0] === 'status') return ok(script.status?.[cwd] ?? '');
      // Row 4 (`origin/main` exists) and row 5 (full branch sha).
      if (args[0] === 'rev-parse') return ok(`${SHA}\n`);
      if (args[0] === 'merge-base') {
        return { stdout: '', stderr: '', exitCode: script.ancestorExit ?? 0 };
      }
      throw new Error(`unexpected git call ${args.join(' ')}`);
    },
  );
}

/** Task ids bounded by non-alphanumerics in the folder or branch name. */
function namedTaskIds(
  worktreePath: string | null,
  branch: string | null,
): string[] {
  const ids = new Set<string>();
  for (const name of [
    worktreePath === null ? '' : path.basename(worktreePath),
    branch ?? '',
  ]) {
    for (const match of name.matchAll(
      /(?<![A-Za-z0-9])(TASK_\d{4}_\d{3,}(?:_[0-9a-f]{4})?)(?![A-Za-z0-9])/g,
    )) {
      ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

function settings(
  overrides: Partial<TaskEndHookSettings> = {},
): TaskEndHookSettings {
  return {
    enabled: true,
    disposalMode: 'off',
    settleWindowMs: 60_000,
    queueCap: 50,
    censusCooldownMs: 0,
    maxWorktreesPerRun: 8,
    archive: { maxBytes: 268_435_456, maxFiles: 5000 },
    memory: {
      enabled: true,
      sessionEndEnabled: true,
      bootScanIdleBackoffMs: 0,
    },
    ...overrides,
  };
}

function makeRun(
  overrides: Partial<Pick<TaskEndRunRecord, 'mainRoot' | 'seenRoot'>> = {},
): TaskEndRunRecord {
  const step = (s: TaskEndStepKind): TaskEndStepRecord =>
    ({
      step: s,
      subject: '',
      outcome:
        s === 'harvest'
          ? { step: 'harvest', state: 'succeeded', reason: 'harvested' }
          : { state: 'pending' },
      message: '',
      updatedAt: 1,
      attempts: 0,
    }) as TaskEndStepRecord;
  return {
    runId: 'run-1',
    repoId: 'repo-1',
    taskId: TASK,
    episode: 1,
    source: 'write',
    fromStatus: 'in_progress',
    toStatus: 'done',
    seenRoot: main,
    mainRoot: main,
    createdAt: 1,
    settleUntil: 2,
    startedAt: 3,
    endedAt: null,
    updatedAt: 3,
    state: 'running',
    reason: null,
    ...overrides,
    steps: (['close-curate', 'harvest', 'dispose', 'index'] as const).map(step),
  };
}

interface Harness {
  readonly step: DisposeEvaluateStep;
  readonly store: InMemoryStepStore;
  readonly git: jest.Mock;
  readonly pr: jest.Mock;
  readonly linked: jest.Mock;
}

function harness(
  options: {
    run?: TaskEndRunRecord;
    script?: GitScript;
    sessions?: Readonly<Record<string, readonly string[]>>;
    sessionWorktrees?: Readonly<Record<string, string>>;
    linkedThrows?: boolean;
    registered?: readonly string[];
    settings?: TaskEndHookSettings;
    pr?: TaskEndPrStatus;
  } = {},
): Harness {
  const run = options.run ?? makeRun();
  const store = new InMemoryStepStore(run);
  const git = gitRunner(options.script ?? { worktrees: [] });
  const runner: GitReadRunner = { run: git };
  const pr = jest.fn(async () => options.pr ?? ({ kind: 'none' } as const));
  const prStatus: PrStatusPort = { openPrStatus: pr };
  const linked = jest.fn((taskId: string) => {
    if (options.linkedThrows) throw new Error('organization store closed');
    return options.sessions?.[taskId] ?? [];
  });
  const links: SessionLinkPort = {
    linkedSessions: linked,
    worktreePathForSession: (sessionId: string) =>
      options.sessionWorktrees?.[sessionId] ?? null,
    taskIdsInWorktreeName: namedTaskIds,
  };
  const activity: ActivityPort = {
    isSessionLive: () => ({ kind: 'ok', value: false }),
    liveSessionRoots: () => ({ kind: 'ok', value: [] }),
    trackedLaneDirs: () => ({ kind: 'ok', value: [] }),
    registeredWorkspaceRoots: () => ({
      kind: 'ok',
      value: options.registered ?? [main],
    }),
    foregroundActive: () => ({ kind: 'ok', value: false }),
  };
  const snapshot = options.settings ?? settings();
  const step = new DisposeEvaluateStep(
    store as unknown as ITaskEndStore,
    links,
    activity,
    prStatus,
    runner,
    { read: () => snapshot },
    { debug: jest.fn() },
  );
  return { step, store, git, pr, linked };
}

const signal = (): AbortSignal => new AbortController().signal;

function reasonOf(
  outcome: { state: string; reason?: string } | undefined,
): string {
  return outcome === undefined
    ? 'missing'
    : `${outcome.state}/${outcome.reason ?? ''}`;
}

/** Every git vector passed the allow-list and no mutating fs call was made. */
function expectReadOnly(h: Harness): void {
  for (const [args] of h.git.mock.calls as [readonly string[]][]) {
    expect(() => assertReadOnlyGitVector(args)).not.toThrow();
    expect(['worktree', 'status', 'rev-parse', 'merge-base']).toContain(
      args[0],
    );
    expect(args).not.toContain('fetch');
    expect(args).not.toContain('remove');
    expect(args).not.toContain('prune');
  }
  for (const name of MUTATING_FS) {
    expect(
      (fsp as unknown as Record<string, jest.Mock>)[name],
    ).not.toHaveBeenCalled();
  }
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('DisposeEvaluateStep', () => {
  it('records one outcome per worktree, replacing the placeholder (AC 4.4, 4.1)', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const b = makeWorktree(`b-${TASK}`);
    const h = harness({
      script: {
        worktrees: [
          { path: a, branch: `feat/${TASK}-a` },
          { path: b, branch: `feat/${TASK}-b` },
        ],
        // b has one modified tracked file.
        status: { [b]: ' M src/index.ts\0' },
      },
    });

    const recorded = await h.step.run(makeRun(), signal());

    expect(h.store.calls).toContain('expand:dispose:2');
    const rows = h.store.dispose();
    expect(rows.map((r) => r.subject)).toEqual([a, b]);
    expect(reasonOf(rows[0].outcome as TaskEndDisposeOutcome)).toBe(
      'skipped/eligible-report-only',
    );
    expect(reasonOf(rows[1].outcome as TaskEndDisposeOutcome)).toBe(
      'blocked/dirty-tracked',
    );
    expect(recorded).toHaveLength(2);
    expect(recorded[0].outcome).toMatchObject({
      requestedMode: 'off',
      effectiveMode: 'off',
      modeReason: 'none',
      activityScope: 'in-process',
    });
    expectReadOnly(h);
  });

  it('keeps the placeholder as no-linked-worktree when nothing links the task', async () => {
    makeWorktree('unrelated');
    const h = harness({
      script: {
        worktrees: [
          { path: path.join(agentDir, 'unrelated'), branch: 'feat/x' },
        ],
      },
    });

    await h.step.run(makeRun(), signal());

    expect(h.store.dispose()).toEqual([
      {
        subject: '',
        outcome: expect.objectContaining({
          state: 'blocked',
          reason: 'no-linked-worktree',
        }),
      },
    ]);
    expect(h.pr).not.toHaveBeenCalled();
    expectReadOnly(h);
  });

  it('blocks a worktree whose name also names another non-terminal task', async () => {
    writeCarrier(main, OTHER_TASK, 'in_progress');
    const shared = makeWorktree(`${TASK}-${OTHER_TASK}`);
    const h = harness({
      script: { worktrees: [{ path: shared, branch: 'feat/shared' }] },
    });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/linked-to-other-task');
    expect(h.pr).not.toHaveBeenCalled();
    expectReadOnly(h);
  });

  it('blocks a worktree another non-terminal task claims in its context.md', async () => {
    const a = makeWorktree(`a-${TASK}`);
    writeCarrier(main, OTHER_TASK, 'blocked');
    writeContext(main, OTHER_TASK, a);
    const h = harness({
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
    });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/linked-to-other-task');
  });

  it('ignores a claim by another task that has ended', async () => {
    const a = makeWorktree(`a-${TASK}`);
    writeCarrier(main, OTHER_TASK, 'done');
    writeContext(main, OTHER_TASK, a);
    const h = harness({
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
    });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('skipped/eligible-report-only');
  });

  it('does not query gh after an earlier failure, and queries it from the main root otherwise', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const notMerged = harness({
      script: {
        worktrees: [{ path: a, branch: `feat/${TASK}` }],
        ancestorExit: 1,
      },
    });

    await notMerged.step.run(makeRun(), signal());

    expect(
      reasonOf(notMerged.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/not-merged');
    expect(notMerged.pr).not.toHaveBeenCalled();

    const merged = harness({
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
      pr: { kind: 'open' },
    });
    await merged.step.run(makeRun(), signal());
    expect(merged.pr).toHaveBeenCalledTimes(1);
    expect(merged.pr).toHaveBeenCalledWith(main, `feat/${TASK}`);
    expect(
      reasonOf(merged.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/open-pr');
  });

  it('records precondition-unverifiable with no git call when the main root is unresolved', async () => {
    makeWorktree(`a-${TASK}`);
    const h = harness({ run: makeRun({ mainRoot: null }) });

    await h.step.run(makeRun({ mainRoot: null }), signal());

    expect(h.git).not.toHaveBeenCalled();
    expect(h.linked).not.toHaveBeenCalled();
    expect(h.store.calls.some((c) => c.startsWith('expand:'))).toBe(false);
    expect(h.store.dispose()).toEqual([
      {
        subject: '',
        outcome: expect.objectContaining({
          state: 'blocked',
          reason: 'precondition-unverifiable',
        }),
      },
    ]);
    expectReadOnly(h);
  });

  it('runs every main-worktree probe at run.mainRoot for a run seen from an unregistered main checkout', async () => {
    const a = makeWorktree(`a-${TASK}`);
    // The carrier was seen in the linked worktree, the only open workspace.
    writeCarrier(a, TASK, 'done');
    const run = makeRun({ seenRoot: a });
    const h = harness({
      run,
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
      registered: [path.join(tmp, 'elsewhere')],
    });

    await h.step.run(run, signal());

    const calls = h.git.mock.calls as [readonly string[], string][];
    const mainProbes = calls.filter(([args]) => args[0] !== 'status');
    expect(mainProbes.map(([args]) => args[0]).sort()).toEqual([
      'merge-base',
      'rev-parse',
      'rev-parse',
      'worktree',
    ]);
    for (const [, cwd] of mainProbes) expect(cwd).toBe(main);
    const statusCalls = calls.filter(([args]) => args[0] === 'status');
    expect(statusCalls.map(([, cwd]) => cwd)).toEqual([a]);
    expect(h.pr).toHaveBeenCalledWith(main, `feat/${TASK}`);
    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('skipped/eligible-report-only');
    expectReadOnly(h);
  });

  it('blocks in-use when a registered workspace is the worktree', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const h = harness({
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
      registered: [main, a],
    });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/in-use');
  });

  it('discovers a worktree through a linked session row and through the context line', async () => {
    const bySession = makeWorktree('by-session');
    const byContext = makeWorktree('by-context');
    writeContext(main, TASK, byContext);
    const h = harness({
      script: {
        worktrees: [
          { path: bySession, branch: 'feat/one' },
          { path: byContext, branch: 'feat/two' },
        ],
      },
      sessions: { [TASK]: ['s1'] },
      sessionWorktrees: { s1: bySession },
    });

    await h.step.run(makeRun(), signal());

    expect(h.store.dispose().map((r) => r.subject)).toEqual([
      bySession,
      byContext,
    ]);
    for (const row of h.store.dispose()) {
      expect(reasonOf(row.outcome as TaskEndDisposeOutcome)).toBe(
        'skipped/eligible-report-only',
      );
    }
  });

  it('records precondition-unverifiable when session links are unavailable and nothing else links', async () => {
    const h = harness({ script: { worktrees: [] }, linkedThrows: true });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/precondition-unverifiable');
  });

  it('records candidates beyond maxWorktreesPerRun as unverifiable without probing them', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const b = makeWorktree(`b-${TASK}`);
    const h = harness({
      script: {
        worktrees: [
          { path: a, branch: `feat/${TASK}-a` },
          { path: b, branch: `feat/${TASK}-b` },
        ],
      },
      settings: settings({ maxWorktreesPerRun: 1 }),
    });

    await h.step.run(makeRun(), signal());

    const rows = h.store.dispose();
    expect(reasonOf(rows[0].outcome as TaskEndDisposeOutcome)).toBe(
      'skipped/eligible-report-only',
    );
    expect(reasonOf(rows[1].outcome as TaskEndDisposeOutcome)).toBe(
      'blocked/precondition-unverifiable',
    );
    const statusCwds = (h.git.mock.calls as [readonly string[], string][])
      .filter(([args]) => args[0] === 'status')
      .map(([, cwd]) => cwd);
    expect(statusCwds).toEqual([a]);
  });

  it('walks only non-allow-listed ignored directories, counts symlinks with lstat, and stops at the cap', async () => {
    const a = makeWorktree(`a-${TASK}`);
    fsSync.mkdirSync(path.join(a, 'out'));
    fsSync.writeFileSync(path.join(a, 'out', 'one.log'), 'x');
    fsSync.writeFileSync(path.join(a, 'out', 'two.log'), 'y');
    // A symlink to a large tree counts as one entry and is never followed.
    fsSync.symlinkSync(tmp, path.join(a, 'out', 'loop'));
    fsSync.mkdirSync(path.join(a, 'node_modules', 'pkg'), { recursive: true });
    const script: GitScript = {
      worktrees: [{ path: a, branch: `feat/${TASK}` }],
      status: { [a]: '!! node_modules/\0!! out/\0' },
    };

    const fits = harness({
      script,
      settings: settings({ archive: { maxBytes: 1 << 20, maxFiles: 3 } }),
    });
    await fits.step.run(makeRun(), signal());
    expect(
      reasonOf(fits.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('skipped/eligible-report-only');
    const readdirTargets = (fsp.readdir as unknown as jest.Mock).mock.calls.map(
      ([dir]) => String(dir),
    );
    expect(readdirTargets).toContain(path.join(a, 'out'));
    expect(readdirTargets.some((dir) => dir.includes('node_modules'))).toBe(
      false,
    );
    expect(
      readdirTargets.some((dir) => dir.startsWith(path.join(a, 'out', 'loop'))),
    ).toBe(false);

    const tooMany = harness({
      script,
      settings: settings({ archive: { maxBytes: 1 << 20, maxFiles: 2 } }),
    });
    await tooMany.step.run(makeRun(), signal());
    expect(
      reasonOf(tooMany.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/archive-too-large');
    expectReadOnly(tooMany);
  });

  it('records precondition-unverifiable when an ignored entry vanished after git status (L3)', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const h = harness({
      script: {
        worktrees: [{ path: a, branch: `feat/${TASK}` }],
        // Neither entry exists any more when the archive census runs.
        status: { [a]: '!! gone.log\0!! gone-dir/\0' },
      },
    });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/precondition-unverifiable');
    expectReadOnly(h);
  });

  it('skips P7 for a listed worktree whose directory is missing', async () => {
    const gone = path.join(agentDir, `gone-${TASK}`);
    const h = harness({
      script: { worktrees: [{ path: gone, branch: `feat/${TASK}` }] },
    });

    await h.step.run(makeRun(), signal());

    expect(
      (h.git.mock.calls as [readonly string[], string][]).some(
        ([args]) => args[0] === 'status',
      ),
    ).toBe(false);
    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('skipped/eligible-report-only');
  });

  it('records merge-unverified for a detached HEAD without asking gh', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const h = harness({ script: { worktrees: [{ path: a, branch: null }] } });

    await h.step.run(makeRun(), signal());

    expect(
      reasonOf(h.store.dispose()[0].outcome as TaskEndDisposeOutcome),
    ).toBe('blocked/merge-unverified');
    expect(h.pr).not.toHaveBeenCalled();
  });

  it('records the requested mode as unavailable for confirm', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const h = harness({
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
      settings: settings({ disposalMode: 'confirm' }),
    });

    const [first] = await h.step.run(makeRun(), signal());

    expect(first.outcome).toMatchObject({
      requestedMode: 'confirm',
      effectiveMode: 'off',
      modeReason: 'confirm-unavailable',
    });
  });

  it('leaves entries pending when the signal is already aborted', async () => {
    const a = makeWorktree(`a-${TASK}`);
    const controller = new AbortController();
    controller.abort();
    const h = harness({
      script: { worktrees: [{ path: a, branch: `feat/${TASK}` }] },
    });

    const recorded = await h.step.run(makeRun(), controller.signal);

    expect(recorded).toEqual([]);
    expect(h.store.calls.some((c) => c.startsWith('upsert:'))).toBe(false);
  });

  it('does nothing for a placeholder that already recorded an outcome', async () => {
    const run = makeRun();
    const done: TaskEndRunRecord = {
      ...run,
      steps: run.steps.map((s) =>
        s.step === 'dispose'
          ? ({
              ...s,
              outcome: {
                step: 'dispose',
                state: 'blocked',
                reason: 'no-linked-worktree',
                requestedMode: 'off',
                effectiveMode: 'off',
                modeReason: 'none',
                activityScope: 'in-process',
              },
            } as TaskEndStepRecord)
          : s,
      ),
    };
    const h = harness({ run: done });

    expect(await h.step.run(done, signal())).toEqual([]);
    expect(h.git).not.toHaveBeenCalled();
    expect(h.store.calls).toEqual([]);
  });
});
