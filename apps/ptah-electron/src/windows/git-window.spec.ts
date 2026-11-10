const onScreen = jest.fn(() => true);
jest.mock('./window-guards', () => ({
  installNavigationGuard: jest.fn(),
  isOnScreen: () => onScreen(),
}));

import type { Rectangle } from 'electron';
import * as path from 'path';
import type { IStateStorage } from '@ptah-extension/platform-core';
import type { GitWindowScope } from '@ptah-extension/shared';
import { ChildWindowRegistry } from './child-window-registry';
import { ElectronGitWindowHost } from './git-window';
import type { DisplayChildWindow, DisplayMainWindow } from './display-window';

const scope: GitWindowScope = {
  version: 1, sequence: 0, workspaceRoot: '/work', repoRoot: '/work',
  mode: 'follow-session', active: null, pinnedTabId: null, open: [], unresolved: false,
};

function fixture() {
  const registry = new ChildWindowRegistry();
  const messages: unknown[] = [];
  const children: Array<ReturnType<typeof child>> = [];
  let mainClosed: (() => void) | undefined;
  const main = {
    isDestroyed: jest.fn(() => false),
    getBounds: jest.fn((): Rectangle => ({ x: 100, y: 50, width: 900, height: 700 })),
    once: jest.fn((_event: 'closed', listener: () => void) => { mainClosed = listener; }),
    removeListener: jest.fn(),
  } satisfies DisplayMainWindow;
  const bridge = { childWindows: registry, sendToRenderer: jest.fn((message: unknown) => { messages.push(message); return true; }) };
  const storage = {
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
    update: jest.fn(async () => undefined),
    keys: () => [],
  } satisfies IStateStorage;
  const host = new ElectronGitWindowHost({
    getMainWindow: () => main,
    bridge,
    resolveStateStorage: () => storage,
    appDir: '/app',
    logger: { error: jest.fn() },
    createWindow: () => {
      const value = child(children.length + 11);
      children.push(value);
      return value as DisplayChildWindow;
    },
  });
  return { host, registry, bridge, messages, children, main, closeMain: () => mainClosed?.() };
}

function child(id: number) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const on = (event: string, listener: (...args: unknown[]) => void) => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };
  let destroyed = false;
  const window = {
    webContents: {
      id,
      send: jest.fn(),
      isDestroyed: () => destroyed,
      on: jest.fn((event: string, listener: (...args: unknown[]) => void) => on(event, listener)),
    },
    isDestroyed: () => destroyed,
    isMinimized: jest.fn(() => false),
    restore: jest.fn(), focus: jest.fn(),
    close: jest.fn(() => { if (destroyed) return; emit('close'); destroyed = true; emit('closed'); }),
    getBounds: jest.fn((): Rectangle => ({ x: 10, y: 10, width: 620, height: 760 })),
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => on(event, listener)),
    once: jest.fn((event: string, listener: (...args: unknown[]) => void) => on(event, listener)),
    loadFile: jest.fn(async (_file: string, _options: { query: Record<string, string> }) => undefined),
    emit,
  };
  return window;
}

describe('ElectronGitWindowHost', () => {
  it('loads the Git renderer once and focuses the singleton', async () => {
    const f = fixture();
    expect(await f.host.open()).toEqual({ ok: true });
    expect(f.children[0].loadFile).toHaveBeenCalledWith(path.join('/app', 'renderer', 'index.html'), { query: { ptahWindow: 'git' } });
    expect(await f.host.open()).toEqual({ ok: true });
    expect(f.children).toHaveLength(1);
    expect(f.children[0].focus).toHaveBeenCalledTimes(1);
  });

  it('unregisters the sender before close and emits closed once', async () => {
    const f = fixture();
    await f.host.open();
    expect(f.registry.sender(11)?.viewKind).toBe('git');
    expect(await f.host.close()).toBe(true);
    expect(f.registry.sender(11)).toBeNull();
    expect(await f.host.close()).toBe(false);
    expect(f.messages).toEqual([{ type: 'gitWindow:closed' }]);
  });

  it('closes with the main window and skips restore on app quit', async () => {
    const f = fixture();
    await f.host.open();
    f.main.isDestroyed.mockReturnValue(true);
    f.closeMain();
    expect(f.children[0].close).toHaveBeenCalledTimes(1);
    expect(f.messages).toEqual([]);
    const next = fixture();
    await next.host.open();
    next.registry.closeAll();
    expect(next.children[0].close).toHaveBeenCalledTimes(1);
    expect(next.messages).toEqual([]);
  });

  it('tears down failed loads and tells main to restore', async () => {
    const f = fixture();
    await f.host.open();
    f.children[0].emit('did-fail-load', {}, -6, 'failed', '', true);
    expect(f.children[0].close).toHaveBeenCalledTimes(1);
    expect(f.registry.sender(11)).toBeNull();
    expect(f.messages).toEqual([{ type: 'gitWindow:closed' }]);
  });

  it('keeps the sequence across renderer reload and rejects invalid scopes', async () => {
    const f = fixture();
    await f.host.open();
    expect(f.host.publishScope(scope).scope?.sequence).toBe(1);
    expect(f.host.publishScope({ ...scope, sequence: 0 }).scope?.sequence).toBe(2);
    expect(f.host.publishScope({ ...scope, workspaceRoot: '' }).accepted).toBe(false);
    expect(f.host.getScope()?.sequence).toBe(2);
    f.children[0].close();
    expect(f.host.publishScope(scope).accepted).toBe(false);
    await f.host.open();
    expect(f.host.publishScope(scope).scope?.sequence).toBe(3);
  });
});
