/**
 * Parser/summary spec for the streaming-load metrics collector.
 *
 * Every fixture line below is copied verbatim from the real logs in
 * `%APPDATA%/ptah/logs` and `%APPDATA%/Ptah Dev/logs` (2026-09 .. 2026-11-06),
 * so a change to a log format breaks this spec instead of silently zeroing a
 * metric. Run with `npm run test:scripts -- --testPathPatterns=streaming-load`.
 */

interface ParsedEvent {
  readonly kind: string;
  readonly ts: number;
  readonly [key: string]: unknown;
}

interface Summary {
  readonly taskIndex: { byTrigger: Record<string, number>; totalMs: { p50: number | null; max: number | null }; scanMs: { p50: number | null; max: number | null }; coalesced: number; roots: number; maxActiveRoots: number | null };
  readonly planLimits: { bySource: Record<string, number>; byPath: Record<string, number>; durationMs: { p50: number | null; max: number | null }; scopes: number };
  readonly planUsageCache: { byOutcome: Record<string, number>; byBypass: Record<string, number>; byProviderId: Record<string, number> };
  readonly eventLoop: {
    warnings: number;
    maxMs: number;
    maxOfP99Ms: number;
    over1s: number;
    over5s: number;
  };
  readonly watchdog: {
    hangEvents: number;
    recoveredEvents: number;
    unrecoveredHangs: number;
    totalBlockedMs: number;
    maxBlockedMs: number;
  };
  readonly slowRpc: {
    total: number;
    suspectDurations: number;
    byMethod: Record<string, { count: number; maxMs: number; p50Ms: number }>;
  };
  readonly rpcTimeouts: { total: number; byMethod: Record<string, number> };
  readonly gitGate: {
    saturatedEvents: number;
    maxWaitMs: number;
    maxQueued: number;
  };
  readonly sqlite: { slowStatements: number; maxMs: number; over1s: number };
  readonly rendererFrames: { warnings: number; maxMs: number };
  readonly backgroundWork: { laggingEvents: number };
  readonly logVolume: {
    lines: number;
    peakLinesPerMin: number;
    stormMinutes: number;
  };
}

interface ThresholdResult {
  metric: string;
  value: number;
  pass: boolean;
}

interface Collector {
  readonly events: ParsedEvent[];
}

interface MetricsLib {
  parseElectronLogLine(line: string): ParsedEvent | null;
  parseHangLine(line: string): ParsedEvent | null;
  createCollector(): Collector;
  addElectronLine(collector: Collector, line: string): void;
  addHangLine(collector: Collector, line: string): void;
  summarize(
    collector: Collector,
    window?: { fromMs?: number; toMs?: number },
    options?: { stormLinesPerMin?: number },
  ): Summary;
  evaluateThresholds(
    summary: Summary,
    thresholds: Record<string, { max?: number; min?: number }>,
  ): ThresholdResult[];
  toMarkdown(summary: Summary, results: ThresholdResult[] | null): string;
}

const lib = require('./streaming-load-metrics-lib.cjs') as MetricsLib;

// New diagnostics have no historical samples; these fixtures follow Logger.log's
// Electron daily-log format: timestamp, padded level, timestamp, message: JSON.
const NEW_TIME = '[2026-11-16T10:00:00.000Z] [DEBUG] 2026-11-16T10:00:00.000Z - ';
const REBUILD = `${NEW_TIME}[task-specs] index rebuild timing: {"trigger":"writer","rootId":"a1b2c3d4","activeRoots":2,"scanMs":12,"totalMs":20,"coalesced":3,"waitedMs":4,"carriers":5,"rows":4}`;
const OLD_REBUILD = `${NEW_TIME}[task-specs] index rebuild timing: {"trigger":"writer","totalMs":20,"coalesced":0,"waitedMs":0,"carriers":5,"rows":4}`;
const SNAPSHOT = `${NEW_TIME}[PlanLimitsSnapshot] snapshot served: {"source":"pull","path":"assembled","scopeId":"b1c2d3e4","durationMs":30,"discoveryMs":10,"readsMs":20,"discoveryIncomplete":false}`;
const OLD_SNAPSHOT = `${NEW_TIME}[PlanLimitsSnapshot] snapshot served: {"source":"pull","path":"assembled","durationMs":30,"discoveryMs":10,"readsMs":20,"discoveryIncomplete":false}`;
const CACHE = `${NEW_TIME}[PlanUsage] owner snapshot request: {"outcome":"flight-start","bypass":"empty","providerId":"codex","refresh":false,"hits":0,"joins":0,"starts":1}`;

