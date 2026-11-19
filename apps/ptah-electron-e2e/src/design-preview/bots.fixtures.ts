import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RpcMethodResult } from '@ptah-extension/shared';
import { test as base, expect } from '../support/fixtures';
import { launchPtah } from '../support/electron-launcher';
import { UiDriver } from '../support/ui-driver';
import { dynamicMocks, staticMocks } from './settings-lanes.fixtures';

/** Fresh real workspace, DB and user data per shot matrix entry. */
export const test = base.extend<{ botsWorkspace: string }>({
  // eslint-disable-next-line no-empty-pattern
  botsWorkspace: async ({}, use) => {
    const workspace = mkdtempSync(join(tmpdir(), 'ptah-bots-shots-'));
    // Keep the isolated workspace for diagnosis, like the launcher's temp DB.
    await use(workspace);
  },
  electronApp: async ({ botsWorkspace }, use) => {
    const app = await launchPtah({ args: [botsWorkspace] });
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  ui: async ({ electronApp, mainWindow, botsWorkspace }, use) => {
    // UiDriver removes real IPC listeners. Retain them before installing its
    // existing setup mocks, then dispatch bots exclusively to the real backend.
    await electronApp.evaluate(({ ipcMain }) => {
      const state = globalThis as typeof globalThis & {
        botsShotListeners?: ReturnType<typeof ipcMain.listeners>;
      };
      state.botsShotListeners = ipcMain.listeners('rpc');
    });
    const driver = new UiDriver(electronApp, mainWindow);
    await driver.installFakeRpcListener();
    await driver.mockRpc({
      ...staticMocks,
      ...dynamicMocks,
      'workspace:getInfo': {
        folders: [botsWorkspace],
        activeFolder: botsWorkspace,
      },
      // Boot consumers need their actual result shapes, not the driver's {} fallback.
      'update:get-state': {
        state: { state: 'idle' },
      } satisfies RpcMethodResult<'update:get-state'>,
      'agent:listMessageReceipts': {
        receipts: [],
      } satisfies RpcMethodResult<'agent:listMessageReceipts'>,
      'agent:listParentDeliveries': {
        deliveries: [],
      } satisfies RpcMethodResult<'agent:listParentDeliveries'>,
      'config:get': {},
      'editor:detectTargets': { success: true, targets: [] },
      'skillsSh:listInstalled': { skills: [] },
      'agent:getClaudeBuiltins': { tools: [] },
    });
    await electronApp.evaluate(({ ipcMain }) => {
      const state = globalThis as typeof globalThis & {
        botsShotListeners?: ReturnType<typeof ipcMain.listeners>;
      };
      const real = state.botsShotListeners;
      if (!real?.length) throw new Error('Real RPC listeners are unavailable');
      const mocked = ipcMain.listeners('rpc');
      ipcMain.removeAllListeners('rpc');
      ipcMain.on('rpc', (event, message: unknown) => {
        const payload =
          typeof message === 'object' &&
          message !== null &&
          'payload' in message
            ? message.payload
            : message;
        const method =
          typeof payload === 'object' && payload !== null && 'method' in payload
            ? payload.method
            : undefined;
        const listeners =
          typeof method === 'string' && method.startsWith('bots:')
            ? real
            : mocked;
        for (const listener of listeners)
          listener.call(ipcMain, event, message);
      });
      delete state.botsShotListeners;
    });
    await mainWindow.evaluate(() =>
      localStorage.setItem(
        'ptah.onboarding.v1',
        JSON.stringify({ shownAt: new Date().toISOString() }),
      ),
    );
    await driver.prepare({
      initialView: 'chat',
      workspaceRoot: botsWorkspace,
      workspaceName: 'Bots design preview',
    });
    await use(driver);
  },
});

export { expect };
