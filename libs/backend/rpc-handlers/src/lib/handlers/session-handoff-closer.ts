import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { MESSAGE_TYPES, type HandoffCloseBlockerCode } from '@ptah-extension/shared';
import type { HandoffPredecessorCloser, HandoffCloseResult } from '@ptah-extension/cli-agent-runtime';

interface BroadcastHost {
  broadcastMessage(type: string, payload: unknown): Promise<void>;
}

@injectable()
/** Broadcast assumes one renderer owns the predecessor. Other replies wait
 * until the timeout so the owning renderer can still report closure. */
export class SessionHandoffCloser implements HandoffPredecessorCloser {
  private readonly pending = new Map<string, { finish: (result: HandoffCloseResult) => void; absent: boolean }>();
  timeoutMs = 30_000;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.WEBVIEW_MANAGER) private readonly broadcaster: BroadcastHost,
  ) {}

  async close(predecessorTabId: string, predecessorSdkId: string | null): Promise<HandoffCloseResult> {
    const requestId = randomUUID();
    return new Promise<HandoffCloseResult>((resolve) => {
      const timer = setTimeout(() => this.finish(requestId, { kind: this.pending.get(requestId)?.absent ? 'absent' : 'timeout' }), this.timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { absent: false, finish: (result) => {
        clearTimeout(timer);
        resolve(result);
      } });
      try {
        void this.broadcaster.broadcastMessage(MESSAGE_TYPES.SESSION_HANDOFF_CLOSE_PREDECESSOR, {
          requestId, predecessorTabId, predecessorSdkId, predecessorStopped: true,
        }).catch((error: unknown) => {
          this.logger.error('Failed to request predecessor closure', error instanceof Error ? error : new Error('Broadcast failed'));
          this.finish(requestId, { kind: 'broadcast-failed' });
        });
      } catch (error: unknown) {
        this.logger.error('Failed to request predecessor closure', error instanceof Error ? error : new Error('Broadcast failed'));
        this.finish(requestId, { kind: 'broadcast-failed' });
      }
    });
  }

  complete(requestId: string, outcome: 'closed' | 'absent' | 'blocked', blockerCode?: HandoffCloseBlockerCode): boolean {
    const pending = this.pending.get(requestId);
    if (outcome === 'absent') {
      if (pending) pending.absent = true;
      return pending !== undefined;
    }
    return this.finish(requestId, outcome === 'closed' ? { kind: 'closed' } : { kind: 'blocked', code: blockerCode ?? 'unknown' });
  }

  private finish(requestId: string, result: HandoffCloseResult): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) {
      this.logger.warn('Unknown or stale handoff close result', { requestId });
      return false;
    }
    this.pending.delete(requestId);
    this.logger.info('Handoff predecessor close finished', {
      requestId, kind: result.kind, ...(result.kind === 'blocked' ? { code: result.code } : {}),
    });
    pending.finish(result);
    return true;
  }
}
