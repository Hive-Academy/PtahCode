/**
 * PR #1038 review — the detached Git window at the host boundary.
 *
 * Finding 1: an allowed method name does not authorize a root. The child is
 * bound to the scope the host acknowledged for it. Finding 2: the Git pushes
 * of the host reach the registered Git child and the main window.
 *
 * The bridge and the Git window host are the real ones; only Electron is fake.
 */

import 'reflect-metadata';

const listeners = new Map<string, (...args: unknown[]) => unknown>();

jest.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => unknown) => {
      listeners.set(channel, listener);
    },
    removeAllListeners: (channel: string) => listeners.delete(channel),
    handle: () => undefined,
    removeHandler: () => undefined,
  },
}));
jest.mock('../windows/window-guards', () => ({
  installNavigationGuard: jest.fn(),
  isOnScreen: () => true,
}));

import * as path from 'path';
import { pathToFileURL } from 'url';
import { container as rootContainer } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { TOKENS } from '@ptah-extension/vscode-core';
import { MESSAGE_TYPES, type GitWindowScope } from '@ptah-extension/shared';
import { IpcBridge } from './ipc-bridge';
import { ElectronGitWindowHost } from '../windows/git-window';
import type {
  DisplayChildWindow,
  DisplayMainWindow,
} from '../windows/display-window';

const TRUSTED_DOCUMENT = path.resolve('/app/renderer/index.html');
const MAIN_ID = 1;
const GIT_ID = 5;
const REPO_A = path.resolve('/work/repo-a');
const REPO_B = path.resolve('/work/repo-b');
const WORKTREE_A = path.resolve('/work/repo-a-wt');

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

function scopeFor(repoRoot: string, workspaceRoot = repoRoot): GitWindowScope {
  return {
    version: 1,
    sequence: 0,
    workspaceRoot,
    repoRoot,
    mode: 'follow-session',
    active: null,
    pinnedTabId: null,
    open: [],
    unresolved: false,
  };
}

