import { inject, injectable } from 'tsyringe';
import { SessionStatsRepository } from '@ptah-extension/persistence-sqlite';
import type {
  RpcMethodName,
  UsageGetDimensionTotalsParams,
  UsageGetDimensionTotalsResult,
} from '@ptah-extension/shared';
import { RpcUserError, TOKENS, type Logger, type RpcHandler } from '@ptah-extension/vscode-core';
import { UsageGetDimensionTotalsParamsSchema } from './usage-rpc.schema';

const METHOD = 'usage:getDimensionTotals';

/** Read-only usage totals of one session, grouped by phase kind and by executor type. */
@injectable()
export class UsageRpcHandlers {
  static readonly METHODS = [METHOD] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    @inject(SessionStatsRepository, { isOptional: true })
    private readonly statsRepository: SessionStatsRepository | null = null,
  ) {}

  register(): void {
    this.rpcHandler.registerMethod<UsageGetDimensionTotalsParams, UsageGetDimensionTotalsResult>(
      METHOD,
      async (rawParams: unknown) => this.getDimensionTotals(rawParams),
    );
    this.logger.debug('Usage RPC handler registered', { method: METHOD });
  }

  private async getDimensionTotals(rawParams: unknown): Promise<UsageGetDimensionTotalsResult> {
    const parsed = UsageGetDimensionTotalsParamsSchema.safeParse(rawParams);
    if (!parsed.success) {
      throw new RpcUserError('usage:getDimensionTotals: invalid params', 'INVALID_PARAMS');
    }
    if (!this.statsRepository) {
      throw new RpcUserError('Usage totals unavailable.', 'PERSISTENCE_UNAVAILABLE');
    }
    try {
      return await this.statsRepository.getUsageDimensionTotals(parsed.data.sessionId);
    } catch (error: unknown) {
      this.logger.warn('[RPC] usage:getDimensionTotals failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new RpcUserError('Usage totals unavailable.', 'PERSISTENCE_UNAVAILABLE');
    }
  }
}
