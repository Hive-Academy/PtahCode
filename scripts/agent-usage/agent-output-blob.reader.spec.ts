import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readAgentOutputBlob } from './agent-output-blob.reader';

describe('readAgentOutputBlob', () => {
  it('pairs results, records error and unknown outcomes, and reads saved time', () => {
    const fixture = readFileSync(join(__dirname, '__fixtures__', 'agent-output.synthetic.json'), 'utf8');
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-fixture-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, fixture);
      const blob = readAgentOutputBlob(file);
      expect(blob.calls.map((call) => call.outcome)).toEqual(['success', 'error', 'unknown']);
      expect(blob.savedAt).toBe(1795000000000);
      expect(blob.truncated).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('detects the documented 500 segment cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-cap-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, JSON.stringify({ agentId: 'fixture', savedAt: 1, segments: Array.from({ length: 500 }, () => ({ type: 'tool-call', toolName: 'Read' })) }));
      expect(readAgentOutputBlob(file).truncated).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports malformed JSON without exposing source contents or path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-malformed-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, '{"secret-marker":"hidden"');
      expect(() => readAgentOutputBlob(file)).toThrow('Unable to parse agent output blob JSON');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
