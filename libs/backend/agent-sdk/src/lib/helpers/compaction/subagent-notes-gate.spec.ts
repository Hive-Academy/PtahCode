import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SubagentNotesGate, NOTES_GATE_TIMEOUT_MS } from './subagent-notes-gate';

describe('SubagentNotesGate completion phase', () => {
  const root = path.resolve('C:/fake-workspace');
  const notes = path.join(root, '.ptah', 'notes.md');
  const deliverable = path.join(root, 'worktree', 'review.md');
  const other = path.join(root, 'source.ts');
  let gate: SubagentNotesGate;
  beforeEach(() => { gate = new SubagentNotesGate(); });

  it('allows notes Write, Edit and Read, but no other paths or tools', () => {
    gate.warn('agent', notes, root, 0);
    for (const tool of ['Write', 'Edit', 'Read']) expect(gate.check('agent', tool, { file_path: notes }, 1)).toEqual({ stop: false });
    for (const [tool, input] of [['Write', { file_path: other }], ['Read', { file_path: other }], ['Bash', {}], ['Write', { file_path: '../outside' }]] as const) {
      expect(gate.check('agent', tool, input, 1)).toEqual({ stop: false, reason: expect.stringContaining('Your turn ends immediately after the notes write') });
    }
    expect(gate.check(undefined, 'Bash', {}, 1)).toEqual({ stop: false });
    expect(gate.check('sibling', 'Bash', {}, 1)).toEqual({ stop: false });
  });

  it('names and permits explicit deliverables, counts only successful writes in this gate', () => {
    gate.warn('agent', notes, root, 0, [deliverable, 'second.md']);
    for (const file of [notes, deliverable, path.join(root, 'second.md')]) {
      expect(gate.check('agent', 'Write', { file_path: file }, 1)).toEqual({ stop: false });
      expect(gate.check('agent', 'Bash', {}, 1).reason).toContain(file);
    }
    expect(gate.check('agent', 'Read', { file_path: deliverable }, 1)).toEqual({ stop: false });
    // Permission is not proof of a successful write, nor is an unrelated tool result.
    expect(gate.cause('agent', 'warning-turn-ended', false).measured).toBe(0);
    expect(gate.recordWrite('agent', 'Read', { file_path: notes })).toBe(false);
    expect(gate.recordWrite('agent', 'Write', { file_path: notes })).toBe(true);
    expect(gate.recordWrite('agent', 'Edit', { file_path: deliverable })).toBe(false);
    expect(gate.recordWrite('agent', 'Write', { file_path: other })).toBe(false);
    expect(gate.recordWrite('agent', 'Write', { file_path: path.join(root, 'second.md') })).toBe(false);
    expect(gate.cause('agent', 'warning-notes-complete', true)).toMatchObject({ measured: 1, limit: 1 });
    gate.finish('agent'); gate.warn('agent', notes, root, 5, [deliverable]);
    expect(gate.recordWrite('agent', 'Write', { file_path: deliverable })).toBe(false);
  });

  it('deduplicates declared paths and rejects paths outside the workspace', () => {
    expect(() => gate.warn('agent', notes, root, 0, ['../outside.md'])).toThrow('inside');
    gate.warn('agent', notes, root, 0, [notes, deliverable, deliverable]);
    expect(gate.paths('agent')).toEqual([notes, deliverable]);
    expect(gate.recordWrite('agent', 'Write', { file_path: notes })).toBe(true);
    expect(gate.recordWrite('agent', 'Write', { file_path: deliverable })).toBe(false);
  });

  it('never expires because of a number of decisions, denials or edits', () => {
    gate.warn('agent', notes, root, 0, [deliverable]);
    for (let i = 0; i < 50; i++) {
      expect(gate.check('agent', 'Bash', {}, i * 3_000).stop).toBe(false);
      expect(gate.check('agent', 'Edit', { file_path: notes }, i * 3_000)).toEqual({ stop: false });
    }
    expect(gate.expired('agent', 120_000)).toBe(false);
  });

  it('has exactly one ten-minute bound from entry, unaffected by decisions or repeated warn', () => {
    jest.useFakeTimers().setSystemTime(0);
    try {
      gate.warn('agent', notes, root);
      jest.advanceTimersByTime(120_000);
      expect(gate.check('agent', 'Read', { file_path: notes })).toEqual({ stop: false });
      gate.warn('agent', notes, root);
      jest.advanceTimersByTime(NOTES_GATE_TIMEOUT_MS - 120_000 - 1);
      expect(gate.expired('agent')).toBe(false);
      jest.advanceTimersByTime(1);
      expect(gate.check('agent', 'Write', { file_path: notes })).toMatchObject({ stop: true, reason: expect.stringContaining('notes-timeout') });
      expect(gate.cause('agent', 'notes-timeout', true)).toMatchObject({ measured: 600_000, limit: 600_000 });
    } finally { jest.useRealTimers(); }
  });

  it('accepts Windows casing and slash normalization for permitted files', () => {
    if (process.platform !== 'win32') return;
    gate.warn('agent', notes, root, 0, [deliverable]);
    expect(gate.check('agent', 'Edit', { file_path: deliverable.toUpperCase().replaceAll('\\', '/') }, 1)).toEqual({ stop: false });
    expect(gate.check('agent', 'Write', { file_path: `${notes}/../other.md` }, 1).reason).toBeDefined();
  });
});


describe('notes path containment', () => {
  it('rejects symlink escapes at declaration and rechecks permitted files after a path swap', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-notes-path-'));
    try {
      const workspace = path.join(base, 'workspace'); const outside = path.join(base, 'outside');
      fs.mkdirSync(workspace); fs.mkdirSync(outside);
      const linked = path.join(workspace, 'linked');
      fs.symlinkSync(outside, linked, 'junction');
      const gate = new SubagentNotesGate();
      const notes = path.join(workspace, 'notes.md');
      expect(() => gate.warn('escape', notes, workspace, 0, [path.join(linked, 'review.md')])).toThrow('inside');
      const target = path.join(workspace, 'target'); fs.mkdirSync(target);
      const deliverable = path.join(target, 'review.md');
      gate.warn('agent', notes, workspace, 0, [deliverable]);
      fs.rmdirSync(target); fs.symlinkSync(outside, target, 'junction');
      expect(gate.check('agent', 'Write', { file_path: deliverable }, 1).reason).toBeDefined();
      expect(gate.recordWrite('agent', 'Write', { file_path: deliverable })).toBe(false);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
});
