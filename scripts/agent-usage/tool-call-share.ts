import { readFileSync, readdirSync } from 'fs';
import { homedir, platform } from 'os';
import { basename, dirname, join } from 'path';
import { claudeProjectsDir, readClaudeStore, type ClaudeToolCall } from './claude-transcript.reader';
import { findAgentOutputBlobs, readAgentOutputBlob } from './agent-output-blob.reader';
import { classifyToolCall, type NativeClass, type ToolCallInput } from './tool-call-classify';
import { isoInstant } from './lane-metrics';

export interface ShareTotals {
  total: number;
  ptah: number;
  native: number;
  ptahErrors: number;
  unknown: number;
  discovery: number;
  beforeFirstPtahSuccess: number;
  nativeSubstitutable: Record<NativeClass, number>;
  otherMcp: Record<string, number>;
}

export interface ShareRow {
  readonly id: string;
  readonly kind: 'lane' | 'session';
  readonly vendor: string;
  readonly model: string | null;
  readonly startedAt: string | null;
  readonly total: ShareTotals;
  readonly truncated: boolean;
  readonly storedTotal: number | null;
  readonly windowAt: number | null;
  readonly sessionId: string | null;
  readonly ptahShare: number;
}

export interface ShareReport {
  readonly rows: readonly ShareRow[];
  readonly vendorTotals: Readonly<Record<string, ShareTotals>>;
  readonly totals: ShareTotals;
  readonly coverage: {
    readonly lanesFound: number;
    readonly lanesTruncatedOrEmpty: number;
    readonly lanesUnreadable: number;
    readonly laneTotalMismatches: number;
    readonly vendorsWithNoData: readonly string[];
  };
}

const knownVendors = ['claude', 'codex', 'copilot', 'cursor', 'antigravity', 'opencode', 'pi', 'grok', 'ptah-cli'] as const;

function outputLabel(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function freshTotals(): ShareTotals {
  return {
    total: 0, ptah: 0, native: 0, ptahErrors: 0, unknown: 0, discovery: 0,
    beforeFirstPtahSuccess: 0,
    nativeSubstitutable: { 'text-search': 0, 'file-read': 0, 'path-listing': 0, 'git-read': 0 },
    otherMcp: {},
  };
}

function addTotals(target: ShareTotals, value: ShareTotals): void {
  for (const key of ['total', 'ptah', 'native', 'ptahErrors', 'unknown', 'discovery', 'beforeFirstPtahSuccess'] as const) target[key] += value[key];
  for (const key of Object.keys(target.nativeSubstitutable) as NativeClass[]) target.nativeSubstitutable[key] += value.nativeSubstitutable[key];
  for (const [key, count] of Object.entries(value.otherMcp)) target.otherMcp[key] = (target.otherMcp[key] ?? 0) + count;
}

export function summarizeCalls(calls: readonly (ToolCallInput & { readonly error?: boolean })[]): ShareTotals {
  const totals = freshTotals();
  let sawPtahSuccess = false;
  for (const call of calls) {
    const classification = classifyToolCall(call);
    totals.total++;
    const isFirstPtahSuccess = classification.operation === 'ptah' && call.error === false;
    if (!sawPtahSuccess && !isFirstPtahSuccess) totals.beforeFirstPtahSuccess++;
    if (classification.operation === 'ptah') {
      totals.ptah++;
      if (call.error === true) totals.ptahErrors++;
      else if (call.error === false) sawPtahSuccess = true;
    } else if (classification.operation === 'discovery') {
      totals.discovery++;
      if (classification.server === 'native') totals.native++;
    } else if (classification.server !== 'native') {
      const server = outputLabel(classification.server.slice('mcp:'.length)) || 'unknown';
      totals.otherMcp[server] = (totals.otherMcp[server] ?? 0) + 1;
    } else {
      totals.native++;
      if (classification.nativeClass) totals.nativeSubstitutable[classification.nativeClass]++;
    }
    if (call.error === undefined) totals.unknown++;
  }
  return totals;
}

export interface WindowOptions { readonly since: number; readonly until: number; readonly agent?: string; readonly session?: string; }

export function parseInstant(value: string, now = Date.now()): number {
  const relative = /^(\d+)(h|d)$/.exec(value);
  if (relative) return now - Number(relative[1]) * (relative[2] === 'd' ? 86_400_000 : 3_600_000);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function inWindow(startedAt: string | null, window: WindowOptions): boolean {
  const parsed = startedAt === null ? NaN : Date.parse(startedAt);
  return Number.isFinite(parsed) && parsed >= window.since && parsed <= window.until;
}

function findLaneMetadata(value: unknown, agentId: string): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findLaneMetadata(item, agentId); if (found) return found; }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record['agentId'] === agentId && typeof record['cli'] === 'string') return record;
  for (const item of Object.values(record)) { const found = findLaneMetadata(item, agentId); if (found) return found; }
  return null;
}

