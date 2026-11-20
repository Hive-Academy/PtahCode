import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  PERSISTENCE_TOKENS,
  type BotRepository,
} from '@ptah-extension/persistence-sqlite';
import {
  BOTS_TOKENS,
  type BotCatalogPort,
  type BotSourceReaderPort,
  type BotWorkspaceAuthorizationPort,
} from './bot-ports';
import {
  BotApplicationService,
  type BotApplicationDependencies,
} from './bot-application.service';

/** Resolves dependencies only on first application use in either host. */
export function registerBotsServices(
  container: DependencyContainer,
  deps: Partial<BotApplicationDependencies> = {},
): void {
  container.register<BotApplicationService>(BOTS_TOKENS.APPLICATION, {
    useFactory: instanceCachingFactory(
      (c) =>
        new BotApplicationService({
          repository:
            deps.repository ??
            c.resolve<BotRepository>(PERSISTENCE_TOKENS.BOT_REPOSITORY),
          sourceReader:
            deps.sourceReader ??
            c.resolve<BotSourceReaderPort>(BOTS_TOKENS.SOURCE_READER),
          catalog:
            deps.catalog ?? c.resolve<BotCatalogPort>(BOTS_TOKENS.CATALOG),
          workspaceAuthorization:
            deps.workspaceAuthorization ??
            c.resolve<BotWorkspaceAuthorizationPort>(
              BOTS_TOKENS.WORKSPACE_AUTHORIZATION,
            ),
          retentionParticipants: deps.retentionParticipants ?? [],
          logger:
            deps.logger ??
            (c.isRegistered(TOKENS.LOGGER)
              ? c.resolve<Logger>(TOKENS.LOGGER)
              : undefined),
          ...(deps.now === undefined ? {} : { now: deps.now }),
          ...(deps.newId === undefined ? {} : { newId: deps.newId }),
        }),
    ),
  });
}
