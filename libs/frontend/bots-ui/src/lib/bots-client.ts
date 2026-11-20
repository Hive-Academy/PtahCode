import { Injectable, inject } from '@angular/core';
import { ClaudeRpcService, type RpcResult } from '@ptah-extension/core';
import type {
  BotAvatarGetResult,
  BotAvatarUploadResult,
  BotsDeleteResult,
  BotsGetResult,
  BotsListResult,
  BotsPreviewImportResult,
  BotsRpcMethods,
  BotsWriteResult,
} from '@ptah-extension/shared';

/** Typed transport facade. Returns RpcResult unchanged so errorCode stays available. */
@Injectable({ providedIn: 'root' })
export class BotsClient {
  private readonly rpc = inject(ClaudeRpcService);

  // Wire inputs preserve schema defaults; ID-based calls rely on host workspace context.
  public list(
    params: BotsRpcMethods['bots:list']['params'],
  ): Promise<RpcResult<BotsListResult>> {
    return this.rpc.call('bots:list', params);
  }

  public get(
    params: BotsRpcMethods['bots:get']['params'],
  ): Promise<RpcResult<BotsGetResult>> {
    return this.rpc.call('bots:get', params);
  }

  public create(
    params: BotsRpcMethods['bots:create']['params'],
  ): Promise<RpcResult<BotsWriteResult>> {
    return this.rpc.call('bots:create', params);
  }

  public update(
    params: BotsRpcMethods['bots:update']['params'],
  ): Promise<RpcResult<BotsWriteResult>> {
    return this.rpc.call('bots:update', params);
  }

  public setEnabled(
    params: BotsRpcMethods['bots:set-enabled']['params'],
  ): Promise<RpcResult<BotsWriteResult>> {
    return this.rpc.call('bots:set-enabled', params);
  }

  public archive(
    params: BotsRpcMethods['bots:archive']['params'],
  ): Promise<RpcResult<BotsWriteResult>> {
    return this.rpc.call('bots:archive', params);
  }

  public restore(
    params: BotsRpcMethods['bots:restore']['params'],
  ): Promise<RpcResult<BotsWriteResult>> {
    return this.rpc.call('bots:restore', params);
  }

  public delete(
    params: BotsRpcMethods['bots:delete']['params'],
  ): Promise<RpcResult<BotsDeleteResult>> {
    return this.rpc.call('bots:delete', params);
  }

  public previewImport(
    params: BotsRpcMethods['bots:preview-import']['params'],
  ): Promise<RpcResult<BotsPreviewImportResult>> {
    return this.rpc.call('bots:preview-import', params);
  }

  public uploadAvatar(
    params: BotsRpcMethods['bots:upload-avatar']['params'],
  ): Promise<RpcResult<BotAvatarUploadResult>> {
    return this.rpc.call('bots:upload-avatar', params);
  }

  public getAvatar(
    params: BotsRpcMethods['bots:get-avatar']['params'],
  ): Promise<RpcResult<BotAvatarGetResult>> {
    return this.rpc.call('bots:get-avatar', params);
  }
}
