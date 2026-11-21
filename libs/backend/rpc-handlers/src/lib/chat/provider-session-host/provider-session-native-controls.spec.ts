import 'reflect-metadata';
import { resolve } from 'node:path';
import { ProviderSessionChatAdapterError } from '@ptah-extension/agent-sdk';
import type { ISettingsStore } from '@ptah-extension/settings-core';
import { SessionId } from '@ptah-extension/shared';
import { createProviderSessionNativeControls } from './provider-session-native-controls';

describe('provider-session native controls', () => {
  const id = SessionId.from('11111111-1111-4111-8111-111111111111');
  function harness() {
    const data = new Map<string, unknown>();
    const store: ISettingsStore = {
      readGlobal: <T>(key: string) => data.get(key) as T | undefined,
      writeGlobal: jest.fn(async (key: string, value: unknown) => {
        if (value === undefined) data.delete(key);
        else data.set(key, value);
      }),
      readSecret: jest.fn(),
      writeSecret: jest.fn(),
      deleteSecret: jest.fn(),
      watchGlobal: jest.fn(),
      watchSecret: jest.fn(),
      flushSync: jest.fn(),
    };
    const adapter = {
      getSessionToken: jest.fn().mockReturnValue('token'),
      setSessionModel: jest.fn().mockResolvedValue(undefined),
      setSessionEffort: jest.fn().mockResolvedValue(undefined),
      setSessionPermissionLevel: jest.fn().mockResolvedValue(undefined),
      canSendFollowUp: jest.fn().mockReturnValue(true),
      interruptCurrentTurn: jest.fn().mockResolvedValue(true),
      executeSlashCommand: jest.fn(),
    };
    const streamEventsToWebview = jest.fn();
    const controls = createProviderSessionNativeControls({
      store,
      adapter,
      appScope: 'app.electron',
      settings: () => ({
        workspacePath: resolve('/projects/session'),
        authKey: 'thirdParty.grok-cli',
        model: 'grok-4',
        permissionLevel: 'ask',
      }),
      broadcaster: { streamEventsToWebview },
      tabId: () => 'tab',
    });
    return { controls, adapter, data, streamEventsToWebview };
  }

  it('refuses /compact before any adapter call or stream', async () => {
    const h = harness();
    const refusal = h.controls.compact(id);
    await expect(refusal).rejects.toBeInstanceOf(ProviderSessionChatAdapterError);
    await expect(refusal).rejects.toMatchObject({
      code: 'unsupported-option',
      option: '/compact',
    });
    expect(h.adapter.executeSlashCommand).not.toHaveBeenCalled();
    expect(h.streamEventsToWebview).not.toHaveBeenCalled();
  });

  it('applies and saves a live permission change like the Codex controls', async () => {
    const h = harness();
    await expect(h.controls.setPermission(id, 'auto-edit')).resolves.toEqual({
      timing: 'nextTurn',
      revision: 1,
    });
    expect(h.adapter.setSessionPermissionLevel).toHaveBeenCalledWith(id, 'auto-edit');
    expect([...h.data.values()]).toEqual(expect.arrayContaining([true, 'auto-edit']));
  });

  it('delegates follow-up admission and interrupt to the adapter', async () => {
    const h = harness();
    expect(h.controls.canSendFollowUp(id)).toBe(true);
    await expect(h.controls.interrupt(id)).resolves.toBe(true);
    expect(h.adapter.interruptCurrentTurn).toHaveBeenCalledWith(id);
  });
});
