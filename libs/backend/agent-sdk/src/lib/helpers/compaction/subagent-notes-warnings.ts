import type { Logger } from '@ptah-extension/vscode-core';
import { rekeyScopedMap } from './subagent-scope-key';

/** Keep diagnostic context, excluding quoted data and path-like tokens. */
export function notesWarningError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  const name = /^[a-zA-Z]*Error$/.test(error.name) ? error.name : 'Error';
  const message = error.message.replace(/(['"`])[\s\S]*?\1/g, '[redacted]')
    .split(/\s+/).map((token) => /[\\/]|\.[a-zA-Z0-9]+/.test(token) ? '[path]' : token).join(' ');
  return `${name}: ${message}`.slice(0, 200);
}

/** Three setup attempts; independent safety enforcement remains in the monitor. */
export class SubagentNotesWarnings {
  private readonly failures = new Map<string, { sessionId: string; count: number }>();
  run(sessionId: string, agentId: string, logger: Pick<Logger, 'error'>, warn: () => void): boolean {
    const count = this.failures.get(agentId)?.count ?? 0;
    if (count >= 3) return false;
    try { warn(); this.failures.delete(agentId); return true; }
    catch (error: unknown) {
      this.failures.set(agentId, { sessionId, count: count + 1 });
      logger.error('[SubagentBudgetMonitor] Notes gate warning failed', {
        pathKind: 'notes-or-deliverable', error: notesWarningError(error),
        attempts: count + 1, safetyFallback: count + 1 === 3,
      });
      return false;
    }
  }
  finish(agentId: string): void { this.failures.delete(agentId); }
  release(sessionId: string): void {
    for (const [id, entry] of this.failures) if (entry.sessionId === sessionId) this.failures.delete(id);
  }
  rekey(from: string, to: string): void {
    for (const entry of this.failures.values()) if (entry.sessionId === from) entry.sessionId = to;
    rekeyScopedMap(this.failures, from, to);
  }
}
