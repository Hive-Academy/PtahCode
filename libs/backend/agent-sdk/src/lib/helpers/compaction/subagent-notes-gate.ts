import * as path from 'node:path';
import { z } from 'zod';

export const NOTES_GATE_DENIAL_LIMIT = 3;
export const NOTES_GATE_TIMEOUT_MS = 45_000;
export const NOTES_GATE_GRACE_MS = 120_000;
const DENIAL_BURST_MS = 2_000;

const writeInput = z.object({ file_path: z.string().min(1) });

function pathKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32'
    ? normalized.replaceAll('/', '\\').toLowerCase()
    : normalized;
}

interface GateEntry {
  readonly notesPath: string;
  readonly workspace: string;
  readonly startedAt: number;
  firstDecisionAt?: number;
  lastDenialAt?: number;
  denials: number;
}

export interface GateDecision {
  readonly reason?: string;
  readonly stop: boolean;
}

/** One entry per warned SDK agent. A parent hook never has an agent_id. */
export class SubagentNotesGate {
  private readonly entries = new Map<string, GateEntry>();

  warn(agentId: string, notesPath: string, workspace: string, now = Date.now()): void {
    if (this.entries.has(agentId)) return;
    this.entries.set(agentId, { notesPath: path.resolve(notesPath), workspace: path.resolve(workspace), startedAt: now, denials: 0 });
  }

  has(agentId: string | undefined): boolean {
    return !!agentId && this.entries.has(agentId);
  }

  finish(agentId: string): void {
    this.entries.delete(agentId);
  }

  expired(agentId: string, now = Date.now()): boolean {
    const entry = this.entries.get(agentId);
    return !!entry && (entry.firstDecisionAt === undefined
      ? now - entry.startedAt >= NOTES_GATE_GRACE_MS
      : now - entry.firstDecisionAt >= NOTES_GATE_TIMEOUT_MS);
  }

  check(agentId: string | undefined, toolName: string, input: unknown, now = Date.now()): GateDecision {
    const entry = agentId ? this.entries.get(agentId) : undefined;
    if (!entry || !agentId) return { stop: false };
    entry.firstDecisionAt ??= now;
    if (this.expired(agentId, now)) {
      return { reason: 'Ptah budget handoff expired. End your turn now.', stop: true };
    }
    const parsed = writeInput.safeParse(input);
    const candidate = parsed.success ? path.resolve(entry.workspace, parsed.data.file_path) : undefined;
    const relative = candidate ? path.relative(entry.workspace, candidate) : undefined;
    const inside = relative !== undefined && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    if ((toolName === 'Write' || toolName === 'Edit') && inside && candidate && pathKey(candidate) === pathKey(entry.notesPath)) {
      return { stop: false };
    }
    if (entry.lastDenialAt === undefined || now - entry.lastDenialAt >= DENIAL_BURST_MS) {
      entry.denials += 1;
    }
    entry.lastDenialAt = now;
    return {
      reason: `Ptah budget handoff: write your notes to ${entry.notesPath}, then end your turn with a final message starting "PTAH BUDGET HANDOFF:" that summarizes progress and next steps. Do not call other tools. End your turn now.`,
      stop: entry.denials >= NOTES_GATE_DENIAL_LIMIT || this.expired(agentId, now),
    };
  }
}
