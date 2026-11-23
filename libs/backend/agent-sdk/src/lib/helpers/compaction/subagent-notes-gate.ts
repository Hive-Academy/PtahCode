import * as path from 'node:path';
import { z } from 'zod';
import {
  formatAgentActionReason,
  type AgentActionNotice,
} from '@ptah-extension/shared';
import { insideNotesWorkspace } from './subagent-notes-path';
import { summarizeSubagentPaths } from './subagent-path-summary';
import { rekeyScopedMap, scopedKeyBelongsToSession } from './subagent-scope-key';

/** One generous bound, measured from entry, never from tool calls or denials. */
export const NOTES_GATE_TIMEOUT_MS = 10 * 60_000;
const fileInput = z.object({ file_path: z.string().min(1) });
const READ_ONLY_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob'];

/** `asked` never denies; `paused` (the 2x ceiling) denies new work tools. Never moves back. */
export type SubagentGatePhase = 'asked' | 'paused';

function pathKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.replaceAll('/', '\\').toLowerCase() : normalized;
}

export interface SubagentGateOptions {
  readonly readOnly: boolean;
  /** Workspace root. With `notesPath`, enables the notes write rights. */
  readonly workspace?: string;
  readonly notesPath?: string;
  readonly deliverablePaths?: readonly string[];
  readonly now?: number;
  /** The Agent tool call that owns the gate. A different owner replaces an existing entry. */
  readonly invocation?: string;
}

interface GateEntry {
  readonly invocation?: string;
  readonly readOnly: boolean;
  readonly notesPath?: string;
  readonly workspace?: string;
  readonly startedAt: number;
  readonly permittedPaths: readonly string[];
  readonly written: Set<string>;
  phase: SubagentGatePhase;
  notice?: AgentActionNotice;
  overdueNotified: boolean;
}

export interface GateDecision { readonly reason?: string; }

/**
 * Per-agent handoff gate. A budget ask enters the gate in phase `asked`, which
 * never denies. The 2x ceiling pauses new work tools: only the permitted
 * handoff tools stay available and every other tool gets a Ptah-labeled deny.
 * The gate never ends an agent; the agent returns normally.
 */
export class SubagentNotesGate {
  private readonly entries = new Map<string, GateEntry>();

  /**
   * Idempotent for the same owner. An entry of another invocation is stale (a reused agent id)
   * and is replaced, so the new invocation never inherits its phase.
   * Without `notesPath` and `workspace` the agent reports inline and gets no write rights.
   */
  enter(agentId: string, opts: SubagentGateOptions): void {
    const existing = this.entries.get(agentId);
    if (existing && (opts.invocation === undefined || existing.invocation === undefined || existing.invocation === opts.invocation)) return;
    const base = { invocation: opts.invocation, readOnly: opts.readOnly, startedAt: opts.now ?? Date.now(), written: new Set<string>(), phase: 'asked' as const, overdueNotified: false };
    if (!opts.notesPath || !opts.workspace) {
      this.entries.set(agentId, { ...base, permittedPaths: [] });
      return;
    }
    const root = path.resolve(opts.workspace);
    const notes = path.resolve(opts.notesPath);
    const declared = z.array(z.string().min(1)).parse(opts.deliverablePaths ?? []).map((file) => path.resolve(root, file));
    if (![notes, ...declared].every((file) => insideNotesWorkspace(root, file))) throw new Error('Notes phase paths must be inside the declared workspace');
    const permittedPaths = [...new Map([notes, ...declared].map((file) => [pathKey(file), file])).values()];
    this.entries.set(agentId, { ...base, notesPath: notes, workspace: root, permittedPaths });
  }

  /** Latches the pause and keeps the notice for the deny copy; true only on the first transition. */
  pause(agentId: string, notice: AgentActionNotice): boolean {
    const entry = this.entries.get(agentId);
    if (!entry || entry.phase === 'paused') return false;
    entry.phase = 'paused';
    entry.notice = notice;
    return true;
  }

