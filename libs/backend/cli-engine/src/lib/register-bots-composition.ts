import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import {
  BOTS_TOKENS,
  registerBotsServices,
  type BotApplicationService,
} from '@ptah-extension/bots';
import {
  BotsRpcHandlers,
  registerBotAdapters,
  registerHarnessServices,
} from '@ptah-extension/rpc-handlers';
import {
  PLATFORM_TOKENS,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  TOKENS,
  type Logger,
  type RpcHandler,
} from '@ptah-extension/vscode-core';

/** Called once after Thoth persistence registration, for both bootstrap modes. */
export function registerBotsComposition(
  container: DependencyContainer,
  logger: Logger,
  enableRpc: boolean,
): void {
  registerHarnessServices(container);
  registerBotAdapters(container);
  registerBotsServices(container);

  if (enableRpc) {
    // The shared RPC manifest calls register() once during Phase 4.
    container.register(BotsRpcHandlers, {
      useFactory: instanceCachingFactory(
        (c) =>
          new BotsRpcHandlers(
            c.resolve<RpcHandler>(TOKENS.RPC_HANDLER),
            () => c.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION),
            c.resolve<IWorkspaceProvider>(PLATFORM_TOKENS.WORKSPACE_PROVIDER),
            logger,
          ),
      ),
    });
  }
}
