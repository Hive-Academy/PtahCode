import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import type { HandoffPredecessorCloser } from '@ptah-extension/cli-agent-runtime';

interface BroadcastHost {
  broadcastMessage(type: string, payload: unknown): Promise<void>;
}

@injectable()
export class SessionHandoffCloser implements HandoffPredecessorCloser {
  private readonly pending = new Map<string, (closed: boolean) => void>();
  timeoutMs = 30_000;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.WEBVIEW_MANAGER) private readonly broadcaster: BroadcastHost,
  ) {}

  async close(predecessorTabId: string, predecessorSdkId: string | null): Promise<boolean> {
    const requestId = randomUUID();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => this.complete(requestId, false), this.timeoutMs);
      this.pending.set(requestId, (closed) => {
        clearTimeout(timer);
        resolve(closed);
      });
      void this.broadcaster.broadcastMessage(MESSAGE_TYPES.SESSION_HANDOFF_CLOSE_PREDECESSOR, {
        requestId, predecessorTabId, predecessorSdkId,
      }).catch((error: unknown) => {
        this.logger.error('Failed to request predecessor closure', error instanceof Error ? error : new Error('Broadcast failed'));
        this.complete(requestId, false);
      });
    });
  }

  complete(requestId: string, closed: boolean): boolean {
    const resolve = this.pending.get(requestId);
    if (!resolve) {
      this.logger.warn('Unknown or stale handoff close result', { requestId });
      return false;
    }
    this.pending.delete(requestId);
    resolve(closed);
    return true;
  }
}
