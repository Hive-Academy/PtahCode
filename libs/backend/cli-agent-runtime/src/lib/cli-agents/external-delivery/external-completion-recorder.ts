import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { AgentProcessInfo, ExternalOwnerKey } from '@ptah-extension/shared';
import { CLI_AGENT_RUNTIME_TOKENS } from '../../di/tokens';
import type { LaneCompletionResult } from '../lane-completion-replay';
import { ExternalCompletionOutbox } from './external-completion-outbox';
import { externalOwnerKeySchema } from './external-owner-key';

@injectable()
export class ExternalCompletionRecorder {
  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(CLI_AGENT_RUNTIME_TOKENS.EXTERNAL_COMPLETION_OUTBOX)
    private readonly outbox: ExternalCompletionOutbox,
  ) {}

  /** A result without completion is skipped: the first signal call already recorded it. */
  recordFromSignal(
    info: AgentProcessInfo,
    externalOwner: ExternalOwnerKey | undefined,
    result: LaneCompletionResult,
  ): void {
    try {
      const body = result.completion?.parentSignal;
      if (!externalOwner || !body || !info.completedAt) return;
      const owner = externalOwnerKeySchema.safeParse(externalOwner);
      if (!owner.success) {
        this.logger.warn('[ExternalCompletionRecorder] Ignored an invalid owner key', {
          agentId: info.agentId,
        });
        return;
      }
      this.outbox.record({
        completionId: `${info.agentId}:${info.completedAt}`,
        agentId: info.agentId,
        owner: owner.data,
        body,
        verdict: result.completion?.verdict,
        completedAt: info.completedAt,
        recordedAt: Date.now(),
      });
    } catch (error: unknown) {
      this.logger.error(
        '[ExternalCompletionRecorder] Recording failed',
        error instanceof Error ? error : new Error('Recording failed'),
      );
    }
  }
}
