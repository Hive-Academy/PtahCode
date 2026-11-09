import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import { QueuedFollowUpStore, TabManagerService } from '@ptah-extension/chat-state';
import type { TabState } from '@ptah-extension/chat-types';
import { MessageDispatchService } from './chat-store/message-dispatch.service';
import { AutoHandoffSourceCloserService } from './auto-handoff-source-closer.service';

const request = { requestId: 'r1', predecessorTabId: 'tab-1', predecessorSdkId: 'sdk-1' };
const tab = (changes: Partial<TabState> = {}): TabState => ({
  id: 'tab-1', claudeSessionId: 'sdk-1', status: 'loaded', isDirty: false,
  pendingBackgroundTasks: [], commandCenterOrigin: null, ...changes,
} as TabState);

describe('AutoHandoffSourceCloserService', () => {
  let currentTab: TabState | null;
  let queued: boolean;
  let permission: boolean;
  let close: jest.Mock;
  let call: jest.Mock;
  let info: jest.Mock;
  let warn: jest.Mock;
  let service: AutoHandoffSourceCloserService;

  beforeEach(() => {
    currentTab = tab(); queued = false; permission = false;
    close = jest.fn().mockResolvedValue(true);
    call = jest.fn().mockResolvedValue({ success: true });
    info = jest.fn();
    warn = jest.fn();
    TestBed.configureTestingModule({ providers: [
      AutoHandoffSourceCloserService,
      { provide: TabManagerService, useValue: {
        closeHandoffPredecessor: close,
        findTabByIdAcrossWorkspaces: () => currentTab ? { tab: currentTab, workspacePath: '/ws' } : null,
      } },
      { provide: MessageDispatchService, useValue: { hasPendingPermissionForTab: () => permission } },
      { provide: QueuedFollowUpStore, useValue: { forTab: () => queued ? [{}] : [] } },
      { provide: LoggingService, useValue: { info, warn } },
      { provide: ClaudeRpcService, useValue: { call } },
    ] });
    service = TestBed.inject(AutoHandoffSourceCloserService);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('replies true after the exact-pair close resolves, with no extra abort', async () => {
    let finish: (closed: boolean) => void = () => undefined;
    close.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const pending = service.closePredecessor(request);
    expect(close).toHaveBeenCalledWith('tab-1', 'sdk-1');
    expect(call).not.toHaveBeenCalled();
    finish(true);
    await pending;
    expect(call.mock.calls).toEqual([['session:handoffCloseResult', { requestId: 'r1', outcome: 'closed' }]]);
  });

  it('mismatched SDK id replies false and leaves the tab open', async () => {
    currentTab = tab({ claudeSessionId: 'other' as TabState['claudeSessionId'] });
    await service.closePredecessor(request);
    expect(close).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'blocked' });
  });

  it('missing tab replies absent', async () => {
    currentTab = null;
    await service.closePredecessor(request);
    expect(close).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'absent' });
  });

  it.each([null, undefined])('null SDK id matches an unset tab session (%s)', async (sdkId) => {
    currentTab = tab({ claudeSessionId: sdkId as TabState['claudeSessionId'] });
    await service.closePredecessor({ ...request, predecessorSdkId: null });
    expect(close).toHaveBeenCalledWith('tab-1', null);
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'closed' });
  });

  it('null SDK id does not match a bound tab', async () => {
    await service.closePredecessor({ ...request, predecessorSdkId: null });
    expect(close).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'blocked' });
  });

  it('replies false when closeHandoffPredecessor leaves the tab present', async () => {
    close.mockResolvedValue(false);
    await service.closePredecessor(request);
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'blocked' });
  });

  it('a thrown close replies false', async () => {
    close.mockRejectedValue(new Error('close failed'));
    await service.closePredecessor(request);
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'blocked' });
  });

  it('duplicate request ID replies only once', async () => {
    await service.closePredecessor(request);
    await service.closePredecessor(request);
    expect(close).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('ignores a concurrent duplicate while the first close is awaiting', async () => {
    let finish: (closed: boolean) => void = () => undefined;
    close.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const pending = service.closePredecessor(request);
    await service.closePredecessor(request);
    expect(close).toHaveBeenCalledTimes(1);
    finish(true);
    await pending;
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('ignores an invalid payload with the in-flight request ID', async () => {
    let finish: (closed: boolean) => void = () => undefined;
    close.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const pending = service.closePredecessor(request);
    await service.closePredecessor({ requestId: 'r1', predecessorTabId: 123 });
    expect(call).not.toHaveBeenCalled();
    finish(true);
    await pending;
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'closed' });
  });

  it.each([
    ['rejected', () => Promise.reject(new Error('offline'))],
    ['failed result', () => Promise.resolve({ success: false, error: 'offline' })],
  ])('logs an RPC %s', async (_case, response) => {
    call.mockImplementation(response);
    await service.closePredecessor(request);
    expect(warn).toHaveBeenCalledWith('[SessionAutoHandoff]', 'predecessor close reply failed', expect.objectContaining({ requestId: 'r1' }));
  });

  it('evicts the oldest answered request after 128 entries', async () => {
    for (let index = 0; index < 129; index++) {
      await service.closePredecessor({ ...request, requestId: `r${index}` });
    }
    await service.closePredecessor({ ...request, requestId: 'r0' });
    expect(close).toHaveBeenCalledTimes(130);
    expect(call).toHaveBeenCalledTimes(130);
  });

  it('invalid payload with a usable request ID replies false', async () => {
    await service.closePredecessor({ requestId: 'r1', predecessorTabId: 123 });
    expect(close).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('session:handoffCloseResult', { requestId: 'r1', outcome: 'blocked' });
  });

  it.each([
    ['streaming', () => { currentTab = tab({ status: 'streaming' }); }],
    ['resuming', () => { currentTab = tab({ status: 'resuming' }); }],
    ['switching', () => { currentTab = tab({ status: 'switching' }); }],
    ['sleeping', () => { currentTab = tab({ status: 'sleeping' }); }],
    ['dirty input', () => { currentTab = tab({ isDirty: true }); }],
    ['queued follow-up', () => { queued = true; }],
    ['background work', () => { currentTab = tab({ pendingBackgroundTasks: [{ id: 'task', type: 'tool', status: 'running', description: 'work' }] as TabState['pendingBackgroundTasks'] }); }],
    ['permission prompt', () => { permission = true; }],
    ['Command Center', () => { currentTab = tab({ commandCenterOrigin: { workspaceId: '/ws' } as TabState['commandCenterOrigin'] }); }],
  ] as const)('%s blocks close and replies false', async (_name, block) => {
    block();
    await service.closePredecessor(request);
    expect(close).not.toHaveBeenCalled();
    expect(currentTab).not.toBeNull();
    expect(info).toHaveBeenCalled();
    expect(call.mock.calls).toEqual([['session:handoffCloseResult', { requestId: 'r1', outcome: 'blocked' }]]);
  });
});
