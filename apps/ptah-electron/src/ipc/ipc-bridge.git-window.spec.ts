/**
 * TASK_2026_853_3401 batch 7 — the detached Git window's IPC role.
 *
 * The child window shares the preload and the renderer document with the main
 * window. Once the registry trusts it, it may call only
 * `GIT_WINDOW_ALLOWED_METHODS` on `rpc` and read `get-state`. Everything
 * else is refused, and the main window keeps its full surface.
 */

import 'reflect-metadata';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const handlers = new Map<string, (...args: unknown[]) => unknown>();

jest.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => unknown) => {
      listeners.set(channel, listener);
    },
    removeAllListeners: (channel: string) => listeners.delete(channel),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}));

import * as path from 'path';
import { pathToFileURL } from 'url';
import { container as rootContainer } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { TOKENS } from '@ptah-extension/vscode-core';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import { IpcBridge } from './ipc-bridge';
import { GIT_WINDOW_ALLOWED_METHODS } from '../windows/git-window';

const TRUSTED_DOCUMENT = path.resolve('/app/renderer/index.html');
const MAIN_ID = 1;
const GIT_ID = 5;

interface FakeSender {
  readonly id: number;
  readonly mainFrame: { readonly url: string };
  readonly sent: unknown[];
  send(channel: string, message: unknown): void;
  isDestroyed(): boolean;
}

function makeSender(id: number, query = ''): FakeSender {
  const sent: unknown[] = [];
  return {
    id,
    mainFrame: { url: `${pathToFileURL(TRUSTED_DOCUMENT).href}${query}` },
    sent,
    send: (_channel: string, message: unknown) => {
      sent.push(message);
    },
    isDestroyed: () => false,
  };
}

function eventFrom(sender: FakeSender): {
  sender: FakeSender;
  senderFrame: FakeSender['mainFrame'];
  returnValue?: unknown;
} {
  return { sender, senderFrame: sender.mainFrame };
}

