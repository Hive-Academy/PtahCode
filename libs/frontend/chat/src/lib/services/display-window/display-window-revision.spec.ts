import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, ThemeService, VSCodeService } from '@ptah-extension/core';
import { ActionBannerService } from '../action-banner.service';
import { ArtifactStore } from '../artifact.store';
import { DisplayDockState } from '../display-dock/display-dock.state';
import { DisplayWindowSync } from './display-window-sync.service';

describe('Display window revision regressions', () => {
  const showError = jest.fn();
  const call = jest.fn(async (method: string): Promise<{ success: boolean; data?: unknown }> => ({
    success: true,
    data: method === 'displayWindow:status' ? { supported: true, open: false } : { ok: true },
  }));
  let sync: DisplayWindowSync;
  let dock: DisplayDockState;

  beforeEach(() => {
    call.mockReset();
    call.mockImplementation(async (method: string) => ({
      success: true,
      data: method === 'displayWindow:status' ? { supported: true, open: false } : { ok: true },
    }));
    showError.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: ClaudeRpcService, useValue: { call } },
      { provide: VSCodeService, useValue: { isElectron: true } },
      { provide: ThemeService, useValue: { currentTheme: () => 'dark', isDarkMode: () => true } },
      { provide: ArtifactStore, useValue: { panelArtifacts: () => [] } },
      { provide: ActionBannerService, useValue: { showError } },
    ] });
    sync = TestBed.inject(DisplayWindowSync);
    dock = new DisplayDockState();
    sync.bindSource({ tabId: signal('A'), dock, focusVersion: signal(0) });
  });

  async function flush(): Promise<void> {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 25));
    TestBed.tick();
  }
  const opens = () => call.mock.calls.filter(([method]) => method === 'displayWindow:open');
  const publishedTab = () => {
    const calls = (call.mock.calls as ReadonlyArray<readonly [string, ...unknown[]]>).filter(([method]) => method === 'displayWindow:publishState');
    return calls.at(-1)?.[1];
  };

  it('ignores background tab streams but explicit requests retarget and focus', async () => {
    dock.requestAutoOpen('A', 'turn-A', 'id:a');
    await flush();
    dock.requestAutoOpen('B', 'turn-B', 'id:b');
    await flush();
    expect(publishedTab()).toEqual(expect.objectContaining({ tabId: 'A' }));
    expect(opens()).toHaveLength(1);
    dock.open('B');
    await flush();
    await flush();
    expect(publishedTab()).toEqual(expect.objectContaining({ tabId: 'B' }));
    expect(opens()).toHaveLength(2);
  });

  it.each(['A', 'B'])('preserves explicit A before automatic %s in the same tick', async (tabId) => {
    await sync.focus();
    dock.open('A');
    dock.requestAutoOpen(tabId, 'turn', 'id:new');
    await flush();
    await flush();
    expect(opens()).toHaveLength(2);
    expect(publishedTab()).toEqual(expect.objectContaining({ tabId: 'A' }));
    // After consumption an automatic request may open a different tab again.
    sync.handleMessage({ type: 'displayWindow:closed' });
    dock.requestAutoOpen('B', 'next-turn', 'id:b');
    await flush();
    expect(opens()).toHaveLength(3);
  });

  it('does not mark a closed window detached when the pending open resolves', async () => {
    let resolveOpen: (value: { success: boolean; data: { ok: boolean } }) => void = () => { throw new Error('No pending open'); };
    call.mockImplementationOnce(() => new Promise((resolve) => { resolveOpen = resolve; }));
    dock.requestAutoOpen('A', 'turn', 'id:a');
    TestBed.tick();
    const focus = sync.focus();
    expect(opens()).toHaveLength(1);
    sync.handleMessage({ type: 'displayWindow:closed' });
    resolveOpen({ success: true, data: { ok: true } });
    await focus;
    expect(sync.detached()).toBe(false);
    dock.requestAutoOpen('A', 'turn', 'id:b');
    await flush();
    expect(opens()).toHaveLength(1);
    dock.requestAutoOpen('A', 'new-turn', 'id:c');
    await flush();
    expect(sync.detached()).toBe(true);
    expect(opens()).toHaveLength(2);
    sync.handleMessage({ type: 'displayWindow:closed' });
    dock.requestAutoOpen('new-session', 'session-turn', 'id:d');
    await flush();
    expect(sync.detached()).toBe(true);
    expect(opens()).toHaveLength(3);
  });

  it('reopens on the next automatic update after a close with no live turn', async () => {
    dock.open('A');
    await flush();
    expect(dock.tab('A').liveTurnKey).toBeNull();
    sync.handleMessage({ type: 'displayWindow:closed' });
    dock.requestArtifactAutoOpen('A', 'artifact');
    await flush();
    expect(sync.detached()).toBe(true);
    expect(opens()).toHaveLength(2);
  });

  it.each(['displayWindow:open', 'displayWindow:close'])('notifies on failed %s', async (method) => {
    call.mockResolvedValueOnce({ success: false });
    if (method === 'displayWindow:open') await sync.focus();
    else await sync.attach();
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Could not'));
  });

  it('chains exactly one fresh open after close and concurrent explicit reopens', async () => {
    let resolveOpen: (value: { success: boolean; data: { ok: boolean } }) => void = () => { throw new Error('No pending open'); };
    call.mockImplementationOnce(() => new Promise((resolve) => { resolveOpen = resolve; }));
    dock.requestAutoOpen('A', 'turn', 'id:a');
    TestBed.tick();
    sync.handleMessage({ type: 'displayWindow:closed' });
    dock.open('A');
    TestBed.tick();
    const focus = sync.focus();
    expect(opens()).toHaveLength(1);
    resolveOpen({ success: true, data: { ok: true } });
    await focus;
    await flush();
    expect(opens()).toHaveLength(2);
    expect(sync.detached()).toBe(true);
  });

  it.each([
    { success: false },
    { success: true, data: { ok: false, reason: 'not-ready' } },
  ])('dedupes automatic open failures until explicit intent or success: %j', async (failure) => {
    call.mockResolvedValue(failure);
    for (let update = 0; update < 3; update += 1) {
      dock.requestAutoOpen('A', 'turn', `id:${update}`);
      await flush();
    }
    expect(opens()).toHaveLength(3);
    expect(showError).toHaveBeenCalledTimes(1);
    dock.open('A');
    await flush();
    expect(showError).toHaveBeenCalledTimes(2);
    dock.requestAutoOpen('A', 'turn', 'id:after-explicit');
    await flush();
    expect(showError).toHaveBeenCalledTimes(2);
    call.mockResolvedValueOnce({ success: true, data: { ok: true } });
    dock.requestAutoOpen('A', 'turn', 'id:success');
    await flush();
    expect(sync.detached()).toBe(true);
    sync.handleMessage({ type: 'displayWindow:closed' });
    dock.requestAutoOpen('A', 'new-turn', 'id:failure-again');
    await flush();
    expect(showError).toHaveBeenCalledTimes(3);
  });

  it('falls back to the active tab when the explicitly bound background tab is forgotten', async () => {
    dock.open('B');
    await flush();
    await flush();
    expect(publishedTab()).toEqual(expect.objectContaining({ tabId: 'B' }));
    dock.forgetTab('B');
    dock.requestAutoOpen('A', 'turn', 'id:a');
    await flush();
    await flush();
    expect(publishedTab()).toEqual(expect.objectContaining({ tabId: 'A' }));
    expect(opens()).toHaveLength(1);
  });

  it('does not replay a request when its source is rebound', async () => {
    const reboundDock = new DisplayDockState();
    const source = { tabId: signal('B'), dock: reboundDock, focusVersion: signal(0), passive: true };
    const unbind = sync.bindSource(source);
    reboundDock.open('B');
    await flush();
    unbind();
    await sync.attach();
    // The tab remains open in the released source, with its old focus request.
    sync.bindSource(source);
    await flush();
    expect(opens()).toHaveLength(1);
    expect(sync.detached()).toBe(false);
    reboundDock.open('B');
    await flush();
    expect(opens()).toHaveLength(2);
  });

  it.each(['failure', 'unavailable', 'rejection'])('ignores a late %s after native close', async (kind) => {
    let finish: () => void = () => { throw new Error('No pending open'); };
    call.mockImplementationOnce(() => new Promise((resolve, reject) => {
      finish = () => {
        if (kind === 'rejection') reject(new Error('Open failed'));
        else resolve(kind === 'failure' ? { success: false } : { success: true, data: { ok: false, reason: 'not-ready' } });
      };
    }));
    dock.requestAutoOpen('A', 'turn', 'id:a');
    TestBed.tick();
    sync.handleMessage({ type: 'displayWindow:closed' });
    finish();
    await flush();
    expect(sync.detached()).toBe(false);
    expect(showError).not.toHaveBeenCalled();
    expect(sync.error()).toBeNull();
  });

});