let cachedWorkspaceMetadataFiles: readonly string[] | null = null;

function workspaceMetadataFiles(): readonly string[] {
  if (cachedWorkspaceMetadataFiles !== null) return cachedWorkspaceMetadataFiles;
  const configRoot = platform() === 'win32'
    ? process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming')
    : platform() === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config');
  const appRoots = ['Ptah', 'Ptah Dev'].map((appName) => join(configRoot, appName, 'workspace-storage'));
  const files: string[] = [];
  const visit = (directory: string): void => {
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const candidate = join(directory, entry.name);
        if (entry.isDirectory()) visit(candidate);
        else if (entry.isFile() && entry.name === 'workspace-state.json') files.push(candidate);
      }
    } catch { /* An unavailable app profile contributes no metadata. */ }
  };
  for (const root of appRoots) visit(root);
  cachedWorkspaceMetadataFiles = files;
  return cachedWorkspaceMetadataFiles;
}

function readLaneMetadata(file: string, agentId: string): Record<string, unknown> | null {
  try {
    for (const entry of readdirSync(dirname(file), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('agent-output.')) continue;
      try {
        const found = findLaneMetadata(JSON.parse(readFileSync(join(dirname(file), entry.name), 'utf8')), agentId);
        if (found) return found;
      } catch { /* Ignore unrelated/torn blobs; paths and contents are never reported. */ }
    }
  } catch { /* Missing sibling metadata is represented as unknown. */ }
  for (const metadataFile of workspaceMetadataFiles()) {
    try {
      const found = findLaneMetadata(JSON.parse(readFileSync(metadataFile, 'utf8')), agentId);
      if (found) return found;
    } catch { /* Ignore unrelated or torn profile state without exposing it. */ }
  }
  return null;
}

export function rowFromLane(file: string): ShareRow {
  const blob = readAgentOutputBlob(file);
  const metadata = readLaneMetadata(file, blob.agentId);
  const calls = blob.calls.map((call) => ({ name: call.name, input: call.input, error: call.outcome === 'unknown' ? undefined : call.outcome === 'error' }));
  const startedAt = typeof metadata?.['startedAt'] === 'string' ? isoInstant(Date.parse(metadata['startedAt'])) : null;
  const rawVendor = typeof metadata?.['cli'] === 'string' ? metadata['cli'] : 'unknown';
  const vendor = (knownVendors as readonly string[]).includes(rawVendor) ? rawVendor : 'unknown';
  const model = typeof metadata?.['model'] === 'string' ? outputLabel(metadata['model']) : null;
  const storedTotal = null;
  const windowAt = startedAt === null ? blob.savedAt : Date.parse(startedAt);
  const sessionId = basename(dirname(file));
  const total = summarizeCalls(calls);
  return { id: outputLabel(blob.agentId), kind: 'lane', vendor, model, startedAt, total, ptahShare: Math.round(100 * total.ptah / Math.max(1, total.total)), truncated: blob.truncated || blob.empty || (storedTotal !== null && storedTotal !== calls.length), storedTotal, windowAt, sessionId: outputLabel(sessionId) };
}

function claudeCalls(calls: readonly ClaudeToolCall[]): (ToolCallInput & { error?: boolean })[] {
  return calls.map((call) => ({ name: call.name, input: call.input, error: call.outcome === 'unknown' ? undefined : call.outcome === 'error' }));
}

export function buildShareReport(rows: readonly ShareRow[], lanesFound: number, lanesUnreadable = 0, laneCoverageRows: readonly ShareRow[] = rows): ShareReport {
  const totals = freshTotals();
  const vendorTotals: Record<string, ShareTotals> = {};
  const sparse = laneCoverageRows.filter((row) => row.truncated).length;
  const mismatches = laneCoverageRows.filter((row) => row.storedTotal !== null && row.storedTotal !== row.total.total).length;
  for (const row of rows) {
    addTotals(totals, row.total);
    const vendor = vendorTotals[row.vendor] ?? (vendorTotals[row.vendor] = freshTotals());
    addTotals(vendor, row.total);
  }
  return {
    rows: rows.map((row) => ({ ...row, ptahShare: Math.round((100 * row.total.ptah) / Math.max(1, row.total.total)) })),
    vendorTotals,
    totals,
    coverage: { lanesFound, lanesTruncatedOrEmpty: sparse, lanesUnreadable, laneTotalMismatches: mismatches, vendorsWithNoData: knownVendors.filter((vendor) => vendorTotals[vendor] === undefined) },
  };
}

