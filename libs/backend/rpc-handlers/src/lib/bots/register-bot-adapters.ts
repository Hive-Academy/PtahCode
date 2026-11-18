import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import { BOTS_TOKENS } from '@ptah-extension/bots';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import { HARNESS_SYNC_TOKENS } from '@ptah-extension/harness-sync';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { TOKENS } from '@ptah-extension/vscode-core';
import { BotSourceReader } from './bot-source-reader';
import { BotWorkspaceAuthorizer } from './bot-workspace-authorizer';
import { BotCatalogAdapter } from './bot-catalog-adapter';

/** Registration is lazy; neither host needs persistence or catalogs at startup. */
export function registerBotAdapters(container: DependencyContainer): void {
  container.register(BOTS_TOKENS.WORKSPACE_AUTHORIZATION, {
    useFactory: instanceCachingFactory(
      (c) =>
        new BotWorkspaceAuthorizer(
          c.resolve(PLATFORM_TOKENS.WORKSPACE_PROVIDER),
        ),
    ),
  });
  container.register(BOTS_TOKENS.SOURCE_READER, {
    useFactory: instanceCachingFactory(
      (c) =>
        new BotSourceReader(
          c.resolve(BOTS_TOKENS.WORKSPACE_AUTHORIZATION),
          c.resolve(TOKENS.LOGGER),
        ),
    ),
  });
  container.register(BOTS_TOKENS.CATALOG, {
    useFactory: instanceCachingFactory(
      (c) =>
        new BotCatalogAdapter({
          models: c.resolve(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS),
          secrets: c.resolve(TOKENS.AUTH_SECRETS_SERVICE),
          sources: c.resolve(HARNESS_SYNC_TOKENS.SOURCE_RESOLVER),
          config: c.resolve(TOKENS.CONFIG_MANAGER),
          logger: c.resolve(TOKENS.LOGGER),
        }),
    ),
  });
}
