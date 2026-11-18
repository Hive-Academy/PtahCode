import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { guardSuccessor, readPredecessor, renderLineage, successorLineage, type SuccessorLineage } from './subagent-successor-lineage';
import { SubagentDeliverables } from './subagent-deliverables';
import { createSubagentBudgetHooks } from './subagent-budget-hooks';

const previous: SuccessorLineage = { warningReached: true, requestCount: 3, initialContext: 100_000, effectiveH: 180_000, completedDeliverable: false, exhausted: false };
it('allows incident request3/request4 successor but exhausts equal/faster unproductive chains', () => {
  expect(successorLineage(previous, { ...previous, requestCount: 4 }).exhausted).toBe(false);
  expect(successorLineage(previous, { ...previous, requestCount: 3 }).exhausted).toBe(true);
  expect(successorLineage(previous, { ...previous, requestCount: 2 }).exhausted).toBe(true);
  expect(successorLineage(previous, { ...previous, completedDeliverable: true }).exhausted).toBe(false);
  expect(successorLineage(previous, { ...previous, warningReached: false }).exhausted).toBe(false);
  expect(successorLineage(undefined, previous).exhausted).toBe(false);
});
it('loads explicit ancestry in the record directory and exercises hook denial', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-batch2-'));
  try {
    const record = path.join(workspace, '.ptah', 'subagent-handoffs', 'previous.handoff.md');
    await fs.mkdir(path.dirname(record), { recursive: true });
    await fs.writeFile(record, renderLineage(previous) + '\n' + renderLineage({ ...previous, exhausted: true, notes: 'previous-notes.md' }));
    const prompt = `Continue task\nPtah predecessor handoff: ${record}`;
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    expect(await readPredecessor(workspace, { prompt }, logger)).toMatchObject({ exhausted: true, notes: 'previous-notes.md' });
    expect(await readPredecessor(workspace, { prompt: `${prompt}\nPtah reduced scope: only inspect the named function` }, logger)).toMatchObject({ exhausted: true });
    expect(await guardSuccessor(workspace, { prompt: `${prompt}\nPtah reduced scope: skip` }, logger)).toContain('exhausted');
    expect(await guardSuccessor(workspace, { prompt: 'unrelated task' }, logger)).toBeUndefined();
    expect(await guardSuccessor(workspace, { prompt: `${prompt}\nPtah reduced scope: only inspect the named function` }, logger)).toBeUndefined();
    const monitor = { checkNotesTool: async (_session: string | undefined, _agent: string | undefined, tool: string, input: unknown) => tool === 'Agent' ? guardSuccessor(workspace, input, logger) : undefined,
      hasNotesGate: () => false, finishWarnedAgent: jest.fn(), takeNormalHandoff: jest.fn(), takeInterruptedHandoff: jest.fn(), recordNotesToolResult: jest.fn() };
    const hooks = createSubagentBudgetHooks(logger, monitor, 'session-after-rekey');
    const hook = hooks.PreToolUse?.[0]?.hooks[0];
    if (!hook) throw new Error('Missing spawn hook');
    const response = await hook({ hook_event_name: 'PreToolUse', cwd: workspace, transcript_path: '', session_id: 'session-after-rekey', tool_name: 'Agent', tool_input: { prompt }, tool_use_id: 'spawn2' }, undefined, { signal: new AbortController().signal });
    expect(response).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('lineage exhausted') } });
    await fs.writeFile(record, 'Ptah lineage: {malformed-json}');
    expect(await readPredecessor(workspace, { prompt }, logger)).toBeUndefined();
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});
it('treats absent, malformed and outside-workspace records as unknown ancestry', async () => {
  const logger = { debug: jest.fn(), warn: jest.fn() };
  expect(await readPredecessor(process.cwd(), { prompt: 'Ptah predecessor handoff: ../outside.handoff.md' }, logger)).toBeUndefined();
  expect(await readPredecessor(process.cwd(), { prompt: 'Ptah predecessor handoff: absent.handoff.md' }, logger)).toBeUndefined();
});

it('recognizes successful declared mutations as productive without counting notes or unrelated files', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-batch2-progress-'));
  try {
    const progress = new SubagentDeliverables();
    progress.record('before-rekey', 'successor', 'Write', { file_path: 'notes.md' }, workspace);
    expect(progress.completed('successor', ['deliverable.md'], workspace)).toBe(false);
    progress.record('before-rekey', 'successor', 'Write', { file_path: 'deliverable.md' }, workspace);
    progress.rekey('before-rekey', 'after-rekey');
    expect(progress.completed('successor', ['deliverable.md'], workspace)).toBe(true);
    expect(progress.completed('unrelated-agent', ['deliverable.md'], workspace)).toBe(false);
    progress.release('after-rekey');
    expect(progress.completed('successor', ['deliverable.md'], workspace)).toBe(false);
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});

it('uses a smaller initial context as measured instruction-load reduction and preserves ancestry', () => {
  expect(successorLineage(previous, { ...previous, predecessor: 'previous.handoff.md', initialContext: 90_000 })).toMatchObject({ exhausted: false, predecessor: 'previous.handoff.md' });
});
it('counts undeclared successful workspace edits but excludes notes and outside files', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-progress-'));
  try {
    const progress = new SubagentDeliverables();
    progress.record('s', 'a', 'Write', { file_path: 'notes.md' }, workspace);
    progress.record('s', 'a', 'Write', { file_path: '../outside.ts' }, workspace);
    expect(progress.completed('a', [], workspace, 'notes.md')).toBe(false);
    progress.record('s', 'a', 'Edit', { file_path: 'source.ts' }, workspace);
    expect(progress.completed('a', [], workspace, 'notes.md')).toBe(true);
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});
it('rejects untrusted, oversized, markerless and invalid records and warns once per session', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-record-limit-'));
  const logger = { debug: jest.fn(), warn: jest.fn() };
  try {
    const directory = path.join(workspace, '.ptah', 'subagent-handoffs');
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, 'test.handoff.md');
    const input = { prompt: `Ptah predecessor handoff: ${file}` };
    for (const content of ['x'.repeat(256 * 1024 + 1), 'no marker', 'Ptah lineage: {}', 'Ptah lineage: {broken']) {
      await fs.writeFile(file, content);
      expect(await readPredecessor(workspace, input, logger, 's')).toBeUndefined();
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
    await fs.writeFile(file, renderLineage(previous));
    expect(await readPredecessor(workspace, input, logger, 's')).toEqual(previous);
    await fs.writeFile(path.join(workspace, 'forged.handoff.md'), renderLineage(previous));
    expect(await readPredecessor(workspace, { prompt: 'Ptah predecessor handoff: forged.handoff.md' }, logger, 's')).toBeUndefined();
    expect(await readPredecessor(undefined, input, logger, 'another')).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});
