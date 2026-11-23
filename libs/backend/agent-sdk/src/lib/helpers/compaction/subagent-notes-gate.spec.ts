import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentActionNotice } from '@ptah-extension/shared';
import { SubagentNotesGate, NOTES_GATE_TIMEOUT_MS } from './subagent-notes-gate';

const notice: AgentActionNotice = { actor: 'ptah-budget', action: 'paused', reason: 'context-budget', nextStep: 'write-notes-and-return', measured: 300_000, limit: 150_000, unit: 'tokens' };

describe('SubagentNotesGate handoff phases', () => {
  const root = path.resolve('C:/fake-workspace');
  const notes = path.join(root, '.ptah', 'notes.md');
  const deliverable = path.join(root, 'worktree', 'review.md');
  const other = path.join(root, 'source.ts');
  let gate: SubagentNotesGate;
  beforeEach(() => { gate = new SubagentNotesGate(); });
  const writable = (extra: readonly string[] = []) => gate.enter('agent', { readOnly: false, notesPath: notes, workspace: root, now: 0, deliverablePaths: extra });

  it('never denies in phase asked, even for unrelated tools and paths', () => {
    writable();
    expect(gate.phase('agent')).toBe('asked');
    for (const [tool, input] of [['Bash', {}], ['Write', { file_path: other }], ['Read', { file_path: '../outside' }]] as const) {
      expect(gate.check('agent', tool, input, 1)).toEqual({});
    }
    expect(gate.check(undefined, 'Bash', {}, 1)).toEqual({});
    expect(gate.check('sibling', 'Bash', {}, 1)).toEqual({});
  });

  it('enter is idempotent and pause latches once, storing the notice', () => {
    writable();
    gate.enter('agent', { readOnly: true, now: 99 });
    expect(gate.paths('agent')).toEqual([notes]);
    expect(gate.pause('agent', notice)).toBe(true);
    expect(gate.pause('agent', { ...notice, reason: 'raw-budget' })).toBe(false);
    expect(gate.phase('agent')).toBe('paused');
    expect(gate.pause('missing', notice)).toBe(false);
    expect(gate.phase(undefined)).toBeUndefined();
    expect(gate.has('agent')).toBe(true);
    gate.finish('agent');
    expect(gate.has('agent')).toBe(false);
  });

  it('paused writable agent keeps Write, Edit and Read of permitted paths and is denied everything else with Ptah copy', () => {
    writable([deliverable]);
    gate.pause('agent', notice);
    for (const tool of ['Write', 'Edit', 'Read']) {
      for (const file of [notes, deliverable]) expect(gate.check('agent', tool, { file_path: file }, 1)).toEqual({});
    }
    for (const [tool, input] of [['Write', { file_path: other }], ['Read', { file_path: other }], ['Bash', {}], ['Grep', { file_path: notes }], ['Write', { file_path: '../outside' }]] as const) {
      const reason = gate.check('agent', tool, input, 1).reason;
      expect(reason).toContain('Ptah budget monitor paused new work tools');
      expect(reason).toContain(`Write your progress, findings, and remaining work to ${notes} with Write or Edit, then return normally.`);
      expect(reason).toContain(`Permitted paths: ${notes}, ${deliverable}`);
      expect(reason).not.toMatch(/\bstop|\buser\b|forced/i);
    }
  });

  it('paused read-only agent keeps Read, Grep and Glob and is denied writes and shell without write rights', () => {
    gate.enter('agent', { readOnly: true });
    gate.pause('agent', notice);
    for (const tool of ['Read', 'Grep', 'Glob']) expect(gate.check('agent', tool, {}, 1)).toEqual({});
    for (const tool of ['Write', 'Edit', 'Bash']) {
      const reason = gate.check('agent', tool, { file_path: notes }, 1).reason;
      expect(reason).toContain('Read, Grep, and Glob');
      expect(reason).toContain('Return normally with your progress, findings, and remaining work in your final report.');
      expect(reason).not.toMatch(/\bstop|\buser\b|forced/i);
    }
    expect(gate.paths('agent')).toEqual([]);
  });

  it('inline-report mode (no notes path) grants no write rights when paused', () => {
    gate.enter('agent', { readOnly: false, workspace: root });
    gate.pause('agent', notice);
    expect(gate.check('agent', 'Write', { file_path: notes }, 1).reason)
      .toContain('Return normally with your progress, findings, and remaining work in your final report.');
    expect(gate.check('agent', 'Read', { file_path: notes }, 1).reason).toContain('paused new work tools');
    expect(gate.recordWrite('agent', 'Write', { file_path: notes })).toBe(false);
  });

  it('counts only successful writes of permitted paths and tracks notes readiness', () => {
    writable([deliverable, 'second.md']);
    gate.pause('agent', notice);
    expect(gate.notesReady('agent')).toBe(false);
    expect(gate.recordWrite('agent', 'Read', { file_path: notes })).toBe(false);
    expect(gate.recordWrite('agent', 'Edit', { file_path: deliverable })).toBe(false);
    expect(gate.recordWrite('agent', 'Write', { file_path: other })).toBe(false);
    expect(gate.notesReady('agent')).toBe(false);
    expect(gate.recordWrite('agent', 'Write', { file_path: notes })).toBe(true);
    expect(gate.notesReady('agent')).toBe(true);
    gate.finish('agent'); writable([deliverable]);
    expect(gate.recordWrite('agent', 'Write', { file_path: deliverable })).toBe(false);
  });

  it('deduplicates declared paths and rejects paths outside the workspace', () => {
    expect(() => writable(['../outside.md'])).toThrow('inside');
    expect(gate.has('agent')).toBe(false);
    writable([notes, deliverable, deliverable]);
    expect(gate.paths('agent')).toEqual([notes, deliverable]);
    expect(gate.recordWrite('agent', 'Write', { file_path: notes })).toBe(true);
    expect(gate.recordWrite('agent', 'Write', { file_path: deliverable })).toBe(false);
  });

  it('is overdue only after ten minutes from entry, notified once, and never denies or stops', () => {
    writable([deliverable]);
    for (let i = 0; i < 50; i++) expect(gate.check('agent', 'Bash', {}, i * 3_000)).toEqual({});
    expect(gate.expired('agent', NOTES_GATE_TIMEOUT_MS - 1)).toBe(false);
    expect(gate.expired('agent', NOTES_GATE_TIMEOUT_MS)).toBe(true);
    expect(gate.markOverdueNotified('agent')).toBe(true);
    expect(gate.markOverdueNotified('agent')).toBe(false);
    expect(gate.markOverdueNotified('missing')).toBe(false);
    expect(gate.expired('agent', NOTES_GATE_TIMEOUT_MS * 5)).toBe(true);
    expect(gate.check('agent', 'Bash', {}, NOTES_GATE_TIMEOUT_MS * 5)).toEqual({});
    expect(gate.expired('missing', 1e12)).toBe(false);
  });

  it('measures the ten-minute bound from the entry time, not from a later duplicate enter', () => {
    gate.enter('agent', { readOnly: false, now: 0 });
    gate.enter('agent', { readOnly: false, now: NOTES_GATE_TIMEOUT_MS });
    expect(gate.expired('agent', NOTES_GATE_TIMEOUT_MS)).toBe(true);
  });

  it('matches permitted paths case-insensitively only where the platform does', () => {
    writable([deliverable]);
    gate.pause('agent', notice);
    const upper = deliverable.toUpperCase().replaceAll('\\', '/');
    expect(gate.check('agent', 'Edit', { file_path: upper }, 1).reason === undefined).toBe(process.platform === 'win32');
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
      expect(() => gate.enter('escape', { readOnly: false, notesPath: notes, workspace, now: 0, deliverablePaths: [path.join(linked, 'review.md')] })).toThrow('inside');
      const target = path.join(workspace, 'target'); fs.mkdirSync(target);
      const deliverable = path.join(target, 'review.md');
      gate.enter('agent', { readOnly: false, notesPath: notes, workspace, now: 0, deliverablePaths: [deliverable] });
      gate.pause('agent', notice);
      fs.rmdirSync(target); fs.symlinkSync(outside, target, 'junction');
      expect(gate.check('agent', 'Write', { file_path: deliverable }, 1).reason).toBeDefined();
      expect(gate.recordWrite('agent', 'Write', { file_path: deliverable })).toBe(false);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
});
