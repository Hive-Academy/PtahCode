import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readAgentOutputBlob } from './agent-output-blob.reader';

describe('readAgentOutputBlob', () => {
  it('reads header metadata, toolCallSummary, and paired segment outcomes from the synthetic fixture', () => {
    const fixture = readFileSync(join(__dirname, '__fixtures__', 'agent-output.synthetic.json'), 'utf8');
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-fixture-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, fixture);
      const blob = readAgentOutputBlob(file);
      expect(blob.cli).toBe('codex');
      expect(blob.model).toBe('gpt-5-codex');
      expect(blob.startedAt).toBe('2026-11-27T00:00:00.000Z');
      expect(blob.segmentsTruncated).toBe(false);
      expect(blob.toolCallSummary).toMatchObject({ totalCalls: 3, ptahCalls: 1, nativeCalls: 2, nativeErrors: 1, unknownOutcomes: 1 });
      expect(blob.fallbackSummary).toMatchObject({ totalCalls: 3, unknownOutcomes: 1 });
      expect(Object.keys(blob)).not.toContain('calls');
      expect(blob.savedAt).toBe(1795000000000);
      expect(blob.truncated).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('loads legacy blobs without header metadata and falls back to the 500 segment cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-cap-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, JSON.stringify({ agentId: 'fixture', savedAt: 1, segments: Array.from({ length: 500 }, () => ({ type: 'tool-call', toolName: 'Read' })) }));
      const blob = readAgentOutputBlob(file);
      expect(blob.cli).toBeNull();
      expect(blob.model).toBeNull();
      expect(blob.startedAt).toBeNull();
      expect(blob.segmentsTruncated).toBeNull();
      expect(blob.toolCallSummary).toBeNull();
      expect(blob.truncated).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('honors explicit segmentsTruncated over segment count', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-exact500-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, JSON.stringify({
        agentId: 'fixture',
        savedAt: 1,
        segmentsTruncated: false,
        segments: Array.from({ length: 500 }, () => ({ type: 'tool-call', toolName: 'Read' })),
      }));
      expect(readAgentOutputBlob(file).truncated).toBe(false);
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

  it('normalizes unsafe byTool keys in persisted summaries and aligns fallback pairing rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-output-privacy-'));
    const file = join(dir, 'synthetic.json');
    try {
      writeFileSync(file, JSON.stringify({
        agentId: 'fixture',
        savedAt: 1,
        toolCallSummary: {
          totalCalls: 2,
          ptahCalls: 0,
          nativeCalls: 2,
          otherMcpCalls: 0,
          discoveryCalls: 0,
          ptahErrors: 0,
          nativeErrors: 1,
          unknownOutcomes: 0,
          callsBeforeFirstPtahSuccess: null,
          substitutableNative: { textSearch: 0, fileRead: 0, pathListing: 0, gitRead: 0 },
          byTool: {
            'Run: cat C:/secret/file.txt': { calls: 1, errors: 1 },
            'bash -c "curl https://secret.example"': { calls: 1, errors: 0 },
          },
          byToolOverflow: 0,
        },
        segments: [
          { type: 'tool-call', toolCallId: 'x', toolName: 'ptah_grep' },
          { type: 'tool-call', toolCallId: 'x', toolName: 'Read' },
          { type: 'tool-result', toolCallId: 'x' },
          { type: 'tool-result-error', toolCallId: 'x' },
          { type: 'tool-call', toolCallId: '', toolName: 'Run: cat C:/secret/file.txt' },
          { type: 'tool-result-error', toolCallId: '' },
        ],
      }));
      const blob = readAgentOutputBlob(file);
      expect(JSON.stringify(blob.toolCallSummary)).not.toContain('secret');
      expect(blob.toolCallSummary?.byTool).toEqual({ 'native:other': { calls: 2, errors: 1 } });
      expect(JSON.stringify(blob.fallbackSummary)).not.toContain('secret');
      expect(blob.fallbackSummary).toEqual({
        totalCalls: 2,
        ptahCalls: 1,
        nativeCalls: 1,
        otherMcpCalls: 0,
        discoveryCalls: 0,
        ptahErrors: 0,
        nativeErrors: 1,
        unknownOutcomes: 0,
        callsBeforeFirstPtahSuccess: 0,
        substitutableNative: { textSearch: 0, fileRead: 0, pathListing: 0, gitRead: 0 },
        byTool: { ptah_grep: { calls: 1, errors: 0 }, 'native:other': { calls: 1, errors: 1 } },
        byToolOverflow: 0,
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
