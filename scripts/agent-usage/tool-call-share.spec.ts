import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildShareReport,
  emptyWindowExitCode,
  EMPTY_WINDOW_MESSAGE,
  filterRowsByWindow,
  formatShareReport,
  parseInstant,
  rowFromLane,
  summarizeCalls,
  type ShareRow,
} from './tool-call-share';

const row = (id: string, vendor: string, at: number, calls: Parameters<typeof summarizeCalls>[0]): ShareRow => {
  const total = summarizeCalls(calls);
  return { id, kind: 'lane', vendor, model: null, startedAt: null, total, ptahShare: 0, truncated: false, storedTotal: null, windowAt: at, sessionId: 'fixture-session' };
};

describe('tool-call-share', () => {
  it('joins synthetic lane metadata by agent id without inventing a stored call total', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-share-fixture-'));
    const agentId = 'agent-fixture';
    const blobFile = join(directory, `agent-output.${agentId}.json`);
    try {
      writeFileSync(blobFile, JSON.stringify({ agentId, savedAt: 1000, segments: [{ type: 'tool-call', toolCallId: 'call-fixture', toolName: 'ptah_grep' }] }));
      writeFileSync(join(directory, 'metadata.json'), JSON.stringify({ cliSessions: [{ agentId, cli: 'codex', model: 'fixture-model', startedAt: '1970-01-01T00:00:01.000Z' }] }));
      expect(rowFromLane(blobFile)).toMatchObject({ id: agentId, vendor: 'codex', model: 'fixture-model', startedAt: '1970-01-01T00:00:01.000Z', storedTotal: null, total: { total: 1, ptah: 1 } });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('parses relative and ISO windows and filters inclusively', () => {
    expect(parseInstant('2d', 200000000)).toBe(27200000);
    expect(parseInstant('2026-11-27T00:00:00Z')).toBe(Date.parse('2026-11-27T00:00:00Z'));
    const rows = [row('a', 'codex', 10, [{ name: 'ptah_grep', error: false }]), row('b', 'claude', 20, [])];
    expect(filterRowsByWindow(rows, { since: 10, until: 10 }).map((item) => item.id)).toEqual(['a']);
  });

  it('aggregates per row, vendor and overall, and reports coverage', () => {
    const report = buildShareReport([
      row('a', 'codex', 10, [{ name: 'ptah_grep', error: false }, { name: 'Read', error: true }]),
      { ...row('b', 'codex', 20, [{ name: 'rg', error: false }]), truncated: true, storedTotal: 2 },
      row('c', 'claude', 30, [{ name: 'ToolSearch' }]),
    ], 4);
    expect(report.totals).toMatchObject({ total: 4, ptah: 1, native: 3, ptahErrors: 0, unknown: 1, discovery: 1 });
    expect(report.vendorTotals['codex']?.total).toBe(3);
    expect(report.coverage).toMatchObject({ lanesFound: 4, lanesTruncatedOrEmpty: 1, laneTotalMismatches: 1 });
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
    expect(value).toMatchObject({ totals: { total: 1, ptah: 1 }, vendorTotals: { codex: { ptah: 1 } }, coverage: { lanesFound: 1 }, rows: [{ id: 'lane-fixture', ptahShare: 100 }] });
  });

  it('never returns arguments, results or paths in either output format', () => {
    const secret = 'SYNTHETIC-SECRET-MARKER';
    const inputRow = row('lane-fixture', 'codex', 10, [
      { name: 'Read', input: { path: `/synthetic/${secret}`, result: secret } },
      { name: 'ToolSearch', input: secret },
    ]);
    const report = buildShareReport([{ ...inputRow, id: 'lane-fixture' }], 1);
    expect(formatShareReport(report, true)).not.toContain(secret);
    expect(formatShareReport(report, false)).not.toContain(secret);
  });
});
