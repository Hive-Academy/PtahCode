import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import {
  BotDomainError,
  type BotApplicationService,
} from '@ptah-extension/bots';
import { BotsRpcSchemas, type RpcMethodName } from '@ptah-extension/shared';
import { RpcUserError, type Logger } from '@ptah-extension/vscode-core';

/** Supplied by each composition root; resolution must remain request-time. */
export type BotApplicationResolver = () => BotApplicationService;

export class BotsRpcHandlers {
  static readonly METHODS = [
    'bots:list',
    'bots:get',
    'bots:create',
    'bots:update',
    'bots:set-enabled',
    'bots:archive',
    'bots:restore',
    'bots:delete',
    'bots:preview-import',
    'bots:upload-avatar',
    'bots:get-avatar',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    private readonly rpcHandler: {
      registerMethod(
        name: string,
        handler: (params: unknown) => Promise<unknown>,
      ): void;
    },
    private readonly resolveApplication: BotApplicationResolver,
    private readonly workspace: Pick<IWorkspaceProvider, 'getWorkspaceFolders'>,
    private readonly logger: Pick<Logger, 'error'>,
  ) {}

  register(): void {
    for (const method of BotsRpcHandlers.METHODS) {
      this.rpcHandler.registerMethod(method, (raw: unknown) =>
        this.call(method, raw),
      );
    }
  }

  private async call(
    method: (typeof BotsRpcHandlers.METHODS)[number],
    raw: unknown,
  ): Promise<unknown> {
    const parsed = BotsRpcSchemas[method].params.safeParse(raw);
    if (!parsed.success) {
      throw new RpcUserError('Invalid bot parameters.', 'INVALID_PARAMS');
    }
    let app: BotApplicationService;
    try {
      app = this.resolveApplication();
    } catch {
      // DI errors can contain host paths and token names. Never expose them.
      throw new RpcUserError(
        'Bot storage is unavailable.',
        'PERSISTENCE_UNAVAILABLE',
      );
    }
    try {
      const roots = this.workspace.getWorkspaceFolders();
      const params = parsed.data;
      let result: unknown;
      switch (method) {
        case 'bots:list':
          result = await app.list(params);
          break;
        case 'bots:get':
          result = await app.get(params, roots);
          break;
        case 'bots:create':
          result = await app.create(params, roots[0]);
          break;
        case 'bots:update':
          result = await app.update(params, roots);
          break;
        case 'bots:set-enabled':
          result = await app.setEnabled(params, roots);
          break;
        case 'bots:archive':
          result = await app.archive(params, roots);
          break;
        case 'bots:restore':
          result = await app.restore(params, roots);
          break;
        case 'bots:delete':
          result = await app.delete(params, roots);
          break;
        case 'bots:preview-import':
          result = await app.previewImport(params);
          break;
        case 'bots:upload-avatar':
          result = await app.uploadAvatar(params);
          break;
        case 'bots:get-avatar':
          result = await app.getAvatar(params, roots);
          break;
      }
      return BotsRpcSchemas[method].result.parse(result);
    } catch (error: unknown) {
      if (error instanceof BotDomainError) {
        // Only fixed messages cross RPC: domain details may contain host paths.
        const message =
          error.code === 'PERSISTENCE_UNAVAILABLE'
            ? 'Bot storage is unavailable.'
            : 'Bot request was refused.';
        throw new RpcUserError(message, error.code);
      }
      this.logger.error(
        'Bot RPC request failed',
        error instanceof Error ? error : { error },
      );
      // RpcHandler reports generic internal failures without exposing the original details.
      throw new Error('Bot request failed.', { cause: error });
    }
  }
}