describe('new diagnostic lines', () => {
  it('aggregates the Electron logger format and renders each section', () => {
    const collector = lib.createCollector();
    for (const line of [REBUILD, SNAPSHOT, CACHE]) lib.addElectronLine(collector, line);
    const summary = lib.summarize(collector);
    expect(summary.taskIndex).toMatchObject({ byTrigger: { writer: 1 }, roots: 1, coalesced: 3, scanMs: { p50: 12, max: 12 } });
    expect(summary.planLimits).toMatchObject({ bySource: { pull: 1 }, byPath: { assembled: 1 }, scopes: 1 });
    expect(summary.planUsageCache).toMatchObject({ byOutcome: { 'flight-start': 1 }, byBypass: { empty: 1 }, byProviderId: { codex: 1 } });
    expect(lib.toMarkdown(summary, null)).toContain('### Task index rebuilds');
    expect(lib.toMarkdown(summary, null)).toContain('### Plan limits snapshots');
    expect(lib.toMarkdown(summary, null)).toContain('### Plan usage owner cache');
  });

  it('marks unavailable rebuild fields in old-format logs', () => {
    const summary = lib.summarize(collect([OLD_REBUILD]));
    expect(summary.taskIndex).toMatchObject({
      roots: 0,
      scanMs: { p50: null, max: null },
      maxActiveRoots: null,
      totalMs: { p50: 20, max: 20 },
    });
    const markdown = lib.toMarkdown(summary, null);
    expect(markdown).toContain('scan ms p50/max: n/a/n/a');
    expect(markdown).toContain('max active roots: n/a');
    expect(markdown).not.toContain('null');
  });

  it('excludes old-format rebuilds from scan duration samples', () => {
    const summary = lib.summarize(collect([OLD_REBUILD, REBUILD]));
    expect(summary.taskIndex).toMatchObject({ roots: 1, scanMs: { p50: 12, max: 12 } });
  });

  it('does not count plan limits snapshots without a scope id', () => {
    const summary = lib.summarize(collect([OLD_SNAPSHOT]));
    expect(summary.planLimits.scopes).toBe(0);
  });
});

const LAG_LINE =
  '[2026-11-04T22:00:17.005Z] [WARN ] 2026-11-04T22:00:17.005Z - [event-loop] lag: {"maxMs":2478.8,"p99Ms":22.4}';
const LAG_LINE_8S =
  '[2026-11-05T22:00:00.000Z] [WARN ] 2026-11-05T22:00:00.000Z - [event-loop] lag: {"maxMs":8275,"p99Ms":8275}';
const SLOW_RPC =
  '[2026-11-04T22:00:43.189Z] [WARN ] 2026-11-04T22:00:43.189Z - [RPC] slow handler: {"method":"provider:getPlanLimits","durationMs":12192.1}';
const SUSPECT_RPC =
  '[2026-11-04T22:00:04.994Z] [WARN ] 2026-11-04T22:00:04.994Z - [RPC] slow handler: {"method":"git:info","durationMs":3252378}';
const GATE =
  '[2026-11-04T22:00:50.378Z] [WARN ] 2026-11-04T22:00:50.378Z - [GitProcessGate] saturated: waited 35844ms for a git slot (live=4, queued=172, max=4)';
