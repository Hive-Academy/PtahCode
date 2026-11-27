import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AgentToolCall {
  readonly id: string;
  readonly name: string;
  readonly input?: unknown;
  readonly outcome: 'success' | 'error' | 'unknown';
}

export interface AgentOutputBlob {
  readonly agentId: string;
  readonly calls: readonly AgentToolCall[];
  readonly empty: boolean;
  readonly truncated: boolean;
  readonly savedAt: number | null;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function readAgentOutputBlob(file: string): AgentOutputBlob {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error('Unable to parse agent output blob JSON'); }
  const root = object(parsed);
  const segments = Array.isArray(root['segments']) ? root['segments'] : [];
  const calls: AgentToolCall[] = [];
  const byId = new Map<string, number>();
  for (const value of segments) {
    const segment = object(value);
    const type = segment['type'];
    const callId = typeof segment['toolCallId'] === 'string' ? segment['toolCallId'] : `#${calls.length}`;
    if (type === 'tool-call') {
      const call: AgentToolCall = {
        id: callId,
        name: typeof segment['toolName'] === 'string' ? segment['toolName'] : 'unknown',
        ...(segment['toolInput'] !== undefined ? { input: segment['toolInput'] } : { input: segment['toolArgs'] }),
        outcome: 'unknown',
      };
      byId.set(callId, calls.length);
      calls.push(call);
    } else if (type === 'tool-result-error' || type === 'tool-result') {
      const index = byId.get(callId);
      const call = index === undefined ? undefined : calls[index];
      if (index !== undefined && call !== undefined) calls[index] = { ...call, outcome: type === 'tool-result-error' ? 'error' : 'success' };
    }
  }
  return {
    agentId: typeof root['agentId'] === 'string' ? root['agentId'] : '',
    calls,
    empty: segments.length === 0,
    truncated: segments.length >= 500,
    savedAt: typeof root['savedAt'] === 'number' ? root['savedAt'] : null,
  };
}

export function findAgentOutputBlobs(root = join(homedir(), '.ptah', 'state', 'sessions')): string[] {
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
