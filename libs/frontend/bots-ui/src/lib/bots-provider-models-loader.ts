import { Injectable, inject } from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { ProviderListModelsResult } from '@ptah-extension/shared';
import type { ProviderModelsLoader } from '@ptah-extension/ui';

@Injectable({ providedIn: 'root' })
export class BotsProviderModelsLoader implements ProviderModelsLoader {
  private readonly rpc = inject(ClaudeRpcService);
  public async listModels(
    providerId?: string,
  ): Promise<ProviderListModelsResult> {
    const result = await this.rpc.call('provider:listModels', { providerId });
    if (!result.isSuccess())
      throw new Error('Could not load provider models. Retry.');
    return result.data;
  }
}