describe('IpcBridge — detached Git window scope and pushes', () => {
  let bridge: IpcBridge;
  let host: ElectronGitWindowHost;
  let handleMessage: jest.Mock;
  let main: FakeSender;
  let git: FakeSender;
  let closeChild: () => void;

  beforeEach(async () => {
    listeners.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    handleMessage = jest.fn(async (request: { method: string }) => ({
      success: true,
      data:
        request.method === 'git:worktrees'
          ? { worktrees: [{ path: REPO_A }, { path: WORKTREE_A }] }
          : { method: request.method },
    }));
    const container = rootContainer.createChildContainer();
    container.register(TOKENS.RPC_HANDLER, { useValue: { handleMessage } });
    container.register(PLATFORM_TOKENS.WORKSPACE_STATE_STORAGE, {
      useValue: { get: () => ({}), update: async () => undefined },
    });
    main = makeSender(MAIN_ID);
    git = makeSender(GIT_ID, '?ptahWindow=git');
    bridge = new IpcBridge(
      container,
      () => ({
        webContents: {
          id: MAIN_ID,
          send: main.send,
          isDestroyed: () => false,
        },
      }),
      [TRUSTED_DOCUMENT],
    );
    bridge.initialize();

    let destroyed = false;
    const windowListeners = new Map<string, Array<() => void>>();
    const listen = (event: string, listener: () => void): void => {
      windowListeners.set(event, [
        ...(windowListeners.get(event) ?? []),
        listener,
      ]);
    };
    const emit = (event: string): void => {
      for (const listener of windowListeners.get(event) ?? []) listener();
    };
    const child = {
      webContents: {
        id: GIT_ID,
        send: git.send,
        isDestroyed: () => destroyed,
        on: () => undefined,
      },
      isDestroyed: () => destroyed,
      isMinimized: () => false,
      restore: () => undefined,
      focus: () => undefined,
      close: () => {
        if (destroyed) return;
        emit('close');
        destroyed = true;
        emit('closed');
      },
      getBounds: () => ({ x: 0, y: 0, width: 900, height: 700 }),
      on: listen,
      once: listen,
      loadFile: async () => undefined,
    };
    closeChild = child.close;
    const mainWindow: DisplayMainWindow = {
      isDestroyed: () => false,
      getBounds: () => ({ x: 0, y: 0, width: 900, height: 700 }),
      once: () => undefined,
      removeListener: () => undefined,
    };
    host = new ElectronGitWindowHost({
      getMainWindow: () => mainWindow,
      bridge,
      resolveStateStorage: () => undefined,
      appDir: '/app',
      logger: { error: jest.fn() },
      createWindow: () => child as DisplayChildWindow,
    });
    expect(await host.open()).toEqual({ ok: true });
    expect(host.publishScope(scopeFor(REPO_A)).accepted).toBe(true);
    git.sent.length = 0;
    main.sent.length = 0;
  });

  afterEach(() => {
    bridge.dispose();
    jest.restoreAllMocks();
  });

  async function rpc(
    sender: FakeSender,
    method: string,
    params: unknown,
  ): Promise<void> {
    await listeners.get('rpc')?.(
      { sender, senderFrame: sender.mainFrame },
      {
        type: 'rpc:call',
        payload: { method, params, correlationId: `c-${method}` },
      },
    );
  }

  const outOfScope = (method: string) => ({
    type: MESSAGE_TYPES.RPC_RESPONSE,
    correlationId: `c-${method}`,
    success: false,
    error: `Method '${method}' is outside the scope of the Git window`,
  });

  it.each([
    'git:discard',
    'git:reviewFile',
    'git:commit',
    'git:stage',
    'git:push',
    'git:info',
  ])(
    'refuses %s from the child for a different registered repository',
    async (method) => {
      await rpc(git, method, { workspaceRoot: REPO_B, paths: ['a.ts'] });
      expect(handleMessage).not.toHaveBeenCalled();
      expect(git.sent).toEqual([outOfScope(method)]);
    },
  );

  it('refuses a child call that names no root (the host would use the active folder)', async () => {
    await rpc(git, 'git:discard', { paths: ['a.ts'] });
    expect(handleMessage).not.toHaveBeenCalled();
    expect(git.sent).toEqual([outOfScope('git:discard')]);
  });

  it('routes a child call for the acknowledged repository', async () => {
    await rpc(git, 'git:discard', { workspaceRoot: REPO_A, paths: ['a.ts'] });
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'git:discard' }),
    );
    expect(git.sent).toEqual([
      expect.objectContaining({
        correlationId: 'c-git:discard',
        success: true,
      }),
    ]);
  });

  it('follows a new acknowledged scope and refuses the previous repository', async () => {
    expect(host.publishScope(scopeFor(REPO_B)).accepted).toBe(true);
    git.sent.length = 0;
    await rpc(git, 'git:discard', { workspaceRoot: REPO_A, paths: ['a.ts'] });
    expect(handleMessage).not.toHaveBeenCalled();
    await rpc(git, 'git:discard', { workspaceRoot: REPO_B, paths: ['a.ts'] });
    expect(handleMessage).toHaveBeenCalledTimes(1);
  });

  it('lets the child read, but not change, a worktree the host listed for its repository', async () => {
    await rpc(git, 'git:info', { workspaceRoot: WORKTREE_A });
    expect(handleMessage).not.toHaveBeenCalled();
    await rpc(git, 'git:worktrees', { workspaceRoot: REPO_A });
    handleMessage.mockClear();
    await rpc(git, 'git:info', { workspaceRoot: WORKTREE_A });
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'git:info' }),
    );
    handleMessage.mockClear();
    await rpc(git, 'git:discard', {
      workspaceRoot: WORKTREE_A,
      paths: ['a.ts'],
    });
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it('refuses file and editor calls outside the acknowledged repository', async () => {
    await rpc(git, 'file:saveContent', {
      path: path.join(REPO_B, 'a.ts'),
      content: '',
      expectedSha256: 'x',
    });
    await rpc(git, 'file:viewContent', { path: 'a.ts', workspaceRoot: REPO_B });
    await rpc(git, 'file:viewContent', {
      path: path.join(REPO_A, '..', 'repo-b', 'a.ts'),
      workspaceRoot: REPO_A,
    });
    await rpc(git, 'editor:openWorkspace', { target: 'vscode', root: REPO_B });
    await rpc(git, 'git:watchRoots', { leaseId: 'l', roots: [REPO_A, REPO_B] });
    expect(handleMessage).not.toHaveBeenCalled();
    await rpc(git, 'file:saveContent', {
      path: path.join(REPO_A, 'a.ts'),
      content: '',
      expectedSha256: 'x',
    });
    await rpc(git, 'git:watchRoots', { leaseId: 'l', roots: [REPO_A] });
    expect(handleMessage).toHaveBeenCalledTimes(2);
  });

  it('refuses every scoped call after the child closed', async () => {
    closeChild();
    await rpc(git, 'git:discard', { workspaceRoot: REPO_A, paths: ['a.ts'] });
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it('keeps the main window free to use another registered repository', async () => {
    await rpc(main, 'git:discard', { workspaceRoot: REPO_B, paths: ['a.ts'] });
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'git:discard' }),
    );
  });

  it.each([
    MESSAGE_TYPES.GIT_STATUS_UPDATE,
    MESSAGE_TYPES.FILE_CONTENT_CHANGED,
    MESSAGE_TYPES.GIT_OPERATION_OUTPUT,
    'git:worktreeChanged',
  ])(
    'delivers the %s push to the main window and to the Git child',
    (type) => {
      const message = { type, payload: { workspaceRoot: REPO_A } };
      expect(bridge.sendToRenderer(message)).toBe(true);
      expect(main.sent).toEqual([message]);
      expect(git.sent).toEqual([message]);
    },
  );

  it('keeps unrelated pushes main-only and stops the Git pushes when the child closes', () => {
    const unrelated = { type: 'session:unrelated-push', payload: {} };
    bridge.sendToRenderer(unrelated);
    expect(main.sent).toEqual([unrelated]);
    expect(git.sent).toEqual([]);

    closeChild();
    main.sent.length = 0;
    const status = { type: MESSAGE_TYPES.GIT_STATUS_UPDATE, payload: {} };
    expect(bridge.sendToRenderer(status)).toBe(true);
    expect(git.sent).toEqual([]);
    expect(main.sent).toEqual(expect.arrayContaining([status]));
  });
});
