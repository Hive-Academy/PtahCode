import { summarizeSubagentPaths } from './subagent-path-summary';
import * as path from 'node:path';
import { z } from 'zod';
import { insideNotesWorkspace } from './subagent-notes-path';
import type { SubagentStopCause } from './subagent-stop-cause';

/** One generous bound, measured from entry, never from tool calls or denials. */
export const NOTES_GATE_TIMEOUT_MS = 10 * 60_000;
const fileInput = z.object({ file_path: z.string().min(1) });

function pathKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.replaceAll('/', '\\').toLowerCase() : normalized;
}


interface GateEntry {
  readonly notesPath: string;
  readonly workspace: string;
  readonly startedAt: number;
  readonly permittedPaths: readonly string[];
  readonly written: Set<string>;
}
export interface GateDecision { readonly reason?: string; readonly stop: boolean; }

/** Workspace-contained notes and optional deliverables share the same tool gate. */
export class SubagentNotesGate {
  private readonly entries = new Map<string, GateEntry>();

  warn(agentId: string, notesPath: string, workspace: string, now = Date.now(), deliverablePaths: readonly string[] = []): void {
    if (this.entries.has(agentId)) return;
    const root = path.resolve(workspace);
    const notes = path.resolve(notesPath);
    const declared = z.array(z.string().min(1)).parse(deliverablePaths).map((file) => path.resolve(root, file));
    if (![notes, ...declared].every((file) => insideNotesWorkspace(root, file))) throw new Error('Notes phase paths must be inside the declared workspace');
    const permittedPaths = [...new Map([notes, ...declared].map((file) => [pathKey(file), file])).values()];
    this.entries.set(agentId, { notesPath: notes, workspace: root, startedAt: now, permittedPaths, written: new Set() });
  }

  has(agentId: string | undefined): boolean { return !!agentId && this.entries.has(agentId); }
  finish(agentId: string): void { this.entries.delete(agentId); }
  paths(agentId: string): readonly string[] { return this.entries.get(agentId)?.permittedPaths ?? []; }
  expired(agentId: string, now = Date.now()): boolean {
    const entry = this.entries.get(agentId);
    return !!entry && now - entry.startedAt >= NOTES_GATE_TIMEOUT_MS;
  }
  cause(agentId: string, kind: 'warning-notes-complete' | 'warning-turn-ended' | 'notes-timeout', forced: boolean, now = Date.now()): SubagentStopCause {
    const entry = this.entries.get(agentId);
    return kind === 'notes-timeout'
      ? { kind, quantity: 'milliseconds', measured: entry ? now - entry.startedAt : NOTES_GATE_TIMEOUT_MS, limit: NOTES_GATE_TIMEOUT_MS, forced }
      : { kind, quantity: 'files', measured: entry?.written.has(pathKey(entry.notesPath)) ? 1 : 0, limit: 1, forced };
  }

  private candidate(entry: GateEntry, input: unknown): string | undefined {
    const parsed = fileInput.safeParse(input);
    return parsed.success ? path.resolve(entry.workspace, parsed.data.file_path) : undefined;
  }
  /** Called only for successful PostToolUse, never PreToolUse or failure events. */
  recordWrite(agentId: string, toolName: string, input: unknown): boolean {
    const entry = this.entries.get(agentId);
    if (!entry || (toolName !== 'Write' && toolName !== 'Edit')) return false;
    const candidate = this.candidate(entry, input);
    if (!candidate || !insideNotesWorkspace(entry.workspace, candidate) || !entry.permittedPaths.some((file) => pathKey(file) === pathKey(candidate))) return false;
    entry.written.add(pathKey(candidate));
    return pathKey(candidate) === pathKey(entry.notesPath);
  }

  check(agentId: string | undefined, toolName: string, input: unknown, now = Date.now()): GateDecision {
    const entry = agentId ? this.entries.get(agentId) : undefined;
    if (!entry || !agentId) return { stop: false };
    if (this.expired(agentId, now)) return { reason: 'Ptah budget handoff expired: notes-timeout (10 minutes from notes phase entry). End your turn now.', stop: true };
    const candidate = this.candidate(entry, input);
    if (candidate && insideNotesWorkspace(entry.workspace, candidate) &&
      ['Read', 'Write', 'Edit'].includes(toolName) && entry.permittedPaths.some((file) => pathKey(file) === pathKey(candidate))) return { stop: false };
    return { reason: `Ptah budget handoff: permitted paths: ${summarizeSubagentPaths(entry.permittedPaths)}. You may Read, Write or Edit these paths. Deliverables are optional; write the notes file last at ${entry.notesPath}. Your turn ends immediately after the notes write. Other tools and paths are not permitted.`, stop: false };
  }
}