const BG_LAG =
  '[2026-11-04T22:00:17.005Z] [INFO ] 2026-11-04T22:00:17.005Z - [background-work] lagging — deferring background work: {"p99Ms":22.4,"maxMs":2478.8,"trigger":"freeze"}';
const SQLITE =
  '[2026-11-05T22:32:24.319Z] [WARN ] 2026-11-05T22:32:24.319Z - [SQLite] slow statement: {"sql":"SELECT rowid AS rowid, distance AS distance FROM memory_chunks_vec\\n         WHERE embedding MATCH ? ORDER BY distance AS","op":"all","durationMs":1309.5,"rows":40,"failed":false,"suppressedSinceLastLog":5}';
const SQLITE_TXN =
  '[2026-11-05T22:33:51.014Z] [WARN ] 2026-11-05T22:33:51.014Z - [SQLite] slow statement: {"sql":"<transaction anonymous>","op":"transaction","durationMs":117,"failed":false,"suppressedSinceLastLog":0}';
const RPC_TIMEOUT =
  '[2026-11-06T02:26:21.136Z] [ERROR] 2026-11-06T02:26:21.136Z - [renderer] console.error: {"windowId":1,"message":"[ClaudeRpcService] RPC timeout for method: boot:getReadiness","source":"file:///D:/projects/ptah-extension/.claude-worktrees/inspector-sidebar-styling/dist/apps/ptah-electron/renderer/chunk-VID42JAP.js:8550"}';
const RPC_TIMEOUT_DUP =
  '[2026-11-06T02:26:21.138Z] [ERROR] 2026-11-06T02:26:21.138Z - [renderer] console.error: {"windowId":1,"message":"[ClaudeRpcService] RPC timeout for method: boot:getReadiness","source":"file:///D:/projects/ptah-extension/.claude-worktrees/inspector-sidebar-styling/dist/apps/ptah-electron/renderer/chunk-VID42JAP.js:8550"}';
const CONTINUATION =
  '[2026-11-06T02:26:21.136Z]   Context: {"windowId":1,"message":"[ClaudeRpcService] RPC timeout for method: boot:getReadiness"}';
const PLAIN =
  '[2026-11-04T22:00:04.125Z] [INFO ] 2026-11-04T22:00:04.125Z - [JsonlReader] Scanning for agent files: {"sessionsDir":"C:\\\\Users\\\\dev\\\\.claude\\\\projects\\\\D--projects-ptah-extension","agentFilesFound":2,"source":"nested"}';

const HANG =
  '{"time":"2026-09-20T16:11:23.394Z","source":"main-loop-watchdog","event":"hang","blockedForMs":5168,"breadcrumbs":{"lastLag":"max=1823.5ms p99=1823.5ms at 2026-09-20T16:11:09.070Z"}}';
const RECOVERED =
  '{"time":"2026-09-20T16:11:50.388Z","source":"main-loop-watchdog","event":"recovered","blockedForMs":32189,"breadcrumbs":{"lastLag":"max=31809.6ms p99=31809.6ms at 2026-09-20T16:11:50.354Z"}}';

function collect(electron: string[], hang: string[] = []): Collector {
  const c = lib.createCollector();
  for (const l of electron) lib.addElectronLine(c, l);
  for (const l of hang) lib.addHangLine(c, l);
  return c;
}