export function formatShareReport(report: ShareReport, json: boolean): string {
  if (json) return `${JSON.stringify(report, null, 2)}\n`;
  const lines = ['KIND     ID                                     VENDOR       MODEL      START                TOTAL PTAH NATIVE SHARE ERR UNKNOWN DISCOVERY BEFORE_FIRST SEARCH READ LIST GIT'];
  for (const row of report.rows) {
    const t = row.total;
    const share = Math.round(100 * t.ptah / Math.max(1, t.total));
    lines.push(`${row.kind.padEnd(8)} ${row.id.padEnd(38)} ${row.vendor.padEnd(12)} ${(row.model ?? 'unknown').padEnd(10)} ${(row.startedAt ?? 'unknown').slice(0, 19).padEnd(20)} ${t.total} ${t.ptah} ${t.native} ${share}% ${t.ptahErrors} ${t.unknown} ${t.discovery} ${t.beforeFirstPtahSuccess} ${t.nativeSubstitutable['text-search']} ${t.nativeSubstitutable['file-read']} ${t.nativeSubstitutable['path-listing']} ${t.nativeSubstitutable['git-read']}`);
  }
  const totalsText = (totals: ShareTotals): string => `total=${totals.total} ptah=${totals.ptah} native=${totals.native} ptah_errors=${totals.ptahErrors} unknown=${totals.unknown} discovery=${totals.discovery} before_first_ptah_success=${totals.beforeFirstPtahSuccess} text_search=${totals.nativeSubstitutable['text-search']} file_read=${totals.nativeSubstitutable['file-read']} path_listing=${totals.nativeSubstitutable['path-listing']} git_read=${totals.nativeSubstitutable['git-read']} other_mcp=${JSON.stringify(totals.otherMcp)}`;
  lines.push(`OVERALL ${totalsText(report.totals)}`);
  for (const [vendor, totals] of Object.entries(report.vendorTotals)) {
    lines.push(`VENDOR ${vendor} ${totalsText(totals)}`);
  }
  lines.push(`COVERAGE lanes=${report.coverage.lanesFound} truncated_or_empty=${report.coverage.lanesTruncatedOrEmpty} unreadable=${report.coverage.lanesUnreadable} total_mismatches=${report.coverage.laneTotalMismatches} vendors_without_data=${report.coverage.vendorsWithNoData.join(',')}`);
  return `${lines.join('\n')}\n`;
}

export function filterRowsByWindow(rows: readonly ShareRow[], window: WindowOptions): ShareRow[] {
  return rows.filter((row) => row.windowAt !== null && row.windowAt >= window.since && row.windowAt <= window.until);
}

export function emptyWindowExitCode(rows: readonly ShareRow[]): 0 | 1 { return rows.length === 0 ? 1 : 0; }
export const EMPTY_WINDOW_MESSAGE = 'No tool-call data in the requested window.';

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const get = (name: string): string | undefined => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const now = Date.now();
  const since = parseInstant(get('--since') ?? '24h', now);
  const until = get('--until') ? Date.parse(get('--until') ?? '') : now;
  if (!Number.isFinite(since) || !Number.isFinite(until)) { process.stderr.write('Invalid time window.\n'); process.exitCode = 1; return; }
  const window = { since, until, agent: get('--agent'), session: get('--session') };
  const paths = findAgentOutputBlobs();
  const laneRows: ShareRow[] = [];
  let unreadable = 0;
  for (const file of paths) {
    try { laneRows.push(rowFromLane(file)); }
    catch { unreadable++; }
  }
  const lanes = laneRows.filter((row) => (!window.agent || row.id === window.agent) && (!window.session || row.sessionId === window.session) && row.windowAt !== null && row.windowAt >= window.since && row.windowAt <= window.until);
  const claude = readClaudeStore(claudeProjectsDir(), since).transcripts
    .filter((summary) => summary.kind === 'session' && !summary.hasLaneMarker && inWindow(summary.startedAt, window))
    .filter((summary) => !window.session || summary.id === window.session)
    .filter(() => !window.agent)
    .map((summary): ShareRow => { const total = summarizeCalls(claudeCalls(summary.toolCalls ?? [])); const id = outputLabel(summary.id); const startedAt = summary.startedAt === null ? null : isoInstant(Date.parse(summary.startedAt)); return { id, kind: 'session', vendor: 'claude', model: summary.model ? outputLabel(summary.model) : null, startedAt, total, ptahShare: Math.round(100 * total.ptah / Math.max(1, total.total)), truncated: false, storedTotal: null, windowAt: startedAt === null ? null : Date.parse(startedAt), sessionId: id }; });
  const report = buildShareReport(filterRowsByWindow([...lanes, ...claude], window), paths.length, unreadable, laneRows);
  if (emptyWindowExitCode(report.rows) === 1) { process.stderr.write(`${EMPTY_WINDOW_MESSAGE}\n`); process.exitCode = 1; return; }
  process.stdout.write(formatShareReport(report, json));
}

if (require.main === module) main();

