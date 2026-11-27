import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createToolCallSummary,
  recordToolCall,
  recordToolResult,
  releaseToolCallSummary,
  type ToolCallSummarySegment,
} from '@ptah-extension/shared';
import {
  buildShareReport,
  emptyWindowExitCode,
  EMPTY_WINDOW_MESSAGE,
  filterRowsByWindow,
  formatShareReport,
  parseInstant,
  rowFromLane,
  selectClaudeSessionRows,
  summarizeCalls,
  type ShareRow,
} from './tool-call-share';

const row = (id: string, vendor: string, at: number, calls: Parameters<typeof summarizeCalls>[0]): ShareRow => {
  const total = summarizeCalls(calls);
  return { id, kind: 'lane', vendor, model: null, startedAt: null, total, ptahShare: 0, truncated: false, hasSummary: false, storedTotal: null, windowAt: at, sessionId: 'fixture-session' };
};

describe('tool-call-share', () => {
  it('uses header cli, model, startedAt, and toolCallSummary when present even if segments are truncated', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-share-summary-'));
    const agentId = 'agent-summary';
    const blobFile = join(directory, `agent-output.${agentId}.json`);
    try {
      writeFileSync(blobFile, JSON.stringify({
        agentId,
        cli: 'codex',
        model: 'gpt-5-codex',
        startedAt: '2026-11-27T01:00:00.000Z',
        segmentsTruncated: true,
        toolCallSummary: {
          totalCalls: 620,
          ptahCalls: 400,
          nativeCalls: 200,
          otherMcpCalls: 20,
          discoveryCalls: 5,
          ptahErrors: 2,
          nativeErrors: 3,
          unknownOutcomes: 1,
          callsBeforeFirstPtahSuccess: 4,
          substitutableNative: { textSearch: 10, fileRead: 20, pathListing: 3, gitRead: 7 },
          byTool: { ptah_grep: { calls: 400, errors: 2 } },
          byToolOverflow: 0,
        },
        savedAt: 1000,
        segments: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'Read' }],
      }));
      const laneRow = rowFromLane(blobFile);
      expect(laneRow).toMatchObject({
        id: agentId,
        vendor: 'codex',
        model: 'gpt-5-codex',
        startedAt: '2026-11-27T01:00:00.000Z',
        hasSummary: true,
        truncated: false,
        storedTotal: 620,
        total: {
          total: 620,
          ptah: 400,
          native: 200,
          ptahErrors: 2,
          unknown: 1,
          discovery: 5,
          beforeFirstPtahSuccess: 4,
          nativeSubstitutable: { 'text-search': 10, 'file-read': 20, 'path-listing': 3, 'git-read': 7 },
          otherMcp: { other: 20 },
        },
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('falls back to sibling metadata and segment counting when header lacks toolCallSummary', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-share-fixture-'));
    const agentId = 'agent-fixture';
    const blobFile = join(directory, `agent-output.${agentId}.json`);
    try {
      writeFileSync(blobFile, JSON.stringify({ agentId, savedAt: 1000, segments: [{ type: 'tool-call', toolCallId: 'call-fixture', toolName: 'ptah_grep' }] }));
      writeFileSync(join(directory, 'metadata.json'), JSON.stringify({ cliSessions: [{ agentId, cli: 'codex', model: 'fixture-model', startedAt: '1970-01-01T00:00:01.000Z' }] }));
      expect(rowFromLane(blobFile)).toMatchObject({ id: agentId, vendor: 'codex', model: 'fixture-model', startedAt: '1970-01-01T00:00:01.000Z', hasSummary: false, storedTotal: null, total: { total: 1, ptah: 1 } });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('parses relative and ISO windows and filters inclusively', () => {
    expect(parseInstant('2d', 200000000)).toBe(27200000);
    expect(parseInstant('2026-11-27T00:00:00Z')).toBe(Date.parse('2026-11-27T00:00:00Z'));
    const rows = [row('a', 'codex', 10, [{ name: 'ptah_grep', error: false }]), row('b', 'claude', 20, [])];
    expect(filterRowsByWindow(rows, { since: 10, until: 10 }).map((item) => item.id)).toEqual(['a']);
  });

  it('aggregates per row, vendor and overall, and counts undercounted lanes only without summary', () => {
    const report = buildShareReport([
      row('a', 'codex', 10, [{ name: 'ptah_grep', error: false }, { name: 'Read', error: true }]),
      { ...row('b', 'codex', 20, [{ name: 'rg', error: false }]), truncated: true, hasSummary: false, storedTotal: 2 },
      { ...row('c', 'claude', 30, [{ name: 'ToolSearch' }]), truncated: true, hasSummary: true },
    ], 4);
    expect(report.totals).toMatchObject({ total: 4, ptah: 1, native: 3, ptahErrors: 0, unknown: 1, discovery: 1 });
    expect(report.vendorTotals['codex']?.total).toBe(3);
    expect(report.coverage).toMatchObject({ lanesFound: 4, lanesWithSummary: 1, lanesTruncatedOrEmpty: 1, laneTotalMismatches: 1 });
    expect(report.rows[0]?.ptahShare).toBe(50);
    expect(report.coverage.vendorsWithNoData).toContain('grok');
  });

  it('counts only calls strictly before the first successful Ptah call', () => {
    expect(summarizeCalls([
      { name: 'rg' },
      { name: 'ptah_grep', error: true },
      { name: 'mcp__ptah__ptah_search_files', error: false },
      { name: 'Read' },
    ]).beforeFirstPtahSuccess).toBe(2);
  });

  it('returns exit code 1 and a clear message for an empty window', () => {
    expect(emptyWindowExitCode([])).toBe(1);
    expect(EMPTY_WINDOW_MESSAGE).toMatch(/No tool-call data/);
  });

  it('emits the JSON report shape', () => {
    const report = buildShareReport([row('lane-fixture', 'codex', 10, [{ name: 'ptah_grep', error: false }])], 1);
    const value: unknown = JSON.parse(formatShareReport(report, true));
    expect(value).toMatchObject({ totals: { total: 1, ptah: 1 }, vendorTotals: { codex: { ptah: 1 } }, coverage: { lanesFound: 1, lanesWithSummary: 0 }, rows: [{ id: 'lane-fixture', ptahShare: 100 }] });
  });

  it('never returns arguments, results or paths in either output format', () => {
    const secret = 'SYNTHETIC-SECRET-MARKER';
    const inputRow = row('lane-fixture', 'codex', 10, [
      { name: 'Read', input: { path: `/synthetic/${secret}`, result: secret } },
      { name: 'ToolSearch', input: secret },
      { name: `MCP(github/${secret}) query` },
    ]);
    const report = buildShareReport([{ ...inputRow, id: 'lane-fixture' }], 1);
    expect(formatShareReport(report, true)).not.toContain(secret);
    expect(formatShareReport(report, false)).not.toContain(secret);
  });

  it('produces identical ShareTotals from the persisted summary path and the segment-fallback path for the same segments', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-share-parity-'));
    const segments: ToolCallSummarySegment[] = [
      { type: 'tool-call', toolCallId: 'c1', toolName: 'exec_command', toolInput: { cmd: 'rg needle src' } },
      { type: 'tool-result', toolCallId: 'c1' },
      { type: 'tool-call', toolCallId: 'pA', toolName: 'ptah_grep' },
      { type: 'tool-call', toolCallId: 'pA', toolName: 'Read' },
      { type: 'tool-call', toolCallId: 'c2', toolName: 'Run: cat C:/secret/file.txt' },
      { type: 'tool-result-error', toolCallId: 'c2' },
      { type: 'tool-call', toolCallId: 'pB', toolName: 'ptah_read_symbol' },
      { type: 'tool-result', toolCallId: 'pB' },
      { type: 'tool-result', toolCallId: 'pA' },
      { type: 'tool-result-error', toolCallId: 'pA' },
      { type: 'tool-call', toolCallId: '', toolName: 'Glob' },
      { type: 'tool-call', toolCallId: '', toolName: 'ToolSearch' },
      { type: 'tool-result', toolCallId: '' },
      { type: 'tool-call', toolCallId: 'm1', toolName: 'mcp__github__list_issues' },
      { type: 'tool-result', toolCallId: 'm1' },
    ];
    const runtimeSummary = createToolCallSummary();
    for (const seg of segments) {
      if (seg.type === 'tool-call') recordToolCall(runtimeSummary, seg);
      else recordToolResult(runtimeSummary, seg);
    }
    releaseToolCallSummary(runtimeSummary);

    const summaryFile = join(directory, 'agent-output.lane-summary.json');
    const fallbackFile = join(directory, 'agent-output.lane-fallback.json');
    try {
      writeFileSync(summaryFile, JSON.stringify({
        agentId: 'lane-summary',
        cli: 'codex',
        model: 'gpt-5-codex',
        startedAt: '2026-11-27T01:00:00.000Z',
        segmentsTruncated: false,
        toolCallSummary: runtimeSummary,
        savedAt: 1000,
        segments,
      }));
      writeFileSync(fallbackFile, JSON.stringify({
        agentId: 'lane-fallback',
        cli: 'codex',
        model: 'gpt-5-codex',
        startedAt: '2026-11-27T01:00:00.000Z',
        savedAt: 1000,
        segments,
      }));
      const summaryRow = rowFromLane(summaryFile);
      const fallbackRow = rowFromLane(fallbackFile);
      expect(summaryRow.hasSummary).toBe(true);
      expect(fallbackRow.hasSummary).toBe(false);
      expect(fallbackRow.total).toEqual(summaryRow.total);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('preserves total = ptah + native + sum(otherMcp) across discovery, underscore MCP servers, summary, and fallback paths', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-share-invariant-'));
    const calls = [
      { name: 'ptah_grep', error: false },
      { name: 'ToolSearch', error: false },
      { name: 'mcp__docs__list_tools', error: false },
      { name: 'mcp__my_server__do_thing', error: false },
      { name: 'Bash', input: { command: "sed -i 's/a/b/' file.txt" }, error: false },
      { name: 'Bash', input: { command: 'git show HEAD' }, error: false },
    ] as const;

    const summarized = summarizeCalls(calls);
    const otherMcpTotal = Object.values(summarized.otherMcp).reduce((sum, count) => sum + count, 0);
    expect(summarized.total).toBe(6);
    expect(summarized.discovery).toBe(2);
    expect(summarized.otherMcp).toEqual({ docs: 1, my_server: 1 });
    expect(summarized.ptah + summarized.native + otherMcpTotal).toBe(summarized.total);

    const segments: ToolCallSummarySegment[] = calls.flatMap((call, index) => [
      { type: 'tool-call', toolCallId: `c-${index}`, toolName: call.name, ...('input' in call ? { toolInput: call.input } : {}) },
      { type: 'tool-result', toolCallId: `c-${index}` },
    ]);
    const runtimeSummary = createToolCallSummary();
    for (const seg of segments) {
      if (seg.type === 'tool-call') recordToolCall(runtimeSummary, seg);
      else recordToolResult(runtimeSummary, seg);
    }
    releaseToolCallSummary(runtimeSummary);

    const summaryFile = join(directory, 'agent-output.inv-summary.json');
    const fallbackFile = join(directory, 'agent-output.inv-fallback.json');
    try {
      writeFileSync(summaryFile, JSON.stringify({
        agentId: 'inv-summary',
        cli: 'codex',
        model: 'gpt-5-codex',
        startedAt: '2026-11-27T01:00:00.000Z',
        segmentsTruncated: false,
        toolCallSummary: runtimeSummary,
        savedAt: 1000,
        segments,
      }));
      writeFileSync(fallbackFile, JSON.stringify({
        agentId: 'inv-fallback',
        cli: 'codex',
        model: 'gpt-5-codex',
        startedAt: '2026-11-27T01:00:00.000Z',
        savedAt: 1000,
        segments,
      }));
      const summaryRow = rowFromLane(summaryFile);
      const fallbackRow = rowFromLane(fallbackFile);
      expect(fallbackRow.total).toEqual(summaryRow.total);
      for (const total of [summaryRow.total, fallbackRow.total]) {
        const mcpSum = Object.values(total.otherMcp).reduce((sum, count) => sum + count, 0);
        expect(total.ptah + total.native + mcpSum).toBe(total.total);
        expect(total.discovery).toBe(2);
        expect(mcpSum).toBe(2);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('matches --session against the full Claude transcript UUID before display truncation', () => {
    const fullUuid = '12345678-1234-4123-8123-123456789abc';
    const otherUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const transcripts = [
      {
        file: `/tmp/projects/proj/${fullUuid}.jsonl`,
        id: fullUuid.slice(0, 24),
        kind: 'session' as const,
        agentType: null,
        cwd: 'proj',
        startedAt: '2026-11-27T01:00:00.000Z',
        model: 'claude-sonnet',
        requestInputs: [100],
        requests: [],
        missingUsage: 0,
        cached: 0,
        output: 0,
        compactions: 0,
        largestToolOutput: null,
        hasLaneMarker: false,
        badLines: 0,
        toolCalls: [{ id: 't1', name: 'ptah_grep', outcome: 'success' as const, atMs: 1 }],
      },
      {
        file: `/tmp/projects/proj/${otherUuid}.jsonl`,
        id: otherUuid.slice(0, 24),
        kind: 'session' as const,
        agentType: null,
        cwd: 'proj',
        startedAt: '2026-11-27T01:00:00.000Z',
        model: 'claude-sonnet',
        requestInputs: [100],
        requests: [],
        missingUsage: 0,
        cached: 0,
        output: 0,
        compactions: 0,
        largestToolOutput: null,
        hasLaneMarker: false,
        badLines: 0,
        toolCalls: [],
      },
    ];
    const window = { since: Date.parse('2026-11-27T00:00:00.000Z'), until: Date.parse('2026-11-27T02:00:00.000Z'), session: fullUuid };
    const matched = selectClaudeSessionRows(transcripts, window);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.id).toBe(fullUuid.slice(0, 24));
    expect(matched[0]?.sessionId).toBe(fullUuid.slice(0, 24));

    const all = selectClaudeSessionRows(transcripts, { since: window.since, until: window.until });
    expect(all).toHaveLength(2);
  });
});
