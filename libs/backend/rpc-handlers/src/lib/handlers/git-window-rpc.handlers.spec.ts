import 'reflect-metadata';
import type { DependencyContainer } from 'tsyringe';
import { PLATFORM_TOKENS, type GitWindowHost } from '@ptah-extension/platform-core';
import type { GitWindowScope, GitWindowSetModeParams } from '@ptah-extension/shared';
import type { RpcHandler } from '@ptah-extension/vscode-core';
import { GitWindowRpcHandlers } from './git-window-rpc.handlers';

type Handler = (params: unknown) => Promise<unknown>;
const scope: GitWindowScope = {
  version: 1, sequence: 0, workspaceRoot: null, repoRoot: null,
  mode: 'follow-session', active: null, pinnedTabId: null, open: [], unresolved: true,
};
function setup(host?: GitWindowHost) {
  const methods = new Map<string, Handler>();
  const rpc = { registerMethod: jest.fn((name: string, handler: Handler) => methods.set(name, handler)) } as Partial<RpcHandler> as RpcHandler;
  const container = {
    isRegistered: jest.fn((token: symbol) => token === PLATFORM_TOKENS.GIT_WINDOW_HOST && !!host),
    resolve: jest.fn(() => host),
  } as Partial<DependencyContainer> as DependencyContainer;
  new GitWindowRpcHandlers(rpc, container).register();
  const call = (method: string, params: unknown) => {
    const handler = methods.get(method);
    if (!handler) throw new Error(`Missing ${method}`);
    return handler(params);
  };
  return { call, methods };
}
function fakeHost(): jest.Mocked<GitWindowHost> {
  return {
    open: jest.fn(async () => ({ ok: true as const })), close: jest.fn(async () => true),
    isOpen: jest.fn(() => true), publishScope: jest.fn((value) => ({ accepted: true, scope: value })),
    getScope: jest.fn(() => scope), setMode: jest.fn((_params: GitWindowSetModeParams) => true),
  };
}
describe('GitWindowRpcHandlers', () => {
  it('registers the exact method family and answers when the host is unbound', async () => {
    const h = setup();
    expect([...h.methods.keys()].sort()).toEqual([...GitWindowRpcHandlers.METHODS].sort());
    expect(await h.call('gitWindow:open', {})).toEqual({ ok: false, reason: 'not-ready' });
    expect(await h.call('gitWindow:close', {})).toEqual({ closed: false });
    expect(await h.call('gitWindow:status', {})).toEqual({ open: false });
    expect(await h.call('gitWindow:publishScope', { scope })).toEqual({ accepted: false, scope: null });
    expect(await h.call('gitWindow:getScope', {})).toBeNull();
    expect(await h.call('gitWindow:setMode', { mode: 'follow-session', tabId: null })).toEqual({ accepted: false });
  });
  it('delegates valid calls through the host, including child mode relay', async () => {
    const host = fakeHost(); const h = setup(host);
    expect(await h.call('gitWindow:open', {})).toEqual({ ok: true });
    expect(await h.call('gitWindow:close', {})).toEqual({ closed: true });
    expect(await h.call('gitWindow:status', {})).toEqual({ open: true });
    expect(await h.call('gitWindow:publishScope', { scope })).toEqual({ accepted: true, scope });
    expect(host.publishScope).toHaveBeenCalledWith(scope);
    expect(await h.call('gitWindow:getScope', {})).toEqual(scope);
    const mode = { mode: 'pinned', tabId: 'tab-1' } as const;
    expect(await h.call('gitWindow:setMode', mode)).toEqual({ accepted: true });
    expect(host.setMode).toHaveBeenCalledWith(mode);
  });
  it.each(GitWindowRpcHandlers.METHODS)('rejects invalid params for %s', async (method) => {
    const host = fakeHost(); const h = setup(host);
    await expect(h.call(method, { unexpected: true })).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
    expect(host.open).not.toHaveBeenCalled();
    expect(host.publishScope).not.toHaveBeenCalled();
    expect(host.setMode).not.toHaveBeenCalled();
  });
  it('rejects malformed bounded scope and invalid mode', async () => {
    const host = fakeHost(); const h = setup(host);
    await expect(h.call('gitWindow:publishScope', { scope: { ...scope, open: Array(101).fill({}) } })).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
    await expect(h.call('gitWindow:setMode', { mode: 'pinned', tabId: '' })).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
  });
});


