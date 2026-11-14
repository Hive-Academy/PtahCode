import 'reflect-metadata';
import { join, sep } from 'node:path';
import { normalizeWorkspaceRoot } from '@ptah-extension/platform-core';
import { MIGRATIONS } from '@ptah-extension/persistence-sqlite';
import { ROLE_PHASE_ALIASES } from '@ptah-extension/shared';
import { resolveOpener, type TestDatabase } from './queue/queue-db.test-support';
import { groupGradeAttributions, SkillTaskGradeStore, type SkillTaskGrade } from './skill-task-grade.store';

const TESTS_ROLE =
  Object.entries(ROLE_PHASE_ALIASES).find(([, kind]) => kind === 'tests')?.[0] ??
  'missing-tests-role';

const opener = resolveOpener();
const maybe = opener ? describe : describe.skip;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function setup(): { db: TestDatabase; store: SkillTaskGradeStore } {
  if (!opener) throw new Error('SQLite unavailable');
  const db = opener(':memory:');
  const sql = MIGRATIONS.find((migration) => migration.version === 56)?.sql;
  const schema = sql?.match(/CREATE TABLE skill_task_grades \([\s\S]*?CREATE INDEX idx_skill_task_grades_run ON skill_task_grades\(run_id\);/)?.[0];
  if (!schema) throw new Error('Migration 0056 grade schema unavailable');
  db.exec(schema);
  // Migration 0075 grade keys (the lane table is created by setupAttributionTables).
  db.exec(`ALTER TABLE skill_task_grades ADD COLUMN phase_kind TEXT;
    ALTER TABLE skill_task_grades ADD COLUMN executor_kind TEXT;`);
  return { db, store: new SkillTaskGradeStore(logger as never, { db, isOpen: true } as never) };
}

function setupAttributionTables(db: TestDatabase): void {
  db.exec(`CREATE TABLE skill_invocation_events (
    id TEXT, source TEXT, skill_slug TEXT, run_id TEXT, session_id TEXT,
    workspace_root TEXT, task_id TEXT
  );
  CREATE TABLE skill_registry (slug TEXT, kind TEXT);
  CREATE TABLE session_task_links (workspace_root TEXT, session_id TEXT, task_id TEXT);
  CREATE TABLE lane_outcome_records (
    run_id TEXT, subagent_session_id TEXT, parent_session_id TEXT, final_review TEXT, task_id TEXT,
    workspace_root TEXT, role TEXT, executor_kind TEXT, phase_kind TEXT
  );`);
  db.prepare('INSERT INTO skill_registry (slug, kind) VALUES (?, ?)').run('writer', 'agent');
}

function insertLane(db: TestDatabase, lane: {
  runId: string; role: string | null; executorKind: string; phaseKind: string | null; root: string;
}): void {
  db.prepare(`INSERT INTO lane_outcome_records
    (run_id, subagent_session_id, final_review, task_id, workspace_root, role, executor_kind, phase_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    lane.runId, `session-${lane.runId}`, 'approved', 'TASK_2026_001', lane.root,
    lane.role, lane.executorKind, lane.phaseKind,
  );
}

const grade: SkillTaskGrade = {
  taskId: 'TASK_2026_001', subjectKind: 'agent', subjectSlug: 'writer',
  attributionKey: 'run:1', runId: '1', verdict: 'pass', sourceFile: 'review.md',
  sourceDigest: 'digest-a', evidenceSource: 'spec:TASK_2026_001',
  workspaceRoot: '/workspace', gradedAt: 1, findingsRef: null,
};

describe('groupGradeAttributions', () => {
  const row = (runId: string | null, sessionId: string | null, key: string) => ({
    kind: 'agent' as const, slug: 'writer', run_id: runId, session_id: sessionId,
    attribution_key: key, final_review: null, workspace_root: '/workspace',
    phase_kind: null, executor_kind: null,
  });

  it('keeps one attribution for duplicate facts from the same run and session', () => {
    expect(groupGradeAttributions([row('run-1', 'session-1', 'run:run-1'), row('run-1', 'session-1', 'run:run-1')]))
      .toEqual([{ kind: 'agent', slug: 'writer', runId: 'run-1', sessionId: 'session-1', attributionKey: 'run:run-1', finalReview: null, phaseKind: null, executorKind: null }]);
  });

  it('drops ambiguous keys while retaining independent keys', () => {
    expect(groupGradeAttributions([
      row('run-1', 'session-1', 'run:run-1'),
      row('run-1', 'session-2', 'run:run-1'),
      row(null, 'session-3', 'event:1'),
      row(null, 'session-3', 'event:1'),
      row('run-2', 'session-4', 'run:run-2'),
    ])).toEqual([{ kind: 'agent', slug: 'writer', runId: 'run-2', sessionId: 'session-4', attributionKey: 'run:run-2', finalReview: null, phaseKind: null, executorKind: null }]);
  });
});

maybe('SkillTaskGradeStore', () => {
  it('fingerprints attribution content independent of row order and detects late lane rows', () => {
    const { db, store } = setup();
    try {
      setupAttributionTables(db);
      const empty = store.attributionFingerprint(grade.taskId, '/workspace');
      insertLane(db, { runId: 'a', role: null, executorKind: 'cli', phaseKind: 'tests', root: '/workspace' });
      const first = store.attributionFingerprint(grade.taskId, '/workspace');
      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(first).not.toBe(empty);
      insertLane(db, { runId: 'b', role: null, executorKind: 'cli', phaseKind: 'review', root: '/workspace' });
      const second = store.attributionFingerprint(grade.taskId, '/workspace');
      expect(second).not.toBe(first);
      db.exec(`DELETE FROM lane_outcome_records WHERE run_id IN ('a', 'b')`);
      insertLane(db, { runId: 'b', role: null, executorKind: 'cli', phaseKind: 'review', root: '/workspace' });
      insertLane(db, { runId: 'a', role: null, executorKind: 'cli', phaseKind: 'tests', root: '/workspace' });
      expect(store.attributionFingerprint(grade.taskId, '/workspace')).toBe(second);
    } finally { db.close(); }
  });
  it('matches trailing-separator roots and excludes a different workspace', () => {
    const { db, store } = setup();
    try {
      setupAttributionTables(db);
      const root = join(process.cwd(), 'proj');
      db.prepare(`INSERT INTO skill_invocation_events
        (id, source, skill_slug, run_id, session_id, workspace_root, task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run('event-1', 'subagent', 'writer', 'run-1', 'session-1', `${root}${sep}`, grade.taskId);
      expect(store.findAttributions(grade.taskId, root)).toEqual([
        expect.objectContaining({ kind: 'agent', slug: 'writer', attributionKey: 'run:run-1' }),
      ]);
      expect(store.findAttributions(grade.taskId, join(process.cwd(), 'other'))).toEqual([]);
    } finally { db.close(); }
  });

  (process.platform === 'win32' ? it : it.skip)('matches uppercase drive-letter event roots', () => {
    const { db, store } = setup();
    try {
      setupAttributionTables(db);
      db.prepare(`INSERT INTO skill_invocation_events
        (id, source, skill_slug, run_id, session_id, workspace_root, task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run('event-1', 'subagent', 'writer', 'run-1', 'session-1', 'D:\\proj\\', grade.taskId);
      expect(store.findAttributions(grade.taskId, 'd:\\proj')).toHaveLength(1);
    } finally { db.close(); }
  });

  it('keeps agent, skill and command grades distinct and returns null for no grade', () => {
    const { db, store } = setup();
    try {
      store.upsert(grade);
      store.upsert({ ...grade, subjectKind: 'skill' });
      store.upsert({ ...grade, subjectKind: 'command', verdict: 'fail' });
      expect(store.getAggregates('agent', ['writer', 'missing'], '/workspace').get('writer')).toEqual({ graded: 1, passed: 1, successRate: 1 });
      expect(store.getAggregates('skill', ['writer'], '/workspace').get('writer')?.successRate).toBe(1);
      expect(store.getAggregates('command', ['writer'], '/workspace').get('writer')?.successRate).toBe(0);
      expect(store.getAggregates('agent', ['missing'], '/workspace').get('missing')).toEqual({ graded: 0, passed: 0, successRate: null });
    } finally { db.close(); }
  });

  it('isolates the same slug by normalized workspace root, including recent verdicts', () => {
    const { db, store } = setup();
    try {
      const firstRoot = join(process.cwd(), 'first');
      const secondRoot = join(process.cwd(), 'second');
      store.upsert({ ...grade, workspaceRoot: `${firstRoot}${sep}` });
      store.upsert({ ...grade, taskId: 'TASK_2026_002', attributionKey: 'run:2',
        workspaceRoot: secondRoot, verdict: 'fail', gradedAt: 2 });
      expect(store.getAggregates('agent', ['writer'], firstRoot).get('writer'))
        .toEqual({ graded: 1, passed: 1, successRate: 1 });
      expect(store.getAggregates('agent', ['writer'], `${secondRoot}${sep}`).get('writer'))
        .toEqual({ graded: 1, passed: 0, successRate: 0 });
      expect(store.listRecent('agent', 'writer', 5, firstRoot)).toMatchObject([{ verdict: 'pass' }]);
      expect(store.listRecent('agent', 'writer', 5, secondRoot)).toMatchObject([{ verdict: 'fail' }]);
      expect(store.getAggregates('agent', ['writer'], join(process.cwd(), 'none')).get('writer'))
        .toEqual({ graded: 0, passed: 0, successRate: null });
      expect(store.getAggregates('agent', ['writer'], null).get('writer')?.successRate).toBeNull();
      expect(store.listRecent('agent', 'writer', 5, null)).toEqual([]);
    } finally { db.close(); }
  });

  it('refuses to overwrite a grade owned by another workspace (A5)', () => {
    const { db, store } = setup();
    try {
      const rootA = join(process.cwd(), 'workspace-a');
      const rootB = join(process.cwd(), 'workspace-b');
      expect(store.upsert({ ...grade, workspaceRoot: rootA })).toBe(true);
      const read = () => db.prepare('SELECT * FROM skill_task_grades').all();
      const before = JSON.stringify(read());
      // ON CONFLICT ... DO UPDATE ... WHERE <false> must report changes === 0.
      expect(store.upsert({
        ...grade, workspaceRoot: rootB, verdict: 'fail', sourceDigest: 'digest-b',
        sourceFile: 'other.md', evidenceSource: 'task-review', gradedAt: 99, findingsRef: 'x',
      })).toBe(false);
      expect(store.upsert({ ...grade, workspaceRoot: null, verdict: 'fail', gradedAt: 100 })).toBe(false);
      expect(JSON.stringify(read())).toBe(before);
      expect(read()).toHaveLength(1);
      // The owning workspace may still update its own row, including a trailing-separator spelling.
      expect(store.upsert({ ...grade, workspaceRoot: `${rootA}${sep}`, verdict: 'fail', gradedAt: 5 })).toBe(true);
      expect(store.listRecent('agent', 'writer', 5, rootA)).toMatchObject([{ verdict: 'fail', gradedAt: 5 }]);
    } finally { db.close(); }
  });

  it('adopts a legacy NULL-root grade into the writing workspace', () => {
    const { db, store } = setup();
    try {
      const root = join(process.cwd(), 'workspace-a');
      expect(store.upsert({ ...grade, workspaceRoot: null })).toBe(true);
      expect(store.upsert({ ...grade, workspaceRoot: root, verdict: 'fail', gradedAt: 2 })).toBe(true);
      expect(db.prepare('SELECT workspace_root, verdict, graded_at FROM skill_task_grades').all())
        .toEqual([{ workspace_root: normalizeWorkspaceRoot(root), verdict: 'fail', graded_at: 2 }]);
    } finally { db.close(); }
  });

  it('scopes hasGradeForTask to the given workspace root', () => {
    const { db, store } = setup();
    try {
      const rootA = join(process.cwd(), 'workspace-a');
      const rootB = join(process.cwd(), 'workspace-b');
      store.upsert({ ...grade, workspaceRoot: rootA });
      expect(store.hasGradeForTask(grade.taskId, 'writer', 'agent', `${rootA}${sep}`)).toBe(true);
      expect(store.hasGradeForTask(grade.taskId, 'writer', undefined, rootA)).toBe(true);
      expect(store.hasGradeForTask(grade.taskId, 'writer', 'agent', rootB)).toBe(false);
      expect(store.hasGradeForTask(grade.taskId, 'writer', 'skill', rootA)).toBe(false);
      expect(store.hasGradeForTask(grade.taskId, 'writer')).toBe(true);
    } finally { db.close(); }
  });

  it('replaces a corrected review without adding a denominator', () => {
    const { db, store } = setup();
    try {
      store.upsert(grade);
      store.upsert({ ...grade, verdict: 'fail', sourceDigest: 'digest-b', gradedAt: 2 });
      expect(store.getAggregates('agent', ['writer'], '/workspace').get('writer')).toEqual({ graded: 1, passed: 0, successRate: 0 });
      expect(store.listRecent('agent', 'writer', 5, '/workspace')).toMatchObject([{ verdict: 'fail', sourceDigest: 'digest-b', gradedAt: 2 }]);
    } finally { db.close(); }
  });

  it('prunes stale non-spec grades when every attribution is skipped and preserves spec backfill', () => {
    const { db, store } = setup();
    try {
      store.upsert(grade);
      store.upsert({ ...grade, subjectSlug: 'manual', attributionKey: 'event:2', evidenceSource: 'review' });
      store.upsert({ ...grade, subjectSlug: 'backfill', attributionKey: 'event:3', evidenceSource: 'spec:legacy' });
      expect(store.removeAbsent(grade.taskId, '/workspace', [])).toBe(1);
      expect(store.listRecent('agent', 'writer', 5, '/workspace')).toHaveLength(1); // spec: evidence is kept
      expect(store.listRecent('agent', 'manual', 5, '/workspace')).toHaveLength(0);
      expect(store.listRecent('agent', 'backfill', 5, '/workspace')).toHaveLength(1);
      store.upsert(grade);
      store.upsert({ ...grade, subjectSlug: 'manual', attributionKey: 'event:2', evidenceSource: 'review' });
      expect(store.removeAbsent(grade.taskId, '/workspace', ['agent:other:event:3'])).toBe(1);
      expect(store.listRecent('agent', 'writer', 5, '/workspace')).toHaveLength(1);
      expect(store.listRecent('agent', 'manual', 5, '/workspace')).toHaveLength(0);
    } finally { db.close(); }
  });

  it('adds phase attributions for every executor kind and keeps the role attribution (0075)', () => {
    const { db, store } = setup();
    try {
      setupAttributionTables(db);
      db.prepare('INSERT INTO skill_registry (slug, kind) VALUES (?, ?)').run(TESTS_ROLE, 'agent');
      insertLane(db, { runId: 'sub', role: TESTS_ROLE, executorKind: 'subagent', phaseKind: 'tests', root: '/workspace' });
      insertLane(db, { runId: 'cli', role: null, executorKind: 'cli', phaseKind: 'review', root: '/workspace' });
      insertLane(db, { runId: 'old', role: TESTS_ROLE, executorKind: 'subagent', phaseKind: null, root: '/workspace' });
      insertLane(db, { runId: 'bad', role: null, executorKind: 'cli', phaseKind: 'not-a-phase', root: '/workspace' });
      insertLane(db, { runId: 'far', role: null, executorKind: 'cli', phaseKind: 'tests', root: '/elsewhere' });
      const found = store.findAttributions('TASK_2026_001', '/workspace');
      expect(found).toHaveLength(4);
      expect(found).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'agent', slug: TESTS_ROLE, attributionKey: 'run:sub', phaseKind: 'tests', executorKind: 'subagent' }),
        expect.objectContaining({ kind: 'phase', slug: 'tests', attributionKey: 'run:sub', phaseKind: 'tests', executorKind: 'subagent' }),
        expect.objectContaining({ kind: 'phase', slug: 'review', attributionKey: 'run:cli', phaseKind: 'review', executorKind: 'cli' }),
        expect.objectContaining({ kind: 'agent', slug: TESTS_ROLE, attributionKey: 'run:old', phaseKind: null }),
      ]));
    } finally { db.close(); }
  });

  it('attributes a taskless phase lane only through a unique parent session task link', () => {
    const { db, store } = setup();
    try {
      setupAttributionTables(db);
      const insert = db.prepare(`INSERT INTO lane_outcome_records
        (run_id, parent_session_id, task_id, workspace_root, executor_kind, phase_kind)
        VALUES (?, ?, NULL, ?, 'cli', 'tests')`);
      insert.run('unique', 'parent-unique', '/workspace');
      insert.run('ambiguous', 'parent-ambiguous', '/workspace');
      insert.run('other-root', 'parent-unique', '/elsewhere');
      const link = db.prepare('INSERT INTO session_task_links (workspace_root, session_id, task_id) VALUES (?, ?, ?)');
      link.run('/workspace', 'parent-unique', grade.taskId);
      link.run('/workspace', 'parent-ambiguous', grade.taskId);
      link.run('/workspace', 'parent-ambiguous', 'TASK_2026_002');
      expect(store.findAttributions(grade.taskId, '/workspace')).toEqual([
        expect.objectContaining({ kind: 'phase', slug: 'tests', attributionKey: 'run:unique' }),
      ]);
    } finally { db.close(); }
  });

  it('stores and reads the phase and executor keys on a grade', () => {
    const { db, store } = setup();
    try {
      store.upsert({ ...grade, subjectKind: 'phase', subjectSlug: 'tests', phaseKind: 'tests', executorKind: 'cli' });
      expect(store.listRecent('phase', 'tests', 5, '/workspace'))
        .toMatchObject([{ subjectKind: 'phase', phaseKind: 'tests', executorKind: 'cli' }]);
      store.upsert(grade);
      expect(store.listRecent('agent', 'writer', 5, '/workspace')).toMatchObject([{ phaseKind: null, executorKind: null }]);
    } finally { db.close(); }
  });

  it('reads legacy role grades through the alias table and never counts one lane row twice', () => {
    const { db, store } = setup();
    try {
      const role = { ...grade, subjectSlug: TESTS_ROLE, evidenceSource: 'task-review' };
      // Legacy role grade (written before 0075): no phase grade for its run.
      store.upsert({ ...role, attributionKey: 'run:legacy', verdict: 'fail' });
      // New lane row with a role and a phase: both subjects are written.
      store.upsert({ ...role, attributionKey: 'run:new', phaseKind: 'tests', executorKind: 'subagent' });
      store.upsert({ ...role, subjectKind: 'phase', subjectSlug: 'tests', attributionKey: 'run:new', phaseKind: 'tests', executorKind: 'subagent' });
      // A CLI lane gives only a phase grade.
      store.upsert({ ...grade, subjectKind: 'phase', subjectSlug: 'tests', attributionKey: 'run:cli', phaseKind: 'tests', executorKind: 'cli', verdict: 'fail' });
      // A role that is not in the alias table never shows under a phase.
      store.upsert({ ...grade, attributionKey: 'run:writer' });
      const before = JSON.stringify(db.prepare('SELECT * FROM skill_task_grades ORDER BY attribution_key, subject_kind').all());
      const tests = store.getPhaseAggregates('/workspace').filter((row) => row.phaseKind === 'tests');
      expect(tests).toEqual([
        { phaseKind: 'tests', legacy: false, aliasedRoles: [], graded: 2, passed: 1, successRate: 0.5 },
        { phaseKind: 'tests', legacy: true, aliasedRoles: [TESTS_ROLE], graded: 1, passed: 0, successRate: 0 },
      ]);
      expect(store.getPhaseAggregates('/workspace').filter((row) => row.legacy)).toHaveLength(1);
      expect(store.getPhaseAggregates(null)).toEqual([]);
      // The read path does not rewrite stored rows.
      expect(JSON.stringify(db.prepare('SELECT * FROM skill_task_grades ORDER BY attribution_key, subject_kind').all())).toBe(before);
    } finally { db.close(); }
  });

  it('counts a run under its real phase when the role alias names another phase', () => {
    const { db, store } = setup();
    try {
      // One lane row: the role alias is 'tests', but the run was a 'review' phase.
      // The same attribution key means the same lane row, so it counts once, under 'review'.
      const role = { ...grade, subjectSlug: TESTS_ROLE, evidenceSource: 'task-review' };
      store.upsert({ ...role, attributionKey: 'run:mixed', phaseKind: 'review', executorKind: 'subagent' });
      store.upsert({ ...role, subjectKind: 'phase', subjectSlug: 'review', attributionKey: 'run:mixed', phaseKind: 'review', executorKind: 'subagent' });
      const rows = store.getPhaseAggregates('/workspace');
      expect(rows.filter((row) => row.phaseKind === 'tests' && row.legacy)).toEqual([]);
      expect(rows.filter((row) => row.phaseKind === 'review')).toEqual([
        { phaseKind: 'review', legacy: false, aliasedRoles: [], graded: 1, passed: 1, successRate: 1 },
      ]);
    } finally { db.close(); }
  });

  it('excludes raw and prefixed subagent agent grades when a phase grade exists', () => {
    const { db, store } = setup();
    try {
      const role = { ...grade, subjectSlug: TESTS_ROLE };
      store.upsert({ ...role, attributionKey: 'run:A' });
      store.upsert({ ...role, attributionKey: 'run:subagent:A' });
      store.upsert({ ...role, subjectKind: 'phase', subjectSlug: 'tests', attributionKey: 'run:subagent:A' });
      const rows = store.getPhaseAggregates('/workspace').filter((row) => row.phaseKind === 'tests');
      expect(rows).toEqual([
        { phaseKind: 'tests', legacy: false, aliasedRoles: [], graded: 1, passed: 1, successRate: 1 },
      ]);
    } finally { db.close(); }
  });

  it('counts a raw and prefixed subagent agent pair once without a phase grade', () => {
    const { db, store } = setup();
    try {
      const role = { ...grade, subjectSlug: TESTS_ROLE };
      store.upsert({ ...role, attributionKey: 'run:A' });
      store.upsert({ ...role, attributionKey: 'run:subagent:A' });
      const legacy = store.getPhaseAggregates('/workspace').find((row) => row.phaseKind === 'tests' && row.legacy);
      expect(legacy).toMatchObject({ graded: 1, passed: 1 });
    } finally { db.close(); }
  });

  it('counts distinct subagent runs separately in legacy totals', () => {
    const { db, store } = setup();
    try {
      const role = { ...grade, subjectSlug: TESTS_ROLE };
      for (const run of ['A', 'B']) {
        store.upsert({ ...role, attributionKey: `run:${run}` });
        store.upsert({ ...role, attributionKey: `run:subagent:${run}` });
      }
      const legacy = store.getPhaseAggregates('/workspace').find((row) => row.phaseKind === 'tests' && row.legacy);
      expect(legacy).toMatchObject({ graded: 2, passed: 2 });
    } finally { db.close(); }
  });

  it('rejects an invalid persisted grade row with a bounded warning', () => {
    const { db, store } = setup();
    try {
      store.upsert(grade);
      db.prepare('UPDATE skill_task_grades SET verdict = ? WHERE task_id = ?').run('invalid-verdict', grade.taskId);
      expect(() => store.listRecent('agent', 'writer', 5, '/workspace')).toThrow('Invalid task grade row');
      expect(logger.warn).toHaveBeenCalledWith('[skill-synthesis] invalid task grade row');
    } finally { db.close(); }
  });
});
