import * as path from 'node:path';
import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import { insideNotesWorkspace } from './subagent-notes-path';

const MAX_DECLARED = 20;
const fileInput = z.object({ file_path: z.string().min(1) });

/** Only explicit single-path declarations, never prose or glob patterns. */
export function parseSubagentDeliverables(prompt: unknown): readonly string[] {
  if (typeof prompt !== 'string') return [];
  const result: string[] = [];
  let inList = false;
  for (const line of prompt.split(/\r?\n/)) {
    if (/^\s*Deliverables:\s*$/i.test(line)) { inList = true; continue; }
    const single = /^\s*Deliverable:\s*(.+)$/i.exec(line);
    const bullet = inList ? /^\s*[-*+]\s+(.+)$/.exec(line) : null;
    if (!single && !bullet) { inList = false; continue; }
    const raw = (single?.[1] ?? bullet?.[1] ?? '').trim();
    const quoted = /^`[^`]+`$/.test(raw);
    const value = quoted ? raw.slice(1, -1) : raw;
    if (/^(?![a-z]:[\\/])[a-z][a-z0-9+.-]*:/i.test(value) || (!quoted && (/\s/.test(value) || !/[.\\/]/.test(value)))) continue;
    if (value && !/[`*?{}]/.test(value) && !['[', ']', '\0'].some((char) => value.includes(char))) result.push(value);
    if (result.length === MAX_DECLARED) break;
  }
  return result;
}

/** Successful pre-warning mutations only; no attempted or failed tool calls. */
export class SubagentDeliverables {
  private readonly agents = new Map<string, { sessionId: string; paths: Set<string> }>();

  record(sessionId: string, agentId: string, tool: string, input: unknown, workspace: string | undefined, logger?: Pick<Logger, 'debug'>): void {
    if (!workspace || (tool !== 'Write' && tool !== 'Edit')) return;
    const parsed = fileInput.safeParse(input);
    if (!parsed.success) return;
    const file = path.resolve(workspace, parsed.data.file_path);
    try { if (!insideNotesWorkspace(workspace, file)) return; }
    catch (error: unknown) {
      // degradation-audit: reported — debug logging explains why a mutation is excluded.
      logger?.debug('[SubagentDeliverables] Mutation containment unavailable; path excluded', { errorKind: error instanceof Error ? error.name : 'unknown' });
      return;
    }
    let entry = this.agents.get(agentId);
    if (!entry) { entry = { sessionId, paths: new Set() }; this.agents.set(agentId, entry); }
    const key = process.platform === 'win32' ? file.toLowerCase() : file;
    const previous = [...entry.paths].find((stored) => (process.platform === 'win32' ? stored.toLowerCase() : stored) === key);
    if (previous !== undefined) entry.paths.delete(previous);
    entry.paths.add(file);
    while (entry.paths.size > 50) {
      const oldest = entry.paths.values().next().value;
      if (oldest !== undefined) entry.paths.delete(oldest);
    }
  }

  permitted(agentId: string, declared: readonly string[], workspace: string): readonly string[] {
    return [...(this.agents.get(agentId)?.paths ?? []), ...declared]
      .map((file) => path.resolve(workspace, file)).filter((file) => insideNotesWorkspace(workspace, file));
  }

  completed(agentId: string, declared: readonly string[], workspace: string, notes?: string): boolean {
    const paths = this.agents.get(agentId)?.paths;
    const key = (file: string): string => process.platform === 'win32' ? file.toLowerCase() : file;
    const productive = [...(paths ?? [])].filter(file => !notes || key(file) !== key(path.resolve(workspace, notes)));
    return declared.length === 0 ? productive.length > 0 : declared.some(file => productive.some(written => key(written) === key(path.resolve(workspace, file))));
  }

  finish(agentId: string): void { this.agents.delete(agentId); }

  release(sessionId: string): void {
    for (const [id, entry] of this.agents) if (entry.sessionId === sessionId) this.agents.delete(id);
  }
  rekey(from: string, to: string): void {
    for (const entry of this.agents.values()) if (entry.sessionId === from) entry.sessionId = to;
  }
}
