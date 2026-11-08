import * as path from 'node:path';
import { SubagentNotesGate, NOTES_GATE_TIMEOUT_MS } from './subagent-notes-gate';

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
    expect(gate.check('agent-1', 'Read', { file_path: notes }, 104).reason).toContain('End your turn now');
  });

  it('bounds repeated denials and elapsed time', () => {
    const gate = new SubagentNotesGate();
    gate.warn('agent-1', notes, root, 100);
    expect(gate.check('agent-1', 'Bash', {}, 101).stop).toBe(false);
    expect(gate.check('agent-1', 'Bash', {}, 102).stop).toBe(false);
    expect(gate.check('agent-1', 'Bash', {}, 103).stop).toBe(true);
    gate.warn('agent-2', notes, root, 100);
    expect(gate.check('agent-2', 'Write', { file_path: notes }, 100 + NOTES_GATE_TIMEOUT_MS).reason).toBeUndefined();
    expect(gate.check('agent-2', 'Read', {}, 101 + NOTES_GATE_TIMEOUT_MS).stop).toBe(true);
  });

  it('accepts Windows drive casing and forward slashes for the exact notes path', () => {
    if (process.platform !== 'win32') return;
    const gate = new SubagentNotesGate();
    gate.warn('agent-1', notes, root);
    expect(gate.check('agent-1', 'Write', { file_path: notes.replace(/^C:/, 'c:').replaceAll('\\', '/') }).reason).toBeUndefined();
    expect(gate.check('agent-1', 'Edit', { file_path: `${notes}/../other.md` }).reason).toContain(notes);
  });
});
