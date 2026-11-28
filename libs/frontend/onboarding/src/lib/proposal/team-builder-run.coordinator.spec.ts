import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActionBannerService,
  ChatStore,
  ComposerRestoreService,
} from '@ptah-extension/chat';
import {
  ConfirmationDialogService,
  ConversationRegistry,
  MODEL_REFRESH_CONTROL,
  TabManagerService,
  TabSessionBinding,
  TabWorkspacePartitionService,
  type ClosedTabEvent,
  type ModelRefreshControl,
} from '@ptah-extension/chat-state';
import {
  SessionId,
  type WizardInstallSkillsWithConsentResponse,
} from '@ptah-extension/shared';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
  type ViewType,
} from '@ptah-extension/core';
import {
  SetupRunStore,
  type SetupRunRecord,
  type SetupRunReport,
} from '@ptah-extension/setup-wizard';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
  type LauncherAttachmentSnapshot,
} from '../launcher/harness-chat-launcher.service';
import {
  TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
  TEAM_BUILDER_LAUNCH_ERROR,
  TeamBuilderRunCoordinator,
} from './team-builder-run.coordinator';

function makeRecord(overrides: Partial<SetupRunRecord> = {}): SetupRunRecord {
  return {
    id: 'setup-tb-1',
    workspacePath: '/ws',
    workflow: 'team-builder',
    status: 'needs-input',
    step: 'consent',
    backendRunId: null,
    analysisRunId: null,
    parentId: null,
    unseen: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeSnapshot(): LauncherAttachmentSnapshot & {
  removeSent: jest.Mock;
} {
  return {
    options: { files: ['/ws/a.md'], images: undefined },
    attachments: { files: [], images: [] },
    removeSent: jest.fn(),
  };
}

function createProductionAbortRpc<T>(options?: { signal?: AbortSignal }): {
  promise: Promise<T | { isSuccess: () => false; error: string }>;
  resolveBackend: (value: T) => void;
  wasAbortedByTransport: () => boolean;
} {
  let aborted = false;
  let settle:
    | ((value: T | { isSuccess: () => false; error: string }) => void)
    | null = null;
  const promise = new Promise<T | { isSuccess: () => false; error: string }>(
    (resolve) => {
      settle = resolve;
      const signal = options?.signal;
      if (signal) {
        const onAbort = (): void => {
          aborted = true;
          if (settle) {
            const fn = settle;
            settle = null;
            fn({ isSuccess: () => false, error: 'RPC aborted' });
          }
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    },
  );
  return {
    promise,
    resolveBackend: (value: T) => {
      if (settle) {
        const fn = settle;
        settle = null;
        fn(value);
      }
    },
    wasAbortedByTransport: () => aborted,
  };
}

describe('TeamBuilderRunCoordinator', () => {
  let records: Map<string, SetupRunRecord>;
  let workspaceRoot: ReturnType<typeof signal<string>>;
  let currentView: ReturnType<typeof signal<ViewType>>;
  let tabsByWorkspace: Map<
    string,
    Array<{ id: string; claudeSessionId: string | null }>
  >;
  let rpcCall: jest.Mock;
  let createTab: jest.Mock;
  let setWorkflow: jest.Mock;
  let setFirstMessagePreamble: jest.Mock;
  let closeTab: jest.Mock;
  let closeTabAcrossWorkspaces: jest.Mock;
  let closeHandoffPredecessor: jest.Mock;
  let findTabByIdAcrossWorkspaces: jest.Mock;
  let requestCanvasTab: jest.Mock;
  let setCurrentView: jest.Mock;
  let sendOrQueueMessage: jest.Mock;
  let showError: jest.Mock;
  let restore: jest.Mock;
  let restoreAttachments: jest.Mock;
  let loggerDebug: jest.Mock;
  let loggerError: jest.Mock;
  let setupRuns: {
    runsFor: jest.Mock<SetupRunRecord[], [string | null | undefined]>;
    get: jest.Mock<SetupRunRecord | null, [string]>;
    report: jest.Mock<SetupRunRecord | null, [string, SetupRunReport]>;
    cancel: jest.Mock<Promise<boolean>, [string]>;
  };
  let coordinator: TeamBuilderRunCoordinator;

  beforeEach(() => {
    localStorage.clear();
    records = new Map([['setup-tb-1', makeRecord()]]);
    workspaceRoot = signal('/ws');
    currentView = signal<ViewType>('onboarding');
    tabsByWorkspace = new Map();
    rpcCall = jest.fn(async (method: string) => {
      if (method === 'harness:workflow-prompt') {
        return {
          isSuccess: () => true,
          data: { prompt: 'CONFIGURE_PREAMBLE' },
        };
      }
      return { isSuccess: () => true, data: {} };
    });
    createTab = jest.fn(() => {
      const ws = workspaceRoot();
      const list = tabsByWorkspace.get(ws) ?? [];
      list.push({ id: 'tab-handoff-1', claudeSessionId: null });
      tabsByWorkspace.set(ws, list);
      return 'tab-handoff-1';
    });
    setWorkflow = jest.fn();
    setFirstMessagePreamble = jest.fn();
    findTabByIdAcrossWorkspaces = jest.fn((tabId: string) => {
      for (const [ws, list] of tabsByWorkspace.entries()) {
        const tab = list.find((item) => item.id === tabId);
        if (tab) return { tab, workspacePath: ws };
      }
      return null;
    });
    closeTab = jest.fn(async (tabId: string) => {
      // Production TabManagerService.closeTab only closes tabs in the active workspace.
      const ws = workspaceRoot();
      const list = tabsByWorkspace.get(ws);
      if (!list) return;
      tabsByWorkspace.set(
        ws,
        list.filter((item) => item.id !== tabId),
      );
    });
    closeTabAcrossWorkspaces = jest.fn(
      (tabId: string, expectedSessionId: string) => {
        for (const [ws, list] of tabsByWorkspace.entries()) {
          const found = list.find((item) => item.id === tabId);
          if (!found) continue;
          if (found.claudeSessionId !== expectedSessionId) return false;
          tabsByWorkspace.set(
            ws,
            list.filter((item) => item.id !== tabId),
          );
          return true;
        }
        return false;
      },
    );
    closeHandoffPredecessor = jest.fn(
      async (tabId: string, expectedSessionId: string | null) => {
        for (const [ws, list] of tabsByWorkspace.entries()) {
          const found = list.find((item) => item.id === tabId);
          if (!found) continue;
          if (
            expectedSessionId === null
              ? found.claudeSessionId != null
              : found.claudeSessionId !== expectedSessionId
          ) {
            return false;
          }
          tabsByWorkspace.set(
            ws,
            list.filter((item) => item.id !== tabId),
          );
          return true;
        }
        return false;
      },
    );
    requestCanvasTab = jest.fn().mockResolvedValue(true);
    setCurrentView = jest.fn((view: ViewType) => currentView.set(view));
    sendOrQueueMessage = jest.fn().mockResolvedValue({ success: true });
    showError = jest.fn();
    restore = jest.fn();
    restoreAttachments = jest.fn();
    loggerDebug = jest.fn();
    loggerError = jest.fn();
    setupRuns = {
      runsFor: jest.fn((workspace: string | null | undefined) =>
        workspace
          ? [...records.values()].filter(
              (record) => record.workspacePath === workspace,
            )
          : [],
      ),
      get: jest.fn((id: string) => records.get(id) ?? null),
      report: jest.fn((id: string, update: SetupRunReport) => {
        const current = records.get(id);
        if (!current) return null;
        const next: SetupRunRecord = {
          ...current,
          ...(update.status !== undefined ? { status: update.status } : {}),
          ...(update.step !== undefined ? { step: update.step } : {}),
          ...(update.handoffTabId !== undefined
            ? { handoffTabId: update.handoffTabId }
            : {}),
          ...(update.teamBuilder !== undefined
            ? {
                teamBuilder: {
                  intent: update.teamBuilder.intent,
                  installed: [...update.teamBuilder.installed],
                },
              }
            : {}),
          updatedAt: current.updatedAt + 1,
        };
        if (update.error === null) delete next.error;
        else if (update.error !== undefined) next.error = update.error;
        records.set(id, next);
        return next;
      }),
      cancel: jest.fn(async (id: string) => {
        const current = records.get(id);
        if (
          !current ||
          (current.status !== 'running' && current.status !== 'needs-input')
        ) {
          return false;
        }
        records.set(id, { ...current, status: 'cancelled' });
        return true;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        TeamBuilderRunCoordinator,
        { provide: SetupRunStore, useValue: setupRuns },
        { provide: ClaudeRpcService, useValue: { call: rpcCall } },
        {
          provide: HarnessChatLauncherService,
          useValue: { workspaceRoot, launchTeamBuilder: jest.fn() },
        },
        {
          provide: TabManagerService,
          useValue: {
            tabs: () => tabsByWorkspace.get(workspaceRoot()) ?? [],
            get activeWorkspacePath(): string {
              return workspaceRoot();
            },
            findTabByIdAcrossWorkspaces,
            createTab,
            setWorkflow,
            setFirstMessagePreamble,
            closeTab,
            closeTabAcrossWorkspaces,
            closeHandoffPredecessor,
          },
        },
        {
          provide: AppStateManager,
          useValue: {
            currentView,
            requestCanvasTab,
            setCurrentView,
          },
        },
        { provide: ChatStore, useValue: { sendOrQueueMessage } },
        { provide: ActionBannerService, useValue: { showError } },
        {
          provide: ComposerRestoreService,
          useValue: { restore, restoreAttachments },
        },
        {
          provide: LoggingService,
          useValue: { debug: loggerDebug, error: loggerError },
        },
      ],
    });
    coordinator = TestBed.inject(TeamBuilderRunCoordinator);
    TestBed.tick();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('completes install-then-launch detached without stealing focus and records handoffTabId and handed-off', async () => {
    let finishInstall!: (value: {
      isSuccess: () => boolean;
      data: WizardInstallSkillsWithConsentResponse;
    }) => void;
    rpcCall.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInstall = resolve;
        }),
    );

    // Attach initially, then detach before install completes (user navigated away).
    coordinator.attachView('setup-tb-1');
    const snapshot = makeSnapshot();
    const pending = coordinator.installAndLaunch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a QA team',
      previews: [
        {
          skillName: 'owner/repo/qa',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash-1',
        },
      ],
      guidanceAnalysis: { projectType: 'angular', frameworks: ['Angular'] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: snapshot,
    });

    expect(coordinator.isRunning('setup-tb-1')).toBe(true);
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'running',
      step: 'installing',
      teamBuilder: { intent: 'Build a QA team', installed: [] },
    });

    // Page left Setup before install finishes.
    coordinator.detachView('setup-tb-1');
    finishInstall({
      isSuccess: () => true,
      data: { success: true, installed: ['owner/repo/qa'], workspacePath: '/ws' },
    });

    const outcome = await pending;
    expect(outcome).toEqual({
      kind: 'handed-off',
      tabId: 'tab-handoff-1',
      installed: ['owner/repo/qa'],
    });
    // Detached handoff must NOT steal active tab or switch view to chat.
    expect(createTab).toHaveBeenCalledWith('AI Team Builder', undefined, false);
    expect(requestCanvasTab).toHaveBeenCalledWith(
      'tab-handoff-1',
      '/ws',
      'AI Team Builder',
      false,
    );
    expect(setCurrentView).not.toHaveBeenCalled();
    expect(sendOrQueueMessage).toHaveBeenCalledWith('Build a QA team', {
      files: ['/ws/a.md'],
      images: undefined,
      tabId: 'tab-handoff-1',
      workspacePath: '/ws',
    });
    expect(snapshot.removeSent).toHaveBeenCalledTimes(1);
    expect(coordinator.isRunning('setup-tb-1')).toBe(false);
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'completed',
      step: 'handed-off',
      handoffTabId: 'tab-handoff-1',
      teamBuilder: { intent: 'Build a QA team', installed: ['owner/repo/qa'] },
    });
    expect(records.get('setup-tb-1')?.error).toBeUndefined();
  });

  it('does not steal focus when the user switched away from onboarding view even if view remained attached', async () => {
    coordinator.attachView('setup-tb-1');
    currentView.set('settings');

    const outcome = await coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    expect(outcome).toEqual({
      kind: 'handed-off',
      tabId: 'tab-handoff-1',
      installed: [],
    });
    expect(createTab).toHaveBeenCalledWith('AI Team Builder', undefined, false);
    expect(requestCanvasTab).toHaveBeenCalledWith(
      'tab-handoff-1',
      '/ws',
      'AI Team Builder',
      false,
    );
    expect(setCurrentView).not.toHaveBeenCalled();
  });

  it('aborts and cleans up an uncommitted chat tab without sending when cancelled during deferred canvas adoption', async () => {
    let settleAdoption!: (adopted: boolean) => void;
    requestCanvasTab.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          settleAdoption = resolve;
        }),
    );
    coordinator.attachView('setup-tb-1');

    const snapshot = makeSnapshot();
    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: snapshot,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(createTab).toHaveBeenCalledWith('AI Team Builder', undefined, true);
    expect(setCurrentView).toHaveBeenCalledWith('chat');
    expect(sendOrQueueMessage).not.toHaveBeenCalled();

    const cancelled = await coordinator.cancel('setup-tb-1');
    settleAdoption(true);
    const outcome = await pending;

    expect(cancelled).toBe(true);
    expect(closeTab).toHaveBeenCalledWith('tab-handoff-1', true);
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
    expect(snapshot.removeSent).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'cancelled',
      step: 'intent',
    });
  });

  it('treats a cancelled first send outcome as cancelled rather than handed-off', async () => {
    sendOrQueueMessage.mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    const snapshot = makeSnapshot();

    const outcome = await coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: snapshot,
    });

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(closeTab).toHaveBeenCalledWith('tab-handoff-1', true);
    expect(snapshot.removeSent).not.toHaveBeenCalled();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'cancelled',
      step: 'intent',
    });
    expect(records.get('setup-tb-1')?.handoffTabId).toBeUndefined();
  });

  it('waits for an in-flight committed send on cancel instead of stranding a sent chat behind a cancelled record', async () => {
    let settleSend!: (value: { success: boolean }) => void;
    sendOrQueueMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleSend = resolve;
        }),
    );

    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);

    const cancelPending = coordinator.cancel('setup-tb-1');
    settleSend({ success: true });

    const [cancelled, outcome] = await Promise.all([cancelPending, pending]);
    expect(cancelled).toBe(false);
    expect(outcome).toEqual({
      kind: 'handed-off',
      tabId: 'tab-handoff-1',
      installed: [],
    });
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'completed',
      step: 'handed-off',
      handoffTabId: 'tab-handoff-1',
    });
  });

  it('immediately resolves live runs to interrupted on workspace switch and records late confirmed writes only in the originating workspace', async () => {
    records.set(
      'setup-tb-b',
      makeRecord({
        id: 'setup-tb-b',
        workspacePath: '/ws-b',
        status: 'needs-input',
        step: 'review',
        teamBuilder: { intent: 'Workspace B team', installed: [] },
      }),
    );
    let transport!: ReturnType<
      typeof createProductionAbortRpc<{
        isSuccess: () => boolean;
        data: WizardInstallSkillsWithConsentResponse;
      }>
    >;
    rpcCall.mockImplementationOnce(
      (
        _method: string,
        _params: unknown,
        options?: { signal?: AbortSignal },
      ) => {
        transport = createProductionAbortRpc(options);
        return transport.promise;
      },
    );

    const pending = coordinator.installAndLaunch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a QA team',
      previews: [
        {
          skillName: 'owner/repo/qa-one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash-1',
        },
        {
          skillName: 'owner/repo/qa-two',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash-2',
        },
      ],
      guidanceAnalysis: { projectType: 'angular', frameworks: ['Angular'] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    // Switch A -> B via root workspace signal (no page mounted).
    workspaceRoot.set('/ws-b');
    TestBed.tick();

    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'interrupted',
      step: 'installing',
    });

    // Frontend stops immediately without waiting on backend settlement.
    const outcome = await pending;
    expect(outcome).toEqual({ kind: 'ignored' });
    expect(createTab).not.toHaveBeenCalled();
    expect(sendOrQueueMessage).not.toHaveBeenCalled();

    // The install settles for A while B is active.
    transport.resolveBackend({
      isSuccess: () => true,
      data: {
        success: true,
        installed: ['owner/repo/qa-one', 'owner/repo/qa-two'],
        workspacePath: '/ws/',
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(transport.wasAbortedByTransport()).toBe(false);
    expect(createTab).not.toHaveBeenCalled();
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'interrupted',
      teamBuilder: {
        intent: 'Build a QA team',
        installed: ['owner/repo/qa-one', 'owner/repo/qa-two'],
      },
    });
    expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(false);
    expect(records.get('setup-tb-b')).toMatchObject({
      status: 'needs-input',
      teamBuilder: { intent: 'Workspace B team', installed: [] },
    });
  });

  it('immediately resolves a launching run to interrupted on workspace switch A -> B -> A and preserves installed skills', async () => {
    let finishPrompt!: (value: {
      isSuccess: () => boolean;
      data: { prompt: string };
    }) => void;
    rpcCall.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPrompt = resolve;
        }),
    );

    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: ['owner/repo/one'],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    workspaceRoot.set('/ws-b');
    TestBed.tick();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'interrupted',
      step: 'launching',
      teamBuilder: { intent: 'Build a team', installed: ['owner/repo/one'] },
    });

    workspaceRoot.set('/ws');
    TestBed.tick();
    finishPrompt({
      isSuccess: () => true,
      data: { prompt: 'PREAMBLE' },
    });
    const outcome = await pending;
    expect(outcome).toEqual({ kind: 'ignored' });
    expect(createTab).not.toHaveBeenCalled();
    expect(records.get('setup-tb-1')?.status).toBe('interrupted');
  });

  it('classifies a HarnessChatLaunchCancelledError after workspace invalidation as ignored/interrupted rather than explicit Cancel', async () => {
    let rejectPrompt!: (error: Error) => void;
    rpcCall.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPrompt = reject;
        }),
    );

    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    workspaceRoot.set('/ws-b');
    TestBed.tick();
    rejectPrompt(new HarnessChatLaunchCancelledError());
    const outcome = await pending;

    expect(outcome).toEqual({ kind: 'ignored' });
    expect(records.get('setup-tb-1')?.status).toBe('interrupted');
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('marks the run failed at step review and keeps installed skills when launch fails after install', async () => {
    rpcCall
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: { success: true, installed: ['owner/repo/one'], workspacePath: '/ws' },
      })
      .mockResolvedValueOnce({
        isSuccess: () => false,
        error: 'canvas unavailable',
      });

    const outcome = await coordinator.installAndLaunch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      previews: [
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    expect(outcome).toEqual({
      kind: 'failed',
      error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
      installed: ['owner/repo/one'],
    });
    expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(true);
    expect(loggerError).toHaveBeenCalled();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'failed',
      step: 'review',
      error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
      teamBuilder: { intent: 'Build a team', installed: ['owner/repo/one'] },
    });
  });

  it('marks the run failed at step review without installed skills when direct launch fails', async () => {
    sendOrQueueMessage.mockRejectedValueOnce(new Error('offline'));

    const outcome = await coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    expect(outcome).toEqual({
      kind: 'failed',
      error: TEAM_BUILDER_LAUNCH_ERROR,
      installed: [],
    });
    expect(closeTab).toHaveBeenCalledWith('tab-handoff-1', true);
    expect(loggerError).toHaveBeenCalled();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'failed',
      step: 'review',
      error: TEAM_BUILDER_LAUNCH_ERROR,
      teamBuilder: { intent: 'Build a team', installed: [] },
    });
  });

  it('deduplicates same-id double-clicks and refuses a second historical record in the same workspace', async () => {
    records.set(
      'setup-tb-old',
      makeRecord({ id: 'setup-tb-old', status: 'failed', step: 'review' }),
    );
    let finishPrompt!: (value: {
      isSuccess: () => boolean;
      data: { prompt: string };
    }) => void;
    rpcCall.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPrompt = resolve;
        }),
    );

    const req = {
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    };

    const first = coordinator.launch(req);
    const duplicate = coordinator.launch(req);
    expect(duplicate).toBe(first);

    const competing = await coordinator.launch({
      ...req,
      recordId: 'setup-tb-old',
    });
    expect(competing).toEqual({ kind: 'ignored' });
    expect(records.get('setup-tb-old')?.status).toBe('failed');

    finishPrompt({ isSuccess: () => true, data: { prompt: 'PREAMBLE' } });
    const outcome = await first;
    expect(outcome).toEqual({
      kind: 'handed-off',
      tabId: 'tab-handoff-1',
      installed: [],
    });
    expect(rpcCall).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/ws/', ['owner/repo/one']],
    ['/ws-b', []],
  ])(
    'attributes a cancelled install reply from %s after switching to B',
    async (replyWorkspacePath, expectedInstalled) => {
      let transport!: ReturnType<
        typeof createProductionAbortRpc<{
          isSuccess: () => boolean;
          data: WizardInstallSkillsWithConsentResponse;
        }>
      >;
      rpcCall.mockImplementationOnce(
        (
          _method: string,
          _params: unknown,
          options?: { signal?: AbortSignal },
        ) => {
          transport = createProductionAbortRpc(options);
          return transport.promise;
        },
      );

      const pending = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build a team',
        previews: [
          {
            skillName: 'owner/repo/one',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash',
          },
          {
            skillName: 'owner/repo/two',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-2',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      const installParams = rpcCall.mock.calls[0][1];
      expect(rpcCall).toHaveBeenNthCalledWith(
        1,
        'wizard:install-skills-with-consent',
        {
          skills: ['owner/repo/one', 'owner/repo/two'],
          consentRecords: [],
          workspacePath: '/ws',
          installRunId: expect.any(String),
        },
      );
      rpcCall.mockResolvedValueOnce({
        isSuccess: () => true,
        data: { cancelled: true },
      });
      const cancelled = await coordinator.cancel('setup-tb-1');
      expect(rpcCall).toHaveBeenNthCalledWith(2, 'wizard:cancel-skill-install', {
        installRunId: installParams.installRunId,
      });
      expect(cancelled).toBe(true);
      // Coordinator stops immediately without waiting for backend install to finish.
      const outcome = await pending;
      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(createTab).not.toHaveBeenCalled();
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
      expect(records.get('setup-tb-1')?.status).toBe('cancelled');

      const otherRecord = makeRecord({ id: 'setup-tb-b', workspacePath: '/ws-b' });
      records.set(otherRecord.id, otherRecord);
      workspaceRoot.set('/ws-b');
      TestBed.tick();

      transport.resolveBackend({
        isSuccess: () => true,
        data: {
          success: false,
          cancelled: true,
          installed: ['owner/repo/one'],
          workspacePath: replyWorkspacePath,
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(transport.wasAbortedByTransport()).toBe(false);
      expect(createTab).not.toHaveBeenCalled();
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
      expect(records.get('setup-tb-1')?.status).toBe('cancelled');
      expect(records.get('setup-tb-1')?.teamBuilder?.installed).toEqual(
        expectedInstalled,
      );
      expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(false);
      expect(records.get(otherRecord.id)).toEqual(otherRecord);
    },
  );

  it('records a cancelled install reply for an active run without launching chat', async () => {
    rpcCall.mockResolvedValueOnce({
      isSuccess: () => true,
      data: {
        success: false,
        cancelled: true,
        installed: ['owner/repo/one'],
        workspacePath: '/ws',
      },
    });

    const outcome = await coordinator.installAndLaunch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      previews: ['one', 'two'].map((name) => ({
        skillName: `owner/repo/${name}`,
        files: [],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'hash',
      })),
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'cancelled',
      teamBuilder: { installed: ['owner/repo/one'] },
    });
    expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(false);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('retains a successful handoff in its original workspace when switching workspaces while the first send is in flight', async () => {
    let settleSend!: (value: { success: boolean }) => void;
    sendOrQueueMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleSend = resolve;
        }),
    );

    const snapshot = makeSnapshot();
    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: ['owner/repo/one'],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: snapshot,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);

    // Switch workspace while the dispatched send is still pending; the tab is
    // now parked under /ws and must NOT be closed or interrupted mid-send.
    workspaceRoot.set('/ws-b');
    TestBed.tick();

    expect(closeTab).not.toHaveBeenCalled();
    expect(closeHandoffPredecessor).not.toHaveBeenCalled();
    expect(coordinator.isRunning('setup-tb-1')).toBe(true);
    expect(records.get('setup-tb-1')?.status).toBe('running');

    // Returning to /ws before settlement must still keep ownership of /ws.
    records.set(
      'setup-tb-competing',
      makeRecord({ id: 'setup-tb-competing', status: 'failed', step: 'review' }),
    );
    workspaceRoot.set('/ws');
    TestBed.tick();
    const competing = await coordinator.launch({
      recordId: 'setup-tb-competing',
      workspacePath: '/ws',
      intent: 'Other team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });
    expect(competing).toEqual({ kind: 'ignored' });

    // Switch back to /ws-b and let the dispatched send succeed.
    workspaceRoot.set('/ws-b');
    TestBed.tick();
    settleSend({ success: true });

    const outcome = await pending;
    expect(outcome).toEqual({
      kind: 'handed-off',
      tabId: 'tab-handoff-1',
      installed: ['owner/repo/one'],
    });
    expect(closeTab).not.toHaveBeenCalled();
    expect(closeHandoffPredecessor).not.toHaveBeenCalled();
    expect(findTabByIdAcrossWorkspaces('tab-handoff-1')).toEqual({
      tab: { id: 'tab-handoff-1', claudeSessionId: null },
      workspacePath: '/ws',
    });
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'completed',
      step: 'handed-off',
      handoffTabId: 'tab-handoff-1',
      teamBuilder: { intent: 'Build a team', installed: ['owner/repo/one'] },
    });
  });

  it('closes a parked uncommitted tab and marks cancelled when a deferred send cancels after a workspace switch', async () => {
    let settleSend!: (value: { success: boolean; cancelled: boolean }) => void;
    sendOrQueueMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleSend = resolve;
        }),
    );

    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    await Promise.resolve();
    await Promise.resolve();
    workspaceRoot.set('/ws-b');
    TestBed.tick();

    expect(closeTab).not.toHaveBeenCalled();
    expect(closeHandoffPredecessor).not.toHaveBeenCalled();
    expect(records.get('setup-tb-1')?.status).toBe('running');

    settleSend({ success: false, cancelled: true });
    const outcome = await pending;

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(closeHandoffPredecessor).toHaveBeenCalledWith(
      'tab-handoff-1',
      null,
      false,
    );
    expect(findTabByIdAcrossWorkspaces('tab-handoff-1')).toBeNull();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'cancelled',
      step: 'intent',
    });
    expect(records.get('setup-tb-1')?.handoffTabId).toBeUndefined();
  });

  it('closes a parked uncommitted tab and records review failure with installed skills when a deferred send fails after a workspace switch', async () => {
    let markSendStarted!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    let settleSend!: (value: { success: boolean; error: string }) => void;
    sendOrQueueMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleSend = resolve;
          markSendStarted();
        }),
    );
    coordinator.attachView('setup-tb-1');

    const pending = coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: ['owner/repo/one'],
      guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
      guidanceFacts: [],
      ownerDecision: null,
      attachmentSnapshot: makeSnapshot(),
    });

    await sendStarted;
    workspaceRoot.set('/ws-b');
    TestBed.tick();

    expect(closeTab).not.toHaveBeenCalled();
    expect(closeHandoffPredecessor).not.toHaveBeenCalled();

    settleSend({ success: false, error: 'backend unavailable' });
    const outcome = await pending;

    expect(outcome).toEqual({
      kind: 'failed',
      error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
      installed: ['owner/repo/one'],
    });
    expect(restore).not.toHaveBeenCalled();
    expect(closeHandoffPredecessor).toHaveBeenCalledWith(
      'tab-handoff-1',
      null,
      false,
    );
    expect(findTabByIdAcrossWorkspaces('tab-handoff-1')).toBeNull();
    expect(records.get('setup-tb-1')).toMatchObject({
      status: 'failed',
      step: 'review',
      error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
      teamBuilder: { intent: 'Build a team', installed: ['owner/repo/one'] },
    });
    expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(true);
  });

  it('records a guidance note and still launches when guidance persistence fails', async () => {
    rpcCall
      .mockRejectedValueOnce(new Error('disk read-only'))
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: { prompt: 'CONFIGURE_PREAMBLE' },
      });

    const outcome = await coordinator.launch({
      recordId: 'setup-tb-1',
      workspacePath: '/ws',
      intent: 'Build a team',
      installed: [],
      guidanceAnalysis: { projectType: 'angular', frameworks: ['Angular'] },
      guidanceFacts: [{ category: 'test', label: 'tolerate', fact: 'Legacy' }],
      ownerDecision: 'raise',
      attachmentSnapshot: makeSnapshot(),
    });

    expect(outcome).toEqual({
      kind: 'handed-off',
      tabId: 'tab-handoff-1',
      installed: [],
    });
    expect(coordinator.guidanceNoteFor('setup-tb-1')).toBe(
      'Guidance record was not written.',
    );
  });

  describe('Phase C F5, F9, and Batch 17b M1/M3 regressions', () => {
    it('normalizes trailing-separator workspace paths across invalidateForWorkspace, post-dispatch failure, and cancel transitions (F5)', async () => {
      // Store holds normalized workspacePath '/ws', while launcher reports '/ws/'.
      workspaceRoot.set('/ws/');
      TestBed.tick();

      // 1) Workspace invalidation during launch marks the normalized record interrupted.
      let finishPrompt!: (value: {
        isSuccess: () => boolean;
        data: { prompt: string };
      }) => void;
      rpcCall.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPrompt = resolve;
          }),
      );
      const interruptedRun = coordinator.launch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws/',
        intent: 'Build trailing-slash team',
        installed: ['owner/repo/one'],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });
      workspaceRoot.set('/ws-b/');
      TestBed.tick();
      expect(records.get('setup-tb-1')).toMatchObject({
        status: 'interrupted',
        teamBuilder: {
          intent: 'Build trailing-slash team',
          installed: ['owner/repo/one'],
        },
      });
      finishPrompt({ isSuccess: () => true, data: { prompt: 'PREAMBLE' } });
      expect(await interruptedRun).toEqual({ kind: 'ignored' });

      // 2) Post-dispatch send failure reports failed on the normalized record.
      workspaceRoot.set('/ws/');
      TestBed.tick();
      records.set(
        'setup-tb-2',
        makeRecord({ id: 'setup-tb-2', workspacePath: '/ws' }),
      );
      sendOrQueueMessage.mockResolvedValueOnce({
        success: false,
        error: 'send boom',
      });
      const failedOutcome = await coordinator.launch({
        recordId: 'setup-tb-2',
        workspacePath: '/ws/',
        intent: 'Build failing team',
        installed: ['owner/repo/one'],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });
      expect(failedOutcome).toEqual({
        kind: 'failed',
        error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
        installed: ['owner/repo/one'],
      });
      expect(records.get('setup-tb-2')).toMatchObject({
        status: 'failed',
        step: 'review',
        error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
      });

      // 3) Cancelled send transitions the normalized record to cancelled and closes the uncommitted tab.
      records.set(
        'setup-tb-3',
        makeRecord({ id: 'setup-tb-3', workspacePath: '/ws' }),
      );
      sendOrQueueMessage.mockResolvedValueOnce({
        success: false,
        cancelled: true,
      });
      const cancelledOutcome = await coordinator.launch({
        recordId: 'setup-tb-3',
        workspacePath: '/ws/',
        intent: 'Build cancelled team',
        installed: [],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });
      expect(cancelledOutcome).toEqual({ kind: 'cancelled' });
      expect(closeTab).toHaveBeenCalledWith('tab-handoff-1', true);
      expect(records.get('setup-tb-3')).toMatchObject({
        status: 'cancelled',
        step: 'intent',
      });
    });

    it('sends wizard:cancel-skill-install on workspace invalidation and keeps attributing late replies by normalized reply workspacePath (17b M1)', async () => {
      let transport!: ReturnType<
        typeof createProductionAbortRpc<{
          isSuccess: () => boolean;
          data: WizardInstallSkillsWithConsentResponse;
        }>
      >;
      rpcCall.mockImplementationOnce(
        (
          _method: string,
          _params: unknown,
          options?: { signal?: AbortSignal },
        ) => {
          transport = createProductionAbortRpc(options);
          return transport.promise;
        },
      );
      records.set(
        'setup-tb-b',
        makeRecord({
          id: 'setup-tb-b',
          workspacePath: '/ws-b',
          status: 'needs-input',
          teamBuilder: { intent: 'Workspace B', installed: [] },
        }),
      );

      const pending = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws/',
        intent: 'Build a QA team',
        previews: [
          {
            skillName: 'owner/repo/qa-one',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-1',
          },
          {
            skillName: 'owner/repo/qa-two',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-2',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      const installParams = rpcCall.mock.calls[0][1] as {
        installRunId: string;
      };
      expect(installParams.installRunId).toEqual(expect.any(String));

      workspaceRoot.set('/ws-b');
      TestBed.tick();

      expect(rpcCall).toHaveBeenNthCalledWith(2, 'wizard:cancel-skill-install', {
        installRunId: installParams.installRunId,
      });
      expect(records.get('setup-tb-1')?.status).toBe('interrupted');
      expect(await pending).toEqual({ kind: 'ignored' });

      transport.resolveBackend({
        isSuccess: () => true,
        data: {
          success: false,
          cancelled: true,
          installed: ['owner/repo/qa-one'],
          workspacePath: '/ws/',
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(transport.wasAbortedByTransport()).toBe(false);
      expect(records.get('setup-tb-1')).toMatchObject({
        status: 'interrupted',
        teamBuilder: {
          intent: 'Build a QA team',
          installed: ['owner/repo/qa-one'],
        },
      });
      expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(false);
      expect(records.get('setup-tb-b')?.teamBuilder?.installed).toEqual([]);
      expect(createTab).not.toHaveBeenCalled();
    });

    it('guards malformed late install replies and catches late handler throws without unhandled rejections (17b M3)', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);
      try {
        // Case 1: malformed late reply missing the installed array.
        let resolveMalformed!: (value: unknown) => void;
        rpcCall.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveMalformed = resolve;
            }),
        );
        const run1 = coordinator.installAndLaunch({
          recordId: 'setup-tb-1',
          workspacePath: '/ws',
          intent: 'Build a team',
          previews: [
            {
              skillName: 'owner/repo/one',
              files: [],
              scriptFiles: [],
              hasScripts: false,
              contentHash: 'hash',
            },
          ],
          guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
          guidanceFacts: [],
          ownerDecision: null,
          attachmentSnapshot: makeSnapshot(),
        });
        await coordinator.cancel('setup-tb-1');
        expect(await run1).toEqual({ kind: 'cancelled' });

        resolveMalformed({
          isSuccess: () => true,
          data: {
            success: true,
            workspacePath: '/ws',
          } as unknown as WizardInstallSkillsWithConsentResponse,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(unhandled).toEqual([]);
        expect(records.get('setup-tb-1')?.teamBuilder?.installed).toEqual([]);

        // Case 2: synchronous throw inside late reply handler is caught and logged.
        records.set(
          'setup-tb-throw',
          makeRecord({ id: 'setup-tb-throw', workspacePath: '/ws' }),
        );
        let resolveThrowing!: (value: unknown) => void;
        rpcCall.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveThrowing = resolve;
            }),
        );
        const run2 = coordinator.installAndLaunch({
          recordId: 'setup-tb-throw',
          workspacePath: '/ws',
          intent: 'Build a throwing team',
          previews: [
            {
              skillName: 'owner/repo/one',
              files: [],
              scriptFiles: [],
              hasScripts: false,
              contentHash: 'hash',
            },
          ],
          guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
          guidanceFacts: [],
          ownerDecision: null,
          attachmentSnapshot: makeSnapshot(),
        });
        await coordinator.cancel('setup-tb-throw');
        expect(await run2).toEqual({ kind: 'cancelled' });

        setupRuns.report.mockImplementationOnce(() => {
          throw new Error('store report boom');
        });
        resolveThrowing({
          isSuccess: () => true,
          data: {
            success: false,
            cancelled: true,
            installed: ['owner/repo/one'],
            workspacePath: '/ws',
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(unhandled).toEqual([]);
        expect(loggerDebug).toHaveBeenCalledWith(
          'TeamBuilderRunCoordinator',
          'Late team builder skill install failed after stop',
          expect.objectContaining({
            recordId: 'setup-tb-throw',
            error: 'store report boom',
          }),
        );
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });

    it('prunes dismissed and evicted records from the 20-entry recovery sidecar reactively, on save, and on load (F9)', () => {
      const configureSidecarBed = (
        storeValue: Record<string, unknown>,
      ): TeamBuilderRunCoordinator => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            TeamBuilderRunCoordinator,
            { provide: SetupRunStore, useValue: storeValue },
            { provide: ClaudeRpcService, useValue: { call: rpcCall } },
            {
              provide: HarnessChatLauncherService,
              useValue: { workspaceRoot, launchTeamBuilder: jest.fn() },
            },
            { provide: TabManagerService, useValue: null },
            { provide: AppStateManager, useValue: null },
            { provide: ChatStore, useValue: null },
            { provide: ActionBannerService, useValue: null },
            { provide: ComposerRestoreService, useValue: null },
            {
              provide: LoggingService,
              useValue: { debug: loggerDebug, error: loggerError },
            },
          ],
        });
        return TestBed.inject(TeamBuilderRunCoordinator);
      };

      // 1) Reactive pruning when SetupRunStore.runs updates (e.g. dismiss).
      const liveRecords = signal<SetupRunRecord[]>([
        makeRecord({ id: 'setup-tb-keep', workspacePath: '/ws-b' }),
        makeRecord({ id: 'setup-tb-dismiss', workspacePath: '/ws' }),
      ]);
      const reactiveStore = {
        runs: liveRecords.asReadonly(),
        runsFor: jest.fn((workspace: string | null | undefined) =>
          workspace
            ? liveRecords().filter(
                (record) => record.workspacePath === workspace,
              )
            : [],
        ),
        get: jest.fn(
          (id: string) =>
            liveRecords().find((record) => record.id === id) ?? null,
        ),
        report: setupRuns.report,
        cancel: setupRuns.cancel,
      };
      localStorage.clear();
      const reactiveCoordinator = configureSidecarBed(reactiveStore);
      TestBed.tick();

      reactiveCoordinator.saveDraft('setup-tb-keep', {
        workspacePath: '/ws-b',
        intent: 'Keep B',
        selectedIds: ['owner/repo/b'],
        installCompleted: true,
      });
      reactiveCoordinator.saveDraft('setup-tb-dismiss', {
        workspacePath: '/ws',
        intent: 'Dismiss A',
        selectedIds: ['owner/repo/a'],
        installCompleted: true,
      });

      // Dismiss setup-tb-dismiss from the store.
      liveRecords.set([liveRecords()[0]]);
      TestBed.tick();

      expect(reactiveCoordinator.draftFor('setup-tb-dismiss')).toBeNull();
      expect(
        reactiveCoordinator.hasCompletedInstall('setup-tb-dismiss'),
      ).toBe(false);
      expect(reactiveCoordinator.hasCompletedInstall('setup-tb-keep')).toBe(
        true,
      );
      const afterDismiss = JSON.parse(
        localStorage.getItem('ptah.team-builder-recovery.v1') ?? '{}',
      ) as { byRecord?: Record<string, unknown> };
      expect(afterDismiss.byRecord?.['setup-tb-dismiss']).toBeUndefined();
      expect(afterDismiss.byRecord?.['setup-tb-keep']).toBeDefined();

      // 2) Before applying MAX_RECOVERY_ENTRIES (20), stale dismissed records are pruned
      //    so they cannot evict an older live recoverable entry from another workspace.
      const keepB = makeRecord({ id: 'setup-tb-keep-b', workspacePath: '/ws-b' });
      const newA = makeRecord({ id: 'setup-tb-new-a', workspacePath: '/ws' });
      const byRecord: Record<string, unknown> = {
        'setup-tb-keep-b': {
          selectedIds: ['owner/repo/b'],
          ownerDecision: 'raise',
          installCompleted: true,
          hadAttachments: true,
          updatedAt: 1,
        },
      };
      const staleRecords: SetupRunRecord[] = [];
      for (let i = 0; i < 19; i += 1) {
        const id = `setup-tb-stale-${i}`;
        staleRecords.push(makeRecord({ id, workspacePath: '/ws' }));
        byRecord[id] = {
          selectedIds: ['owner/repo/stale'],
          ownerDecision: null,
          installCompleted: false,
          hadAttachments: false,
          updatedAt: 100 + i,
        };
      }
      localStorage.setItem(
        'ptah.team-builder-recovery.v1',
        JSON.stringify({ version: 1, byRecord }),
      );

      // Load with all 20 present, then evict the 19 stale records from the backing store
      // without firing a signal (testing savePersistedEntry's own pre-cap pruning).
      const backing = new Map<string, SetupRunRecord>([
        [keepB.id, keepB],
        [newA.id, newA],
        ...staleRecords.map((r) => [r.id, r] as const),
      ]);
      const backingStore = {
        runsFor: jest.fn(() => []),
        get: jest.fn((id: string) => backing.get(id) ?? null),
        report: setupRuns.report,
        cancel: setupRuns.cancel,
      };
      const capCoordinator = configureSidecarBed(backingStore);
      TestBed.tick();
      for (const stale of staleRecords) {
        backing.delete(stale.id);
      }

      capCoordinator.saveDraft(newA.id, {
        workspacePath: '/ws',
        intent: 'New A',
        selectedIds: ['owner/repo/new'],
        installCompleted: false,
      });

      const afterSave = JSON.parse(
        localStorage.getItem('ptah.team-builder-recovery.v1') ?? '{}',
      ) as { byRecord?: Record<string, unknown> };
      expect(Object.keys(afterSave.byRecord ?? {}).sort()).toEqual([
        'setup-tb-keep-b',
        'setup-tb-new-a',
      ]);

      // 3) Startup load prunes entries missing from SetupRunStore.
      backing.delete(newA.id);
      configureSidecarBed(backingStore);
      const afterLoad = JSON.parse(
        localStorage.getItem('ptah.team-builder-recovery.v1') ?? '{}',
      ) as { byRecord?: Record<string, unknown> };
      expect(Object.keys(afterLoad.byRecord ?? {})).toEqual([
        'setup-tb-keep-b',
      ]);

      // 4) 21 indexed live records across 21 workspaces retain all sidecar checkpoints.
      localStorage.clear();
      const live21 = new Map<string, SetupRunRecord>();
      for (let i = 0; i < 21; i += 1) {
        const rec = makeRecord({
          id: `setup-tb-live-${i}`,
          workspacePath: `/ws-${i}`,
          status: 'needs-input',
        });
        live21.set(rec.id, rec);
      }
      const live21Store = {
        runsFor: jest.fn(() => []),
        get: jest.fn((id: string) => live21.get(id) ?? null),
        report: setupRuns.report,
        cancel: setupRuns.cancel,
      };
      const live21Coordinator = configureSidecarBed(live21Store);
      for (let i = 0; i < 21; i += 1) {
        live21Coordinator.saveDraft(`setup-tb-live-${i}`, {
          workspacePath: `/ws-${i}`,
          intent: `Intent ${i}`,
          selectedIds: [`owner/repo/skill-${i}`],
          ownerDecision: 'raise',
          hadAttachments: true,
          installCompleted: false,
        });
      }
      const reloaded21 = configureSidecarBed(live21Store);
      const oldestLive = live21.get('setup-tb-live-0') as SetupRunRecord;
      expect(reloaded21.recoveryFor(oldestLive)).toEqual({
        selectedIds: ['owner/repo/skill-0'],
        ownerDecision: 'raise',
        installCompleted: false,
        hadAttachments: true,
      });
    });

    it('reconciles confirmed partial installs when an interrupted record is retried before the cancelled install reply settles (18B F2)', async () => {
      let transport!: ReturnType<
        typeof createProductionAbortRpc<{
          isSuccess: () => boolean;
          data: WizardInstallSkillsWithConsentResponse;
        }>
      >;
      rpcCall.mockImplementationOnce(
        (
          _method: string,
          _params: unknown,
          options?: { signal?: AbortSignal },
        ) => {
          transport = createProductionAbortRpc(options);
          return transport.promise;
        },
      );

      const pending = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build Workspace A team',
        previews: [
          {
            skillName: 'owner/repo/qa-one',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-1',
          },
          {
            skillName: 'owner/repo/qa-two',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-2',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      // Switch workspace A -> B, interrupting the install and sending cancel RPC.
      workspaceRoot.set('/ws-b');
      TestBed.tick();
      expect(records.get('setup-tb-1')?.status).toBe('interrupted');
      expect(await pending).toEqual({ kind: 'ignored' });

      // Return to workspace A and retry the same record before the backend reply arrives.
      workspaceRoot.set('/ws');
      TestBed.tick();
      setupRuns.report('setup-tb-1', {
        status: 'needs-input',
        step: 'review',
        error: null,
      });
      expect(records.get('setup-tb-1')?.status).toBe('needs-input');

      // Now the cancelled install reply settles with confirmed partial writes for A.
      transport.resolveBackend({
        isSuccess: () => true,
        data: {
          success: false,
          cancelled: true,
          installed: ['owner/repo/qa-one'],
          workspacePath: '/ws/',
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(records.get('setup-tb-1')).toMatchObject({
        status: 'needs-input',
        step: 'review',
        teamBuilder: {
          intent: 'Build Workspace A team',
          installed: ['owner/repo/qa-one'],
        },
      });
      expect(coordinator.hasCompletedInstall('setup-tb-1')).toBe(false);
      expect(createTab).not.toHaveBeenCalled();
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
    });

    it('preserves confirmed skills from a late stopped install reply that arrives while a retried handoff is in flight (18B r2 F3)', async () => {
      let transportA!: ReturnType<
        typeof createProductionAbortRpc<{
          isSuccess: () => boolean;
          data: WizardInstallSkillsWithConsentResponse;
        }>
      >;
      let installAttempt = 0;
      let markSendStarted!: () => void;
      const sendStarted = new Promise<void>((resolve) => {
        markSendStarted = resolve;
      });
      let settleSendB!: (value: { success: boolean; error?: string }) => void;

      rpcCall.mockImplementation(
        (
          method: string,
          _params: unknown,
          options?: { signal?: AbortSignal },
        ) => {
          if (method === 'wizard:install-skills-with-consent') {
            installAttempt += 1;
            if (installAttempt === 1) {
              transportA = createProductionAbortRpc(options);
              return transportA.promise;
            }
            return Promise.resolve({
              isSuccess: () => true,
              data: {
                success: true,
                cancelled: false,
                installed: ['owner/repo/from-b'],
                workspacePath: '/ws',
              },
            });
          }
          if (method === 'wizard:cancel-skill-install') {
            return Promise.resolve({ isSuccess: () => true, data: {} });
          }
          if (method === 'harness:workflow-prompt') {
            return Promise.resolve({
              isSuccess: () => true,
              data: { prompt: 'CONFIGURE_PREAMBLE' },
            });
          }
          return Promise.resolve({ isSuccess: () => true, data: {} });
        },
      );
      sendOrQueueMessage.mockImplementationOnce(() => {
        markSendStarted();
        return new Promise<{ success: boolean; error?: string }>((resolve) => {
          settleSendB = resolve;
        });
      });

      const pendingA = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build Workspace A team',
        previews: [
          {
            skillName: 'owner/repo/from-a',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-a',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      // Switch A -> B while install A is pending.
      workspaceRoot.set('/ws-b');
      TestBed.tick();
      expect(records.get('setup-tb-1')?.status).toBe('interrupted');
      expect(await pendingA).toEqual({ kind: 'ignored' });

      // Return to A, retry same record, and run install attempt B with a different skill.
      workspaceRoot.set('/ws');
      TestBed.tick();
      setupRuns.report('setup-tb-1', {
        status: 'needs-input',
        step: 'review',
        error: null,
      });

      const pendingB = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build Workspace A team',
        previews: [
          {
            skillName: 'owner/repo/from-b',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-b',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      // Wait until attempt B's install has succeeded and its handoff is awaiting send settlement.
      await sendStarted;

      // Late stopped reply from attempt A settles with a confirmed skill absent from B's reply.
      transportA.resolveBackend({
        isSuccess: () => true,
        data: {
          success: false,
          cancelled: true,
          installed: ['owner/repo/from-a'],
          workspacePath: '/ws/',
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      // Now settle B's chat send. Final record and outcome must keep BOTH A's and B's confirmed skills.
      settleSendB({ success: true });
      const outcomeB = await pendingB;

      expect(outcomeB).toEqual({
        kind: 'handed-off',
        tabId: expect.any(String),
        installed: expect.arrayContaining([
          'owner/repo/from-a',
          'owner/repo/from-b',
        ]),
      });
      if (outcomeB.kind === 'handed-off') {
        expect(outcomeB.installed).toHaveLength(2);
      }
      expect(records.get('setup-tb-1')).toMatchObject({
        status: 'completed',
        step: 'handed-off',
        teamBuilder: {
          intent: 'Build Workspace A team',
          installed: expect.arrayContaining([
            'owner/repo/from-a',
            'owner/repo/from-b',
          ]),
        },
      });
      expect(records.get('setup-tb-1')?.teamBuilder?.installed).toHaveLength(2);
    });

    it('preserves late-reconciled skills when a retried handoff fails after send dispatch (18B r2 F3)', async () => {
      let transportA!: ReturnType<
        typeof createProductionAbortRpc<{
          isSuccess: () => boolean;
          data: WizardInstallSkillsWithConsentResponse;
        }>
      >;
      let installAttempt = 0;
      let markSendStarted!: () => void;
      const sendStarted = new Promise<void>((resolve) => {
        markSendStarted = resolve;
      });
      let settleSendB!: (value: { success: boolean; error?: string }) => void;

      rpcCall.mockImplementation(
        (
          method: string,
          _params: unknown,
          options?: { signal?: AbortSignal },
        ) => {
          if (method === 'wizard:install-skills-with-consent') {
            installAttempt += 1;
            if (installAttempt === 1) {
              transportA = createProductionAbortRpc(options);
              return transportA.promise;
            }
            return Promise.resolve({
              isSuccess: () => true,
              data: {
                success: true,
                cancelled: false,
                installed: ['owner/repo/from-b'],
                workspacePath: '/ws',
              },
            });
          }
          if (method === 'wizard:cancel-skill-install') {
            return Promise.resolve({ isSuccess: () => true, data: {} });
          }
          if (method === 'harness:workflow-prompt') {
            return Promise.resolve({
              isSuccess: () => true,
              data: { prompt: 'CONFIGURE_PREAMBLE' },
            });
          }
          return Promise.resolve({ isSuccess: () => true, data: {} });
        },
      );
      sendOrQueueMessage.mockImplementationOnce(() => {
        markSendStarted();
        return new Promise<{ success: boolean; error?: string }>((resolve) => {
          settleSendB = resolve;
        });
      });

      const pendingA = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build Workspace A team',
        previews: [
          {
            skillName: 'owner/repo/from-a',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-a',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      workspaceRoot.set('/ws-b');
      TestBed.tick();
      expect(await pendingA).toEqual({ kind: 'ignored' });

      workspaceRoot.set('/ws');
      TestBed.tick();
      setupRuns.report('setup-tb-1', {
        status: 'needs-input',
        step: 'review',
        error: null,
      });

      const pendingB = coordinator.installAndLaunch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build Workspace A team',
        previews: [
          {
            skillName: 'owner/repo/from-b',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash-b',
          },
        ],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      await sendStarted;
      transportA.resolveBackend({
        isSuccess: () => true,
        data: {
          success: false,
          cancelled: true,
          installed: ['owner/repo/from-a'],
          workspacePath: '/ws/',
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      settleSendB({ success: false, error: 'send failed' });
      const outcomeB = await pendingB;

      expect(outcomeB).toEqual({
        kind: 'failed',
        error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
        installed: expect.arrayContaining([
          'owner/repo/from-a',
          'owner/repo/from-b',
        ]),
      });
      expect(records.get('setup-tb-1')).toMatchObject({
        status: 'failed',
        step: 'review',
        teamBuilder: {
          installed: expect.arrayContaining([
            'owner/repo/from-a',
            'owner/repo/from-b',
          ]),
        },
      });
    });

    it('never infers guidanceLoaded from guidanceFacts or guidanceAnalysis in saveDraft (18B r2 F1)', () => {
      coordinator.saveDraft('setup-tb-1', {
        workspacePath: '/ws',
        intent: 'Check explicit guidanceLoaded',
        guidanceAnalysis: { projectType: 'node', frameworks: ['angular'] },
        guidanceFacts: [],
      });
      expect(coordinator.draftFor('setup-tb-1')?.guidanceLoaded).toBe(false);

      coordinator.saveDraft('setup-tb-1', {
        workspacePath: '/ws',
        guidanceLoaded: true,
      });
      expect(coordinator.draftFor('setup-tb-1')?.guidanceLoaded).toBe(true);

      coordinator.saveDraft('setup-tb-1', {
        workspacePath: '/ws',
        guidanceLoaded: false,
        guidanceFacts: [],
      });
      expect(coordinator.draftFor('setup-tb-1')?.guidanceLoaded).toBe(false);

      coordinator.saveDraft('setup-tb-1', {
        workspacePath: '/ws',
        guidanceAnalysis: { projectType: 'node', frameworks: ['angular'] },
        guidanceFacts: [],
        installCompleted: true,
      });
      expect(coordinator.draftFor('setup-tb-1')?.guidanceLoaded).toBe(false);
    });
  });

  describe('real cross-partition close guards', () => {
    let realTabManager: TabManagerService;
    let realPartition: TabWorkspacePartitionService;
    let realCoordinator: TeamBuilderRunCoordinator;
    let closedEvents: ClosedTabEvent[];
    let unsubscribeClosed: () => void;

    beforeEach(() => {
      TestBed.resetTestingModule();
      localStorage.clear();
      closedEvents = [];
      const modelRefreshMock: jest.Mocked<ModelRefreshControl> = {
        refreshModels: jest.fn().mockResolvedValue(undefined),
      } as jest.Mocked<ModelRefreshControl>;

      TestBed.configureTestingModule({
        providers: [
          TeamBuilderRunCoordinator,
          TabManagerService,
          TabWorkspacePartitionService,
          ConversationRegistry,
          TabSessionBinding,
          ConfirmationDialogService,
          { provide: MODEL_REFRESH_CONTROL, useValue: modelRefreshMock },
          { provide: SetupRunStore, useValue: setupRuns },
          { provide: ClaudeRpcService, useValue: { call: rpcCall } },
          {
            provide: HarnessChatLauncherService,
            useValue: { workspaceRoot, launchTeamBuilder: jest.fn() },
          },
          {
            provide: AppStateManager,
            useValue: {
              currentView,
              requestCanvasTab,
              setCurrentView,
            },
          },
          { provide: ChatStore, useValue: { sendOrQueueMessage } },
          { provide: ActionBannerService, useValue: { showError } },
          {
            provide: ComposerRestoreService,
            useValue: { restore, restoreAttachments },
          },
          {
            provide: LoggingService,
            useValue: { debug: jest.fn(), error: loggerError },
          },
        ],
      });

      realTabManager = TestBed.inject(TabManagerService);
      realPartition = TestBed.inject(TabWorkspacePartitionService);
      realTabManager.switchWorkspace('/ws');
      workspaceRoot.set('/ws');
      realCoordinator = TestBed.inject(TeamBuilderRunCoordinator);
      unsubscribeClosed = realTabManager.onTabClosed((event) => {
        closedEvents.push(event);
      });
      TestBed.tick();
    });

    afterEach(() => {
      unsubscribeClosed();
    });

    it('preserves a busy parked tab when close guards refuse after a failed deferred send and emits normal close teardown once safe', async () => {
      let markSendStarted!: () => void;
      const sendStarted = new Promise<void>((resolve) => {
        markSendStarted = resolve;
      });
      let settleSend!: (value: { success: boolean; error: string }) => void;
      let launchedTabId = '';
      sendOrQueueMessage.mockImplementationOnce(
        (_message: string, opts: { tabId: string }) => {
          launchedTabId = opts.tabId;
          return new Promise((resolve) => {
            settleSend = resolve;
            markSendStarted();
          });
        },
      );
      realCoordinator.attachView('setup-tb-1');

      const pending = realCoordinator.launch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build a team',
        installed: ['owner/repo/one'],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      await sendStarted;
      expect(launchedTabId).toBeTruthy();
      const sdkId = SessionId.create();
      realTabManager.attachSession(launchedTabId, sdkId);

      // Switch workspace while send is still in flight; park tab as busy.
      realTabManager.switchWorkspace('/ws-b');
      workspaceRoot.set('/ws-b');
      realTabManager.updateBackgroundTab(launchedTabId, {
        status: 'streaming',
      });
      TestBed.tick();

      const removeSpy = jest.spyOn(realPartition, 'removeBackgroundTab');
      const closeAcrossSpy = jest.spyOn(
        realTabManager,
        'closeTabAcrossWorkspaces',
      );

      settleSend({ success: false, error: 'backend unavailable' });
      const outcome = await pending;

      expect(outcome).toEqual({
        kind: 'failed',
        error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
        installed: ['owner/repo/one'],
      });
      // Guarded close refused the busy parked tab: no raw removal, no close event,
      // and the pending cleanup entry stays until the tab becomes safe to close.
      expect(closeAcrossSpy).toHaveBeenCalledWith(launchedTabId, sdkId);
      expect(removeSpy).not.toHaveBeenCalled();
      expect(realTabManager.findTabByIdAcrossWorkspaces(launchedTabId)).not.toBeNull();
      expect(closedEvents).toEqual([]);
      expect(
        (
          realCoordinator as unknown as {
            pendingTabCleanups: Map<string, string>;
          }
        ).pendingTabCleanups.get(launchedTabId),
      ).toBe('/ws');

      // Another background update while still busy does not retry or force-remove.
      closeAcrossSpy.mockClear();
      realTabManager.updateBackgroundTab(launchedTabId, {
        status: 'sleeping',
      });
      TestBed.tick();
      await Promise.resolve();
      expect(closeAcrossSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
      expect(realTabManager.findTabByIdAcrossWorkspaces(launchedTabId)).not.toBeNull();
      expect(closedEvents).toEqual([]);

      // Once the parked tab is idle/loaded, authorized cleanup closes it through
      // the supported close path, emits the normal close event, and clears the entry.
      realTabManager.updateBackgroundTab(launchedTabId, {
        status: 'loaded',
      });
      TestBed.tick();
      await Promise.resolve();
      await Promise.resolve();

      expect(closeAcrossSpy).toHaveBeenCalledWith(launchedTabId, sdkId);
      expect(realTabManager.findTabByIdAcrossWorkspaces(launchedTabId)).toBeNull();
      expect(closedEvents).toEqual([
        {
          tabId: launchedTabId,
          sessionId: sdkId,
          kind: 'close',
          streamAbortDispatched: false,
        },
      ]);
      expect(
        (
          realCoordinator as unknown as {
            pendingTabCleanups: Map<string, string>;
          }
        ).pendingTabCleanups.has(launchedTabId),
      ).toBe(false);
    });

    it('leaves a dirty parked tab available to the user when close guards refuse after a cancelled deferred send', async () => {
      let markSendStarted!: () => void;
      const sendStarted = new Promise<void>((resolve) => {
        markSendStarted = resolve;
      });
      let settleSend!: (value: { success: boolean; cancelled: boolean }) => void;
      let launchedTabId = '';
      sendOrQueueMessage.mockImplementationOnce(
        (_message: string, opts: { tabId: string }) => {
          launchedTabId = opts.tabId;
          return new Promise((resolve) => {
            settleSend = resolve;
            markSendStarted();
          });
        },
      );
      realCoordinator.attachView('setup-tb-1');

      const pending = realCoordinator.launch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build a team',
        installed: [],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      await sendStarted;
      expect(launchedTabId).toBeTruthy();

      // Switch workspace while send is in flight; park tab with unsaved user work.
      realTabManager.switchWorkspace('/ws-b');
      workspaceRoot.set('/ws-b');
      realTabManager.updateBackgroundTab(launchedTabId, {
        status: 'loaded',
        isDirty: true,
      });
      TestBed.tick();

      const removeSpy = jest.spyOn(realPartition, 'removeBackgroundTab');
      const closePredecessorSpy = jest.spyOn(
        realTabManager,
        'closeHandoffPredecessor',
      );

      settleSend({ success: false, cancelled: true });
      const outcome = await pending;

      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(closePredecessorSpy).toHaveBeenCalledWith(
        launchedTabId,
        null,
        false,
      );
      expect(removeSpy).not.toHaveBeenCalled();
      expect(realTabManager.findTabByIdAcrossWorkspaces(launchedTabId)).not.toBeNull();
      expect(closedEvents).toEqual([]);
      expect(
        (
          realCoordinator as unknown as {
            pendingTabCleanups: Map<string, string>;
          }
        ).pendingTabCleanups.has(launchedTabId),
      ).toBe(false);

      // Returning to /ws leaves the dirty tab open for the user.
      realTabManager.switchWorkspace('/ws');
      workspaceRoot.set('/ws');
      TestBed.tick();
      await Promise.resolve();

      expect(
        realTabManager.tabs().some((tab) => tab.id === launchedTabId),
      ).toBe(true);
      expect(closedEvents).toEqual([]);
    });

    it('retires deferred cleanup and keeps the tab open when the user returns and activates a previously busy parked tab before it settles to loaded', async () => {
      let markSendStarted!: () => void;
      const sendStarted = new Promise<void>((resolve) => {
        markSendStarted = resolve;
      });
      let settleSend!: (value: { success: boolean; error: string }) => void;
      let launchedTabId = '';
      sendOrQueueMessage.mockImplementationOnce(
        (_message: string, opts: { tabId: string }) => {
          launchedTabId = opts.tabId;
          return new Promise((resolve) => {
            settleSend = resolve;
            markSendStarted();
          });
        },
      );
      realCoordinator.attachView('setup-tb-1');

      const pending = realCoordinator.launch({
        recordId: 'setup-tb-1',
        workspacePath: '/ws',
        intent: 'Build a team',
        installed: ['owner/repo/one'],
        guidanceAnalysis: { projectType: 'unknown', frameworks: [] },
        guidanceFacts: [],
        ownerDecision: null,
        attachmentSnapshot: makeSnapshot(),
      });

      await sendStarted;
      expect(launchedTabId).toBeTruthy();
      const sdkId = SessionId.create();
      realTabManager.attachSession(launchedTabId, sdkId);

      // Switch workspace while send is still in flight; park tab as busy.
      realTabManager.switchWorkspace('/ws-b');
      workspaceRoot.set('/ws-b');
      realTabManager.updateBackgroundTab(launchedTabId, {
        status: 'streaming',
      });
      TestBed.tick();

      const closeTabSpy = jest.spyOn(realTabManager, 'closeTab');
      const removeSpy = jest.spyOn(realPartition, 'removeBackgroundTab');

      settleSend({ success: false, error: 'backend unavailable' });
      const outcome = await pending;

      expect(outcome).toEqual({
        kind: 'failed',
        error: TEAM_BUILDER_INSTALLED_LAUNCH_ERROR,
        installed: ['owner/repo/one'],
      });
      expect(closedEvents).toEqual([]);
      expect(
        (
          realCoordinator as unknown as {
            pendingTabCleanups: Map<string, string>;
          }
        ).pendingTabCleanups.get(launchedTabId),
      ).toBe('/ws');

      // Return to the original workspace and activate the tab while still busy.
      realTabManager.switchWorkspace('/ws');
      workspaceRoot.set('/ws');
      realTabManager.switchTab(launchedTabId);
      TestBed.tick();
      await Promise.resolve();

      expect(realTabManager.activeTabId()).toBe(launchedTabId);
      expect(
        (
          realCoordinator as unknown as {
            pendingTabCleanups: Map<string, string>;
          }
        ).pendingTabCleanups.has(launchedTabId),
      ).toBe(false);

      // Settle the active tab to loaded and clean: it must stay open with zero close events.
      realTabManager.markLoaded(launchedTabId);
      TestBed.tick();
      await Promise.resolve();
      await Promise.resolve();

      expect(closeTabSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
      expect(
        realTabManager.tabs().some((tab) => tab.id === launchedTabId),
      ).toBe(true);
      expect(realTabManager.activeTabId()).toBe(launchedTabId);
      expect(
        realTabManager.findTabByIdAcrossWorkspaces(launchedTabId)?.tab,
      ).toMatchObject({ status: 'loaded', isDirty: false });
      expect(closedEvents).toEqual([]);
      expect(
        (
          realCoordinator as unknown as {
            pendingTabCleanups: Map<string, string>;
          }
        ).pendingTabCleanups.has(launchedTabId),
      ).toBe(false);
    });
  });
});