  phase(agentId: string | undefined): SubagentGatePhase | undefined { return agentId ? this.entries.get(agentId)?.phase : undefined; }
  has(agentId: string | undefined): boolean { return !!agentId && this.entries.has(agentId); }
  /** Without `invocation` the entry always ends; with it only the owning invocation ends it. */
  finish(agentId: string, invocation?: string): void {
    const entry = this.entries.get(agentId);
    if (!entry || (invocation !== undefined && entry.invocation !== undefined && entry.invocation !== invocation)) return;
    this.entries.delete(agentId);
  }
  owner(agentId: string): string | undefined { return this.entries.get(agentId)?.invocation; }
  keys(): string[] { return [...this.entries.keys()]; }
  rekey(from: string, to: string): void { rekeyScopedMap(this.entries, from, to); }
  release(sessionId: string): void {
    for (const key of [...this.entries.keys()]) if (scopedKeyBelongsToSession(key, sessionId)) this.entries.delete(key);
  }
  paths(agentId: string): readonly string[] { return this.entries.get(agentId)?.permittedPaths ?? []; }

  /** True once the handoff has been outstanding for the overdue window. Informational only. */
  expired(agentId: string, now = Date.now()): boolean {
    const entry = this.entries.get(agentId);
    return !!entry && now - entry.startedAt >= NOTES_GATE_TIMEOUT_MS;
  }

  /** True only the first time, so the monitor sends exactly one overdue notice. */
  markOverdueNotified(agentId: string): boolean {
    const entry = this.entries.get(agentId);
    if (!entry || entry.overdueNotified) return false;
    entry.overdueNotified = true;
    return true;
  }

  /** Whether the notes file itself was written successfully. */
  notesReady(agentId: string): boolean {
    const entry = this.entries.get(agentId);
    return !!entry?.notesPath && entry.written.has(pathKey(entry.notesPath));
  }

  /** Called only for successful PostToolUse, never PreToolUse or failure events. */
  recordWrite(agentId: string, toolName: string, input: unknown): boolean {
    const entry = this.entries.get(agentId);
    if (!entry?.notesPath || (toolName !== 'Write' && toolName !== 'Edit')) return false;
    const candidate = this.permittedCandidate(entry, input);
    if (!candidate) return false;
    entry.written.add(pathKey(candidate));
    return pathKey(candidate) === pathKey(entry.notesPath);
  }

  check(agentId: string | undefined, toolName: string, input: unknown, _now?: number): GateDecision {
    const entry = agentId ? this.entries.get(agentId) : undefined;
    if (!entry || entry.phase !== 'paused') return {};
    // Read-only roles keep Read/Grep/Glob; their existing scope applies elsewhere.
    if (entry.readOnly) return READ_ONLY_TOOLS.includes(toolName) ? {} : { reason: this.denyText(entry) };
    const permitted = ['Read', 'Write', 'Edit'].includes(toolName) && this.permittedCandidate(entry, input);
    return permitted ? {} : { reason: this.denyText(entry) };
  }

  private denyText(entry: GateEntry): string {
    const cause = entry.notice ? ` because ${formatAgentActionReason(entry.notice)}` : '';
    const lead = `Ptah budget monitor paused new work tools${cause}.`;
    if (entry.readOnly || !entry.notesPath) {
      const tools = entry.readOnly ? ' You may use your permitted Read, Grep, and Glob tools.' : '';
      return `${lead}${tools} Return normally with your progress, findings, and remaining work in your final report.`;
    }
    return `${lead} Write your progress, findings, and remaining work to ${entry.notesPath} with Write or Edit, then return normally. Permitted paths: ${summarizeSubagentPaths(entry.permittedPaths)}.`;
  }

  /** The resolved input path when it is a permitted path inside the workspace. */
  private permittedCandidate(entry: GateEntry, input: unknown): string | undefined {
    if (!entry.workspace) return undefined;
    const parsed = fileInput.safeParse(input);
    if (!parsed.success) return undefined;
    const candidate = path.resolve(entry.workspace, parsed.data.file_path);
    return insideNotesWorkspace(entry.workspace, candidate) && entry.permittedPaths.some((file) => pathKey(file) === pathKey(candidate))
      ? candidate : undefined;
  }
}
