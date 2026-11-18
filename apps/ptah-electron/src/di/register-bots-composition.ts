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
  // Stripped DI smoke containers can omit the transport and workspace ports.
  // Production binds both in phases 0–1, before serving the bot methods here.
  if (
    container.isRegistered(TOKENS.RPC_HANDLER) &&
    container.isRegistered(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
  ) {
    container.resolve(BotsRpcHandlers).register();
  } else {
    logger.warn(
      '[bots] RPC handler or workspace provider not registered; bot methods are not served.',
    );
  }
}
