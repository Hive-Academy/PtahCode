import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import {
  BOTS_TOKENS,
  registerBotsServices,
  type BotApplicationService,
} from '@ptah-extension/bots';
import {
  PLATFORM_TOKENS,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  BotsRpcHandlers,
  registerBotAdapters,
} from '@ptah-extension/rpc-handlers';
import {
  TOKENS,
  type Logger,
  type RpcHandler,
} from '@ptah-extension/vscode-core';

/** Domain registration is lazy, including when persistence failed to initialize. */
export function registerBotsComposition(
  container: DependencyContainer,
  logger: Logger,
): void {
  registerBotAdapters(container);
  registerBotsServices(container);
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
  // The shared RPC manifest registers methods during runtime wiring.
}