describe('streaming-load metrics parser', () => {
  it('parses an event-loop lag warning', () => {
    expect(lib.parseElectronLogLine(LAG_LINE)).toMatchObject({
      kind: 'eventLoopLag',
      maxMs: 2478.8,
      p99Ms: 22.4,
      ts: Date.parse('2026-11-04T22:00:17.005Z'),
    });
  });

  it('parses slow RPC handlers, git gate saturation and background lag', () => {
    expect(lib.parseElectronLogLine(SLOW_RPC)).toMatchObject({
      kind: 'slowRpc',
      method: 'provider:getPlanLimits',
      durationMs: 12192.1,
    });
    expect(lib.parseElectronLogLine(GATE)).toMatchObject({
      kind: 'gitGateSaturated',
      waitedMs: 35844,
      live: 4,
      queued: 172,
      max: 4,
    });
    expect(lib.parseElectronLogLine(BG_LAG)).toMatchObject({
      kind: 'backgroundLag',
      trigger: 'freeze',
    });
  });

  it('parses slow SQLite statements with their escaped newlines', () => {
    const ev = lib.parseElectronLogLine(SQLITE);
    expect(ev).toMatchObject({
      kind: 'slowSqlite',
      durationMs: 1309.5,
      op: 'all',
      rows: 40,
      suppressed: 5,
    });
    expect(String(ev?.['sql'])).toContain('memory_chunks_vec');
    expect(lib.parseElectronLogLine(SQLITE_TXN)).toMatchObject({
      kind: 'slowSqlite',
      op: 'transaction',
    });
  });

  it('extracts the method from a renderer RPC timeout', () => {
    expect(lib.parseElectronLogLine(RPC_TIMEOUT)).toMatchObject({
      kind: 'rpcTimeout',
      method: 'boot:getReadiness',
      windowId: 1,
    });
  });

  it('ignores continuation lines and classifies other records as plain lines', () => {
    expect(lib.parseElectronLogLine(CONTINUATION)).toBeNull();
    expect(lib.parseElectronLogLine('not a log line')).toBeNull();
    expect(lib.parseElectronLogLine(PLAIN)).toMatchObject({ kind: 'line' });
  });

  it('recognises a RendererFrame warning without depending on its exact payload', () => {
    const line =
      '[2026-11-06T05:00:00.000Z] [WARN ] 2026-11-06T05:00:00.000Z - [RendererFrame] long frame: {"maxMs":312.5,"count":3}';
    expect(lib.parseElectronLogLine(line)).toMatchObject({
      kind: 'rendererFrame',
      ms: 312.5,
    });
  });

  it('reads the frame duration from inside the renderer console envelope', () => {
    const inner = JSON.stringify({
      windowId: 1,
      message:
        '[2026-11-06T05:00:00.000Z] [WARN] RendererFrame: long frame {"durationMs":412,"entryType":"long-animation-frame"}',
      source: 'file:///renderer/main.js',
    });
    const line = `[2026-11-06T05:00:00.000Z] [WARN ] 2026-11-06T05:00:00.000Z - [renderer] console.warning: ${inner}`;
    expect(lib.parseElectronLogLine(line)).toMatchObject({
      kind: 'rendererFrame',
      ms: 412,
    });
  });

  it('parses watchdog lines and rejects foreign JSON', () => {
    expect(lib.parseHangLine(HANG)).toMatchObject({
      kind: 'watchdog',
      event: 'hang',
      blockedForMs: 5168,
    });
    expect(lib.parseHangLine(RECOVERED)).toMatchObject({
      event: 'recovered',
      blockedForMs: 32189,
    });
    expect(lib.parseHangLine('{"source":"other"}')).toBeNull();
    expect(lib.parseHangLine('garbage')).toBeNull();
  });
});

