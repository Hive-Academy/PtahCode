import { inject, injectable, type DependencyContainer } from 'tsyringe';
import { PLATFORM_TOKENS, type GitWindowHost } from '@ptah-extension/platform-core';
import {
  GitWindowEmptyParamsSchema,
  GitWindowPublishScopeParamsSchema,
  GitWindowSetModeParamsSchema,
  type GitWindowOpenParams, type GitWindowOpenResult,
  type GitWindowCloseParams, type GitWindowCloseResult,
  type GitWindowStatusParams, type GitWindowStatusResult,
  type GitWindowPublishScopeParams, type GitWindowPublishScopeResult,
  type GitWindowGetScopeParams, type GitWindowGetScopeResult,
  type GitWindowSetModeParams, type GitWindowSetModeResult,
  type RpcMethodName,
} from '@ptah-extension/shared';
import { TOKENS, RpcUserError, type RpcHandler } from '@ptah-extension/vscode-core';

/** Git window RPC boundary. The Electron host is bound after handler registration. */
@injectable()
export class GitWindowRpcHandlers {
  static readonly METHODS = [
    'gitWindow:open', 'gitWindow:close', 'gitWindow:status',
    'gitWindow:publishScope', 'gitWindow:getScope', 'gitWindow:setMode',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    @inject(PLATFORM_TOKENS.DI_CONTAINER) private readonly container: DependencyContainer,
  ) {}

  register(): void {
    this.rpcHandler.registerMethod<GitWindowOpenParams, GitWindowOpenResult>(
      'gitWindow:open', async (params: unknown) => {
        this.parseEmpty('gitWindow:open', params);
        return this.resolveHost()?.open() ?? { ok: false, reason: 'not-ready' };
      },
    );
    this.rpcHandler.registerMethod<GitWindowCloseParams, GitWindowCloseResult>(
      'gitWindow:close', async (params: unknown) => {
        this.parseEmpty('gitWindow:close', params);
        const host = this.resolveHost();
        return { closed: host ? await host.close() : false };
      },
    );
    this.rpcHandler.registerMethod<GitWindowStatusParams, GitWindowStatusResult>(
      'gitWindow:status', async (params: unknown) => {
        this.parseEmpty('gitWindow:status', params);
        return { open: this.resolveHost()?.isOpen() ?? false };
      },
    );
    this.rpcHandler.registerMethod<GitWindowPublishScopeParams, GitWindowPublishScopeResult>(
      'gitWindow:publishScope', async (params: unknown) => {
        const parsed = GitWindowPublishScopeParamsSchema.safeParse(params);
        if (!parsed.success) throw new RpcUserError('gitWindow:publishScope: invalid params', 'INVALID_PARAMS');
        return this.resolveHost()?.publishScope(parsed.data.scope) ?? { accepted: false, scope: null };
      },
    );
    this.rpcHandler.registerMethod<GitWindowGetScopeParams, GitWindowGetScopeResult>(
      'gitWindow:getScope', async (params: unknown) => {
        this.parseEmpty('gitWindow:getScope', params);
        return this.resolveHost()?.getScope() ?? null;
      },
    );
    this.rpcHandler.registerMethod<GitWindowSetModeParams, GitWindowSetModeResult>(
      'gitWindow:setMode', async (params: unknown) => {
        const parsed = GitWindowSetModeParamsSchema.safeParse(params);
        if (!parsed.success) throw new RpcUserError('gitWindow:setMode: invalid params', 'INVALID_PARAMS');
        return { accepted: this.resolveHost()?.setMode(parsed.data) ?? false };
      },
    );
  }

  private parseEmpty(method: RpcMethodName, params: unknown): void {
    if (!GitWindowEmptyParamsSchema.safeParse(params).success) {
      throw new RpcUserError(`${method}: invalid params`, 'INVALID_PARAMS');
    }
  }

  private resolveHost(): GitWindowHost | null {
    if (!this.container.isRegistered(PLATFORM_TOKENS.GIT_WINDOW_HOST, true)) return null;
    return this.container.resolve<GitWindowHost>(PLATFORM_TOKENS.GIT_WINDOW_HOST);
  }
}
