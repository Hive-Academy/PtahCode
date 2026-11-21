import 'reflect-metadata';
import { container, type DependencyContainer } from 'tsyringe';
import { SessionId } from '@ptah-extension/shared';
import { TOKENS, Logger } from '@ptah-extension/vscode-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { registerCodexChatServices } from './register';
import { SDK_TOKENS } from './tokens';
import type { SessionApprovalRouter } from '../codex-app-server/session-approval-router';
import { SessionTurnStateRegistry } from '../helpers/session-turn-state.registry';
import { ProviderSessionChatAdapter } from '../provider-session/provider-session-chat-adapter';
import type { ProviderSessionChatPorts } from '../provider-session/provider-session-chat-ports';

function mockLogger(): Logger {
  return Object.assign(Object.create(Logger.prototype), createMockLogger());
}

function providerSessionPorts(): ProviderSessionChatPorts {
  const unused = (): never => {
    throw new Error('Unexpected call to an unused provider-session port');
  };
  return {
    info: {
      id: 'ptah-cli',
      name: 'Antigravity',
      vendor: 'Google',
      version: '1',
      description: 'Provider session',
      capabilities: {
        streaming: true,
        fileAttachments: false,
        contextManagement: false,
        sessionPersistence: true,
        multiTurn: true,
        codeGeneration: true,
        imageAnalysis: false,
        functionCalling: true,
      },
    },
    prepare: unused,
    acquire: unused,
    release: unused,
    holds: unused,
    releaseAll: jest.fn(async () => undefined),
    identity: { save: unused },
    presentation: { present: jest.fn(), cancelPrompt: jest.fn() },
    publish: unused,
    publishNotice: unused,
  };
}

function scopeWithSdk(): DependencyContainer {
  const scope = container.createChildContainer();
  scope.registerInstance(TOKENS.LOGGER, mockLogger());
  scope.registerInstance(SDK_TOKENS.SDK_PERMISSION_HANDLER, {
    handleResponse: jest.fn(),
  });
  scope.registerInstance(
    SDK_TOKENS.SDK_SESSION_TURN_STATE_REGISTRY,
    new SessionTurnStateRegistry(),
  );
  return scope;
}

const address = {
  sessionId: SessionId.from('66666666-6666-4666-8666-666666666666'),
  threadId: 'native-1',
  requestId: 'req-1',
};

describe('provider-session chat composition', () => {
  it('resolves no adapter when the host bound no provider-session ports', () => {
    const scope = scopeWithSdk();
    registerCodexChatServices(scope);
    expect(scope.resolve(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER)).toBeNull();
  });

  it('builds one cached adapter from the bound ports', () => {
    const scope = scopeWithSdk();
    const ports = providerSessionPorts();
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, ports);
    registerCodexChatServices(scope);
    const adapter = scope.resolve(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER);
    expect(adapter).toBeInstanceOf(ProviderSessionChatAdapter);
    expect(scope.resolve(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER)).toBe(adapter);
    (adapter as ProviderSessionChatAdapter).dispose();
    expect(ports.releaseAll).toHaveBeenCalledTimes(1);
  });

  it('presents a provider-session prompt cancellation through its own host', () => {
    const scope = scopeWithSdk();
    const ports = providerSessionPorts();
    const codexCancel = jest.fn();
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, ports);
    scope.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS, {
      presentation: { cancelPrompt: codexCancel },
    });
    registerCodexChatServices(scope);
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER, {
      owns: (id: string) => id === address.sessionId,
    });
    const router = scope.resolve<SessionApprovalRouter>(
      SDK_TOKENS.SESSION_APPROVAL_ROUTER,
    );
    router.register(address, {
      kind: 'provider-session',
      sink: {
        sessionId: address.sessionId,
        contextId: 'ctx',
        respond: () => true,
        cancel: () => true,
      },
    });
    router.cancelPrompt(address, 'timeout');
    expect(ports.presentation.cancelPrompt).toHaveBeenCalledWith({
      sessionId: address.sessionId,
      requestId: 'req-1',
      reason: 'timeout',
    });
    expect(codexCancel).not.toHaveBeenCalled();
  });

  it('keeps other cancellations on the Codex host, else the provider-session host', () => {
    const withCodex = scopeWithSdk();
    const ports = providerSessionPorts();
    const codexCancel = jest.fn();
    withCodex.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, ports);
    withCodex.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS, {
      presentation: { cancelPrompt: codexCancel },
    });
    registerCodexChatServices(withCodex);
    const router = withCodex.resolve<SessionApprovalRouter>(
      SDK_TOKENS.SESSION_APPROVAL_ROUTER,
    );
    router.register(address, { kind: 'claude' });
    router.cancelPrompt(address, 'disposed');
    expect(codexCancel).toHaveBeenCalledTimes(1);
    expect(ports.presentation.cancelPrompt).not.toHaveBeenCalled();

    const withoutCodex = scopeWithSdk();
    const only = providerSessionPorts();
    withoutCodex.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, only);
    registerCodexChatServices(withoutCodex);
    const onlyRouter = withoutCodex.resolve<SessionApprovalRouter>(
      SDK_TOKENS.SESSION_APPROVAL_ROUTER,
    );
    onlyRouter.register(address, { kind: 'claude' });
    onlyRouter.cancelPrompt(address, 'disposed');
    expect(only.presentation.cancelPrompt).toHaveBeenCalledTimes(1);
  });
});
