import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import {
  classifyToolCall,
  normalizeToolSummaryKey,
  summarizeToolCallSegments,
  type ToolCallSummary,
  type ToolCallSummarySegment,
} from '@ptah-extension/shared';

export interface AgentOutputBlob {
  readonly agentId: string;
  readonly cli: string | null;
  readonly model: string | null;
  readonly startedAt: string | null;
  readonly segmentsTruncated: boolean | null;
  readonly toolCallSummary: ToolCallSummary | null;
  readonly fallbackSummary: ToolCallSummary;
  readonly empty: boolean;
  readonly truncated: boolean;
  readonly savedAt: number | null;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseToolCallSummary(value: unknown): ToolCallSummary | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const totalCalls = finiteNumber(record['totalCalls']);
  const ptahCalls = finiteNumber(record['ptahCalls']);
  const nativeCalls = finiteNumber(record['nativeCalls']);
  const otherMcpCalls = finiteNumber(record['otherMcpCalls']);
  const discoveryCalls = finiteNumber(record['discoveryCalls']);
  const ptahErrors = finiteNumber(record['ptahErrors']);
  const nativeErrors = finiteNumber(record['nativeErrors']);
  const unknownOutcomes = finiteNumber(record['unknownOutcomes']);
  const byToolOverflow = finiteNumber(record['byToolOverflow']);
  const rawBefore = record['callsBeforeFirstPtahSuccess'];
  const callsBeforeFirstPtahSuccess = rawBefore === null ? null : finiteNumber(rawBefore);
  if (
    totalCalls === null || ptahCalls === null || nativeCalls === null ||
    otherMcpCalls === null || discoveryCalls === null || ptahErrors === null ||
    nativeErrors === null || unknownOutcomes === null || byToolOverflow === null ||
    (rawBefore !== null && callsBeforeFirstPtahSuccess === null)
  ) return null;

  const rawSub = object(record['substitutableNative']);
  const textSearch = finiteNumber(rawSub['textSearch']);
  const fileRead = finiteNumber(rawSub['fileRead']);
  const pathListing = finiteNumber(rawSub['pathListing']);
  const gitRead = finiteNumber(rawSub['gitRead']);
  if (textSearch === null || fileRead === null || pathListing === null || gitRead === null) return null;

  const rawByTool = record['byTool'];
  if (rawByTool === null || typeof rawByTool !== 'object' || Array.isArray(rawByTool)) return null;
  const byTool: Record<string, { calls: number; errors: number }> = {};
  for (const [name, entry] of Object.entries(rawByTool as Record<string, unknown>)) {
    const entryObj = object(entry);
    const calls = finiteNumber(entryObj['calls']);
    const errors = finiteNumber(entryObj['errors']);
    if (calls === null || errors === null) return null;
    const safeName = normalizeToolSummaryKey(name, classifyToolCall({ name }).server);
    if (Object.prototype.hasOwnProperty.call(byTool, safeName)) {
      const existing = byTool[safeName];
      if (existing) {
        existing.calls += calls;
        existing.errors += errors;
      }
    } else {
      Object.defineProperty(byTool, safeName, {
        value: { calls, errors },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  return {
    totalCalls,
    ptahCalls,
    nativeCalls,
    otherMcpCalls,
    discoveryCalls,
    ptahErrors,
    nativeErrors,
    unknownOutcomes,
    callsBeforeFirstPtahSuccess,
    substitutableNative: { textSearch, fileRead, pathListing, gitRead },
    byTool,
    byToolOverflow,
  };
}

function toSummarySegment(value: unknown): ToolCallSummarySegment | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const segment = value as Record<string, unknown>;
  if (typeof segment['type'] !== 'string') return null;
  return {
    type: segment['type'],
    ...(typeof segment['toolCallId'] === 'string' ? { toolCallId: segment['toolCallId'] } : {}),
    ...(typeof segment['toolName'] === 'string' ? { toolName: segment['toolName'] } : {}),
    ...(segment['toolInput'] !== undefined ? { toolInput: segment['toolInput'] } : {}),
    ...(segment['toolArgs'] !== undefined ? { toolArgs: segment['toolArgs'] } : {}),
    ...(typeof segment['exitCode'] === 'number' && Number.isFinite(segment['exitCode'])
      ? { exitCode: segment['exitCode'] }
      : {}),
  };
}

export function readAgentOutputBlob(file: string): AgentOutputBlob {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error('Unable to parse agent output blob JSON'); }
  const root = object(parsed);
  const rawSegments = Array.isArray(root['segments']) ? root['segments'] : [];
  const summarySegments: ToolCallSummarySegment[] = [];
  // Tool inputs stay in memory only for classification; the reader returns counters, never raw names or inputs.
  for (const value of rawSegments) {
    const segment = toSummarySegment(value);
    if (segment) summarySegments.push(segment);
  }
  const segmentsTruncated = typeof root['segmentsTruncated'] === 'boolean' ? root['segmentsTruncated'] : null;
  return {
    agentId: typeof root['agentId'] === 'string' ? root['agentId'] : '',
    cli: typeof root['cli'] === 'string' ? root['cli'] : null,
    model: typeof root['model'] === 'string' ? root['model'] : null,
    startedAt: typeof root['startedAt'] === 'string' ? root['startedAt'] : null,
    segmentsTruncated,
    toolCallSummary: parseToolCallSummary(root['toolCallSummary']),
    fallbackSummary: summarizeToolCallSegments(summarySegments),
    empty: rawSegments.length === 0,
    truncated: segmentsTruncated ?? rawSegments.length >= 500,
    savedAt: typeof root['savedAt'] === 'number' ? root['savedAt'] : null,
  };
}

export function defaultAgentOutputBlobRoot(): string {
  const override = process.env['PTAH_SESSIONS_DB_PATH'];
  if (override !== undefined && override.trim() !== '') {
    return join(dirname(resolve(override.trim())), 'sessions');
  }
  return join(homedir(), '.ptah', 'state', 'sessions');
}

export function findAgentOutputBlobs(root = defaultAgentOutputBlobRoot()): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const session of readdirSync(root, { withFileTypes: true })) {
    if (!session.isDirectory()) continue;
    const directory = join(root, session.name);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && /^agent-output\..+\.json$/.test(entry.name)) files.push(join(directory, entry.name));
    }
  }
  return files;
}