describe('IpcBridge — detached Git window sender role', () => {
  let bridge: IpcBridge;
  let handleMessage: jest.Mock;
  let storageUpdate: jest.Mock;
  let main: FakeSender;
  let git: FakeSender;
  let capture: jest.Mock;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    listeners.clear();
    handlers.clear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    handleMessage = jest.fn(async (request: { method: string }) => ({
      success: true,
      data: { method: request.method },
    }));
    storageUpdate = jest.fn(async () => undefined);
    capture = jest.fn(async () => '/tmp/x.cpuprofile');
    const container = rootContainer.createChildContainer();
    container.register(TOKENS.RPC_HANDLER, { useValue: { handleMessage } });
    container.register(PLATFORM_TOKENS.WORKSPACE_STATE_STORAGE, {
      useValue: {
        get: () => ({ ptahRoute: { route: '/chat' } }),
        update: storageUpdate,
      },
    });
    container.register(TOKENS.CPU_PROFILE_CAPTURE, {
      useValue: { captureFor: capture },
    });
    main = makeSender(MAIN_ID);
    git = makeSender(GIT_ID, '?ptahWindow=git');
    bridge = new IpcBridge(
      container,
      () => ({ webContents: { id: MAIN_ID, send: jest.fn() } }),
      [TRUSTED_DOCUMENT],
    );
    bridge.initialize();
  });

  afterEach(() => {
    bridge.dispose();
    jest.restoreAllMocks();
  });

  async function rpc(sender: FakeSender, method: string): Promise<void> {
    await listeners.get('rpc')?.(eventFrom(sender), {
      type: 'rpc:call',
      payload: { method, params: {}, correlationId: `c-${method}` },
    });
  }

  function trustGit() {
    const window = {
      webContents: { id: GIT_ID },
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => undefined,
      focus: () => undefined,
      close: () => undefined,
      once: () => undefined,
      loadFile: async () => undefined,
    };
    bridge.childWindows.registerView('git', { singleton: true, allowedMethods: GIT_WINDOW_ALLOWED_METHODS });
    bridge.childWindows.register('git', 'default', window);
    return window;
  }

  it('lists exactly the git-window methods', () => {
    expect([...GIT_WINDOW_ALLOWED_METHODS].sort()).toEqual([
      'editor:detectTargets',
      'editor:openFile',
      'editor:openMerge',
      'editor:openWorkspace',
      'file:saveContent',
      'file:viewContent',
      'git:addWorktree',
      'git:applyHunks',
      'git:branches',
      'git:cancelOperation',
      'git:checkout',
      'git:commit',
      'git:diffFile',
      'git:discard',
      'git:fetch',
      'git:generateCommitMessage',
      'git:info',
      'git:lastCommit',
      'git:log',
      'git:operationAbort',
      'git:operationContinue',
      'git:prStatus',
      'git:pull',
      'git:push',
      'git:remotes',
      'git:removeWorktree',
      'git:reviewChanges',
      'git:reviewFile',
      'git:stage',
      'git:stashApply',
      'git:stashDrop',
      'git:stashList',
      'git:stashPop',
      'git:stashShow',
      'git:unstage',
      'git:watchRoots',
      'git:worktrees',
      'gitWindow:close',
      'gitWindow:getScope',
      'gitWindow:setMode',
      'settings:get',
      'settings:set',
    ]);
  });

  it('drops every call from the child before it is trusted', async () => {
    await rpc(git, 'gitWindow:getScope');
    expect(handleMessage).not.toHaveBeenCalled();
    expect(git.sent).toEqual([]);
  });

  it.each([...GIT_WINDOW_ALLOWED_METHODS])(
    'routes the allowed method %s and replies to the child',
    async (method) => {
      trustGit();
      await rpc(git, method);
      expect(handleMessage).toHaveBeenCalledWith(
        expect.objectContaining({ method }),
      );
      expect(git.sent).toEqual([
        expect.objectContaining({
          type: MESSAGE_TYPES.RPC_RESPONSE,
          correlationId: `c-${method}`,
          success: true,
        }),
      ]);
      expect(main.sent).toEqual([]);
    },
  );

  it.each([
    'chat:start',
    'gitWindow:publishScope',
    'gitWindow:open',
    'gitWindow:status',
    'git:tags',
    'git:showFile',
    'git:turnChangeSets',
  ])('answers %s from the child with an RPC error and never routes it', async (method) => {
    trustGit();
    await rpc(git, method);
    expect(handleMessage).not.toHaveBeenCalled();
    expect(git.sent).toEqual([
      {
        type: MESSAGE_TYPES.RPC_RESPONSE,
        correlationId: `c-${method}`,
        success: false,
        error: `Method '${method}' is not available in the Git window`,
      },
    ]);
  });

  it('keeps the main window unrestricted while the child is trusted', async () => {
    trustGit();
    await rpc(main, 'chat:start');
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'chat:start' }),
    );
    expect(main.sent).toEqual([
      expect.objectContaining({ correlationId: 'c-chat:start', success: true }),
    ]);
  });

  it('refuses fire-and-forget messages from the child', async () => {
    trustGit();
    const message = {
      type: MESSAGE_TYPES.AGENT_MONITOR_PERMISSION_RESPONSE,
      payload: { requestId: 'r1', decision: 'allow' },
    };
    await listeners.get('rpc')?.(eventFrom(git), message);
    await new Promise((resolve) => setImmediate(resolve));
    expect(handleMessage).not.toHaveBeenCalled();

    await listeners.get('rpc')?.(eventFrom(main), message);
    await new Promise((resolve) => setImmediate(resolve));
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'agent:permissionResponse' }),
    );
  });

  it('lets the child read get-state but not write set-state', async () => {
    trustGit();
    const read = eventFrom(git);
    listeners.get('get-state')?.(read);
    expect(read.returnValue).toEqual({ ptahRoute: { route: '/chat' } });

    await listeners.get('set-state')?.(eventFrom(git), { evil: true });
    expect(storageUpdate).not.toHaveBeenCalled();

    await listeners.get('set-state')?.(eventFrom(main), { ok: true });
    expect(storageUpdate).toHaveBeenCalledWith('webview-state', { ok: true });
  });

  it('refuses diag:cpu-profile from the child', async () => {
    trustGit();
    await expect(
      handlers.get('diag:cpu-profile')?.(eventFrom(git), 5_000),
    ).rejects.toThrow('Git window');
    expect(capture).not.toHaveBeenCalled();
  });

  it('drops a spoofed webContents id and a subframe', async () => {
    trustGit();
    const spoof = makeSender(99, '?ptahWindow=git');
    await rpc(spoof, 'gitWindow:getScope');
    expect(handleMessage).not.toHaveBeenCalled();
    expect(spoof.sent).toEqual([]);

    const subframe = { sender: git, senderFrame: { url: git.mainFrame.url } };
    await listeners.get('rpc')?.(subframe, {
      type: 'rpc:call',
      payload: { method: 'gitWindow:getScope', params: {}, correlationId: 'subframe' },
    });
    expect(handleMessage).not.toHaveBeenCalled();
    expect(git.sent).toEqual([]);
  });
  it('stops trusting the child after unregister', async () => {
    const trustedWindow = trustGit();
    bridge.childWindows.unregister('git', 'default', trustedWindow);
    await rpc(git, 'gitWindow:getScope');
    const read = eventFrom(git);
    listeners.get('get-state')?.(read);
    expect(handleMessage).not.toHaveBeenCalled();
    expect(git.sent).toEqual([]);
    expect(read.returnValue).toEqual({});
    expect(warn).toHaveBeenCalled();
  });
});






