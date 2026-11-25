import { inject, injectable, type DependencyContainer } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, RpcUserError } from '@ptah-extension/vscode-core';
import type { Logger, RpcHandler } from '@ptah-extension/vscode-core';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import type { CliDetectionService } from '@ptah-extension/cli-agent-runtime';
import {
  LANE_ROUTING_TOKENS,
  type RoutingEvidenceService,
} from '@ptah-extension/lane-routing';
import {
  loggableErrorName,
  type AgentGetRoutingEvidenceParams,
  type AgentGetRoutingEvidenceResult,
  type RpcMethodName,
} from '@ptah-extension/shared';

const METHOD = 'agent:getRoutingEvidence';
const paramsSchema = z.object({}).strict();

@injectable()
export class RoutingEvidenceRpcHandlers {
  static readonly METHODS = [
    METHOD,
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    @inject(PLATFORM_TOKENS.DI_CONTAINER)
    private readonly runtimeContainer: DependencyContainer,
    @inject(TOKENS.CLI_DETECTION_SERVICE)
    private readonly cliDetection: Pick<CliDetectionService, 'detectAll'>,
  ) {}

  register(): void {
    this.rpcHandler.registerMethod<
      AgentGetRoutingEvidenceParams,
      AgentGetRoutingEvidenceResult
    >(METHOD, async (params: unknown) => this.getRoutingEvidence(params));
  }

  private async getRoutingEvidence(
    params: unknown,
  ): Promise<AgentGetRoutingEvidenceResult> {
    if (!paramsSchema.safeParse(params === undefined ? {} : params).success) {
      throw new RpcUserError(
        `${METHOD}: invalid params — this method takes no parameters`,
        'INVALID_PARAMS',
      );
    }

    const token = LANE_ROUTING_TOKENS.ROUTING_EVIDENCE_SERVICE;
    if (!this.runtimeContainer.isRegistered(token, true)) {
      throw this.unavailable('routing evidence service is not registered');
    }

    try {
      const service = this.runtimeContainer.resolve<Pick<RoutingEvidenceService, 'read'>>(token);
      const rows = await this.cliDetection.detectAll();
      return await service.read(rows);
    } catch (error: unknown) {
      throw this.unavailable('routing evidence request failed', error);
    }
  }

  private unavailable(reason: string, error?: unknown): RpcUserError {
    this.logger.error(`RPC: ${METHOD} failed`, {
      reason,
      errorName: loggableErrorName(error),
    });
    return new RpcUserError(
      'Routing evidence is unavailable.',
      'PERSISTENCE_UNAVAILABLE',
    );
  }
}
