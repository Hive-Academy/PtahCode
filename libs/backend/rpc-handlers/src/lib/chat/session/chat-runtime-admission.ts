import type { RuntimeAdmissionPort } from '@ptah-extension/agent-sdk';
import type { WorkspaceProviderProfileResolver } from '@ptah-extension/auth-providers';
import type {
  IPlatformInfo,
  IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import type { RuntimeHostCapabilities } from '@ptah-extension/shared';
import type { WebviewManager } from '../streaming/chat-stream-broadcaster.service';
import { ChatRuntimeProfileService } from './chat-runtime-profile.service';

/** Host inputs of chat runtime admission; none of them is runtime-specific. */
export interface ChatRuntimeAdmissionDeps {
  resolver: Pick<WorkspaceProviderProfileResolver, 'resolveExecutionProfile'>;
  workspaceProvider: IWorkspaceProvider;
  platformInfo: Pick<IPlatformInfo, 'extensionPath' | 'globalStoragePath'>;
  hostCapabilities: RuntimeHostCapabilities;
  webviewManager: Pick<WebviewManager, 'broadcastMessage'>;
}

/** The chat runtime profile service a host builds from admission inputs. */
export function createChatRuntimeProfileService(
  deps: ChatRuntimeAdmissionDeps,
): ChatRuntimeProfileService {
  return new ChatRuntimeProfileService(
    deps.resolver,
    deps.workspaceProvider,
    deps.platformInfo,
    deps.webviewManager,
    deps.hostCapabilities,
  );
}

/**
 * Runtime-neutral admission (A14): the serving provider of a chat start is
 * whatever chat preparation resolves, for every runtime kind.
 */
export function createChatRuntimeAdmission(
  deps: ChatRuntimeAdmissionDeps,
): RuntimeAdmissionPort {
  const service = createChatRuntimeProfileService(deps);
  return {
    servingProviderId: async (config) => {
      const execution = await service.prepare(config);
      return execution.runtime === 'claude-sdk'
        ? execution.providerProfile?.providerId
        : execution.seed.providerId;
    },
  };
}