describe('streaming-load metrics summary', () => {
  const all = collect(
    [
      LAG_LINE,
      LAG_LINE_8S,
      SLOW_RPC,
      SUSPECT_RPC,
      GATE,
      BG_LAG,
      SQLITE,
      SQLITE_TXN,
      RPC_TIMEOUT,
      RPC_TIMEOUT_DUP,
      CONTINUATION,
      PLAIN,
    ],
    [HANG, RECOVERED],
  );

  it('counts lag buckets, watchdog blocks and gate waits', () => {
    const s = lib.summarize(all);
    expect(s.eventLoop).toMatchObject({
      warnings: 2,
      maxMs: 8275,
      over1s: 2,
      over5s: 1,
    });
    expect(s.watchdog).toMatchObject({
      hangEvents: 1,
      recoveredEvents: 1,
      unrecoveredHangs: 0,
      totalBlockedMs: 32189,
      maxBlockedMs: 32189,
    });
    expect(s.gitGate).toMatchObject({
      saturatedEvents: 1,
      maxWaitMs: 35844,
      maxQueued: 172,
    });
    expect(s.backgroundWork.laggingEvents).toBe(1);
    expect(s.sqlite).toMatchObject({ slowStatements: 2, maxMs: 1309.5, over1s: 1 });
  });

  it('excludes clock-artefact slow handler durations (> 10 min) from stats', () => {
    const s = lib.summarize(all);
    expect(s.slowRpc.total).toBe(1);
    expect(s.slowRpc.suspectDurations).toBe(1);
    expect(s.slowRpc.byMethod['provider:getPlanLimits']).toMatchObject({
      count: 1,
      maxMs: 12192.1,
    });
    expect(s.slowRpc.byMethod['git:info']).toBeUndefined();
  });

  it('dedupes the renderer RPC timeout that is logged twice in one second', () => {
    const s = lib.summarize(all);
    expect(s.rpcTimeouts).toEqual({
      total: 1,
      byMethod: { 'boot:getReadiness': 1 },
    });
  });

  it('applies the time window', () => {
    const s = lib.summarize(all, {
      fromMs: Date.parse('2026-11-05T00:00:00Z'),
      toMs: Date.parse('2026-11-06T00:00:00Z'),
    });
    expect(s.eventLoop.warnings).toBe(1);
    expect(s.eventLoop.maxMs).toBe(8275);
    expect(s.gitGate.saturatedEvents).toBe(0);
    expect(s.watchdog.hangEvents).toBe(0);
  });

  it('flags an unrecovered hang', () => {
    const s = lib.summarize(collect([], [HANG]));
    expect(s.watchdog).toMatchObject({
      hangEvents: 1,
      recoveredEvents: 0,
      unrecoveredHangs: 1,
      maxBlockedMs: 5168,
    });
  });

  it('detects a log storm from the per-minute line count', () => {
    const lines: string[] = [];
    for (let i = 0; i < 700; i++) {
      lines.push(
        `[2026-11-05T10:00:${String(i % 60).padStart(2, '0')}.000Z] [INFO ] 2026-11-05T10:00:${String(i % 60).padStart(2, '0')}.000Z - [spam] tick ${i}`,
      );
    }
    const s = lib.summarize(collect(lines), {}, { stormLinesPerMin: 500 });
    expect(s.logVolume.peakLinesPerMin).toBe(700);
    expect(s.logVolume.stormMinutes).toBe(1);
  });
});

describe('streaming-load threshold evaluation', () => {
  const summary = lib.summarize(
    collect([LAG_LINE_8S, SLOW_RPC, RPC_TIMEOUT], [HANG, RECOVERED]),
  );

  it('fails when a metric is over its limit and passes when under', () => {
    const results = lib.evaluateThresholds(summary, {
      'watchdog.hangEvents': { max: 0 },
      'eventLoop.maxMs': { max: 500 },
      'gitGate.maxWaitMs': { max: 1000 },
    });
    const byMetric = Object.fromEntries(results.map((r) => [r.metric, r.pass]));
    expect(byMetric).toEqual({
      'watchdog.hangEvents': false,
      'eventLoop.maxMs': false,
      'gitGate.maxWaitMs': true,
    });
  });

  it('expands a per-method wildcard threshold', () => {
    const results = lib.evaluateThresholds(summary, {
      'rpc.*.maxMs': { max: 5000 },
    });
    expect(results).toEqual([
      expect.objectContaining({
        metric: 'rpc.provider:getPlanLimits.maxMs',
        pass: false,
      }),
    ]);
  });

  it('renders markdown with a FAIL verdict', () => {
    const results = lib.evaluateThresholds(summary, {
      'rpcTimeouts.total': { max: 0 },
    });
    expect(lib.toMarkdown(summary, results)).toContain('Overall: FAIL');
  });
});
