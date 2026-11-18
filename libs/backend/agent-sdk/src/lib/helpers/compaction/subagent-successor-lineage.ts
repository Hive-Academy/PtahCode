import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { insideNotesWorkspace } from './subagent-notes-path';
import type { Logger } from '@ptah-extension/vscode-core';

const lineageSchema = z.object({
  predecessor: z.string().optional(), notes: z.string().optional(),
  warningReached: z.boolean(), requestCount: z.number().int().nonnegative(), initialContext: z.number().nonnegative(),
  effectiveH: z.number().positive(), exhausted: z.boolean(), completedDeliverable: z.boolean(),
});
export type SuccessorLineage = z.infer<typeof lineageSchema>;
const inputSchema = z.object({ prompt: z.string() });
const link = /^Ptah predecessor handoff: (.+)$/m;
const reduction = /^Ptah reduced scope: (.+)$/m;
const marker = /^Ptah lineage: (.+)$/gm;
const warned = new WeakMap<object, Set<string>>();
export function moveLineageWarning(logger: object, from: string, to?: string): void {
  const sessions = warned.get(logger);
  if (sessions?.delete(from) && to !== undefined) sessions.add(to);
}
function concreteReduction(input: unknown): boolean {
  const parsed = inputSchema.safeParse(input);
  const statement = parsed.success ? reduction.exec(parsed.data.prompt)?.[1].trim() : undefined;
  return statement !== undefined && statement.length >= 24 && statement.split(/\s+/).length >= 4;
}

export function predecessorPath(input: unknown): string | undefined {
  const parsed = inputSchema.safeParse(input);
  return parsed.success ? link.exec(parsed.data.prompt)?.[1].trim() : undefined;
}
export function successorLineage(previous: SuccessorLineage | undefined, current: Omit<SuccessorLineage, 'exhausted'>): SuccessorLineage {
  return { ...current, exhausted: !current.completedDeliverable && current.warningReached && !!previous && previous.warningReached &&
    (previous.exhausted || current.requestCount <= previous.requestCount) && current.initialContext >= previous.initialContext };
}
/** The immutable record carries ancestry across monitor/session restarts. */
export async function readPredecessor(workspace: string | undefined, input: unknown, logger: Pick<Logger, 'debug' | 'warn'>, sessionId = workspace ?? 'unknown'): Promise<SuccessorLineage | undefined> {
  const file = predecessorPath(input);
  if (!file) return undefined;
  try {
    if (!workspace) throw new Error('Workspace unavailable');
    const resolved = path.resolve(workspace, file);
    const directory = path.join(workspace, '.ptah', 'subagent-handoffs');
    if (!insideNotesWorkspace(workspace, resolved) || !insideNotesWorkspace(directory, resolved) || !resolved.endsWith('.handoff.md')) throw new Error('Untrusted record path');
    const handle = await fs.open(resolved, 'r');
    let text: string;
    try {
      if ((await handle.stat()).size > 256 * 1024) throw new Error('Record exceeds 256 KB');
      const buffer = Buffer.alloc(256 * 1024);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (chunk.bytesRead === 0) break;
        bytesRead += chunk.bytesRead;
      }
      if ((await handle.stat()).size > 256 * 1024) throw new Error('Record exceeds 256 KB');
      text = buffer.subarray(0, bytesRead).toString('utf8');
    } finally { await handle.close(); }
    const raw = [...text.matchAll(marker)].at(-1)?.[1];
    if (!raw) throw new Error('Lineage marker unavailable');
    const parsed = lineageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error('Invalid lineage schema');
    return parsed.data;
  } catch (error: unknown) {
    // degradation-audit: reported — warn once and debug why linked ancestry is unavailable.
    const sessions = warned.get(logger) ?? new Set<string>();
    if (!sessions.has(sessionId)) {
      sessions.add(sessionId); warned.set(logger, sessions);
      logger.warn('[SubagentLineage] Linked predecessor unavailable; ancestry protection not applied', { sessionId });
    }
    logger.debug('[SubagentLineage] Predecessor unavailable; ancestry unknown', { errorKind: error instanceof Error ? error.name : 'unknown' });
    return undefined;
  }
}
export async function guardSuccessor(workspace: string | undefined, input: unknown, logger: Pick<Logger, 'debug' | 'warn'>, sessionId?: string): Promise<string | undefined> {
  const previous = await readPredecessor(workspace, input, logger, sessionId);
  if (previous?.exhausted && !concreteReduction(input)) {
    return 'Ptah successor lineage exhausted: this successor reached warning as fast as its predecessor without a completed deliverable. Complete in the parent or explicitly reduce initial instruction load/scope using "Ptah reduced scope: <concrete reduction>" in the successor prompt.';
  }
  return undefined;
}
export function renderLineage(lineage: SuccessorLineage): string {
  return `Ptah lineage: ${JSON.stringify(lineage)}`;
}
export function continuationInstructions(recordPath: string): string {
  return `For a successor Agent/Task, include the following line verbatim in its prompt:\nPtah predecessor handoff: ${recordPath}\nPreserve this link and read the predecessor notes. An exhausted lineage requires completion in the parent or an explicit Ptah reduced scope: declaration.`;
}
