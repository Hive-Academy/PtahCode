import * as path from 'node:path';
import { SubagentNotesGate, NOTES_GATE_GRACE_MS, NOTES_GATE_TIMEOUT_MS } from './subagent-notes-gate';

describe('SubagentNotesGate', () => {
  const root = path.resolve('C:/fake-workspace');
  const notes = path.join(root, '.ptah', 'subagent-handoffs', 'tool_1.md');

  it('scopes the gate to the warned agent and allows only its canonical notes file', () => {
    const gate = new SubagentNotesGate();
    gate.warn('agent-1', notes, root, 100);
    expect(gate.check(undefined, 'Bash', {}, 101).reason).toBeUndefined();
    expect(gate.check('agent-2', 'Bash', {}, 101).reason).toBeUndefined();
    expect(gate.check('agent-1', 'Write', { file_path: '../outside.md' }, 101).reason).toContain(notes);
    expect(gate.check('agent-1', 'Write', { file_path: `${notes}.other` }, 102).reason).toContain(notes);
    expect(gate.check('agent-1', 'Write', { file_path: notes }, 103).reason).toBeUndefined();
    expect(gate.check('agent-1', 'Edit', { file_path: notes }, 104).reason).toBeUndefined();
    expect(gate.check('agent-1', 'Read', { file_path: notes }, 104).reason).toContain('End your turn now');
  });

  it('counts three separate denial bursts but not three parallel calls', () => {
    const gate = new SubagentNotesGate();
    gate.warn('agent-1', notes, root, 100);
    expect(gate.check('agent-1', 'Bash', {}, 101).stop).toBe(false);
    expect(gate.check('agent-1', 'Bash', {}, 102).stop).toBe(false);
    expect(gate.check('agent-1', 'Bash', {}, 103).stop).toBe(false);
    expect(gate.check('agent-1', 'Bash', {}, 2_104).stop).toBe(false);
    expect(gate.check('agent-1', 'Bash', {}, 4_105).stop).toBe(true);
  });

  it('starts the watchdog at the first gate decision and grants time before it', () => {
    jest.useFakeTimers().setSystemTime(100);
    try {
      const gate = new SubagentNotesGate();
      gate.warn('agent-2', notes, root);
      jest.setSystemTime(100 + NOTES_GATE_TIMEOUT_MS);
      expect(gate.expired('agent-2')).toBe(false);
      jest.setSystemTime(100 + NOTES_GATE_GRACE_MS - 1);
      expect(gate.expired('agent-2')).toBe(false);
      expect(gate.check('agent-2', 'Write', { file_path: notes }).reason).toBeUndefined();
      jest.setSystemTime(100 + NOTES_GATE_GRACE_MS - 1 + NOTES_GATE_TIMEOUT_MS - 1);
      expect(gate.expired('agent-2')).toBe(false);
      jest.advanceTimersByTime(1);
      expect(gate.expired('agent-2')).toBe(true);
      const silent = new SubagentNotesGate();
      silent.warn('agent-3', notes, root, 100);
      expect(silent.expired('agent-3')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('checks every notes write and stops an expired second write', () => {
    const gate = new SubagentNotesGate();
    gate.warn('agent-1', notes, root, 100);
    expect(gate.check('agent-1', 'Write', { file_path: notes }, 101).stop).toBe(false);
    expect(gate.check('agent-1', 'Edit', { file_path: notes }, 102).stop).toBe(false);
    expect(gate.check('agent-1', 'Read', {}, 103).reason).toContain('End your turn now');
    expect(gate.check('agent-1', 'Write', { file_path: notes }, 101 + NOTES_GATE_TIMEOUT_MS).stop).toBe(true);
  });

  it('accepts Windows drive casing and forward slashes for the exact notes path', () => {
    if (process.platform !== 'win32') return;
    const gate = new SubagentNotesGate();
    gate.warn('agent-1', notes, root);
    expect(gate.check('agent-1', 'Write', { file_path: notes.replace(/^C:/, 'c:').replaceAll('\\', '/') }).reason).toBeUndefined();
    expect(gate.check('agent-1', 'Edit', { file_path: `${notes}/../other.md` }).reason).toContain(notes);
  });
});
