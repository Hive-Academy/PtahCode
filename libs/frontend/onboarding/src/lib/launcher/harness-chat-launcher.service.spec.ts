import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActionBannerService,
  ChatStore,
  ComposerRestoreService,
} from '@ptah-extension/chat';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
  VSCodeService,
} from '@ptah-extension/core';
import type { NewProjectIntake } from '@ptah-extension/shared';
import { formatIntakeSummary } from '../proposal/new-project-intake.model';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
  type LauncherAttachmentSnapshot,
} from './harness-chat-launcher.service';

function rpcSuccess<T>(data: T) {
  return {
    success: true,
    data,
    error: undefined,
    isSuccess: () => true,
  };
}

function rpcFailure(error: string) {
  return {
    success: false,
    data: undefined,
    error,
    isSuccess: () => false,
  };
}

const VALID_INTAKE: NewProjectIntake = {
  what: 'Build an incident command center',
  audience: 'internal',
  platform: 'node-ts',
  stack: 'recommend',
  constraints: 'Audit trail required',
};

describe('HarnessChatLauncherService', () => {
  let service: HarnessChatLauncherService;
  let callOrder: string[];
  let rpcCall: jest.Mock;
  let tabs: {
    activeWorkspacePath: string | null;
    createTab: jest.Mock<string, [string?]>;
    setWorkflow: jest.Mock<void, [string, string]>;
    setFirstMessagePreamble: jest.Mock<void, [string, string]>;
    closeTab: jest.Mock<Promise<void>, [string, boolean?]>;
  };
  let config: ReturnType<typeof signal<{ workspaceRoot: string }>>;
  let appState: {
    requestCanvasTab: jest.Mock<
      Promise<boolean>,
      [string, string | null, string?, boolean?, { timeoutMs?: number }?]
    >;
    setCurrentView: jest.Mock<void, [string]>;
  };
  let chatStore: {
    sendOrQueueMessage: jest.Mock;
  };
  let loggerError: jest.Mock;
  let showError: jest.Mock;
  let restore: jest.Mock;
  let restoreAttachments: jest.Mock;

  function makeSnapshot(
    options: LauncherAttachmentSnapshot['options'] = {
      files: ['/ws/spec.md'],
      images: [{ data: 'YWJj', mediaType: 'image/png' }],
    },
  ): LauncherAttachmentSnapshot & { removeSent: jest.Mock } {
    return {
      options,
      attachments: { files: [], images: [] },
      removeSent: jest.fn(() => {
        callOrder.push('removeSent');
      }),
    };
  }

  beforeEach(() => {
    callOrder = [];
    rpcCall = jest.fn();
    tabs = {
      activeWorkspacePath: '/ws',
      createTab: jest.fn((name?: string) => {
        callOrder.push(`createTab:${name ?? ''}`);
        return 'tab-42';
      }),
      setWorkflow: jest.fn((tabId: string, workflow: string) => {
        callOrder.push(`setWorkflow:${tabId}:${workflow}`);
      }),
      setFirstMessagePreamble: jest.fn((tabId: string, preamble: string) => {
        callOrder.push(`setFirstMessagePreamble:${tabId}:${preamble}`);
      }),
      closeTab: jest.fn(async (tabId: string) => {
        callOrder.push(`closeTab:${tabId}`);
      }),
    };
    config = signal({ workspaceRoot: '/ws' });
    appState = {
      requestCanvasTab: jest.fn(
        (
          tabId: string,
          workspacePath: string | null,
          name?: string,
          focus?: boolean,
        ) => {
          callOrder.push(
            `requestCanvasTab:${tabId}:${workspacePath ?? ''}:${name ?? ''}:${String(focus)}`,
          );
          return Promise.resolve(true);
        },
      ),
      setCurrentView: jest.fn((view: string) => {
        callOrder.push(`setCurrentView:${view}`);
      }),
    };
    chatStore = {
      sendOrQueueMessage: jest.fn(async () => {
        callOrder.push('sendOrQueueMessage');
        return { success: true };
      }),
    };
    loggerError = jest.fn();
    showError = jest.fn();
    restore = jest.fn();
    restoreAttachments = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        HarnessChatLauncherService,
        { provide: ClaudeRpcService, useValue: { call: rpcCall } },
        { provide: TabManagerService, useValue: tabs },
        { provide: AppStateManager, useValue: appState },
        { provide: ChatStore, useValue: chatStore },
        { provide: ActionBannerService, useValue: { showError } },
        { provide: ComposerRestoreService, useValue: { restore, restoreAttachments } },
        { provide: VSCodeService, useValue: { config } },
        { provide: LoggingService, useValue: { error: loggerError } },
      ],
    });

    service = TestBed.inject(HarnessChatLauncherService);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('checkFolderEmpty', () => {
    it('queries harness:initialize and returns workspaceEffectivelyEmpty', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({ workspaceEffectivelyEmpty: false }),
      );

      await expect(service.checkFolderEmpty('/ws')).resolves.toBe(false);
      expect(rpcCall).toHaveBeenCalledWith('harness:initialize', {
        workspaceRoot: '/ws',
      });
    });

    it('throws a readable error when harness:initialize fails', async () => {
      rpcCall.mockResolvedValueOnce(rpcFailure('Host unavailable'));

      await expect(service.checkFolderEmpty('/ws')).rejects.toThrow(
        'Host unavailable',
      );
    });
  });

  describe('launchNewProject', () => {
    it('prepares via harness:start-new-project then executes the 6-step chat launch flow with attachments', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({
          success: true,
          seedPrompt: 'SYSTEM_SEED_PROMPT',
          intake: VALID_INTAKE,
          plugins: {
            enabledBundled: ['ptah-nx-saas'],
            missingExternal: [],
            availableSkillIds: [],
          },
        }),
      );
      const snapshot = makeSnapshot();

      const result = await service.launchNewProject(VALID_INTAKE, snapshot);

      expect(result).toEqual({ tabId: 'tab-42' });
      expect(rpcCall).toHaveBeenCalledWith('harness:start-new-project', {
        intake: VALID_INTAKE,
      });
      expect(chatStore.sendOrQueueMessage).toHaveBeenCalledWith(
        formatIntakeSummary(VALID_INTAKE),
        {
          files: ['/ws/spec.md'],
          images: [{ data: 'YWJj', mediaType: 'image/png' }],
          tabId: 'tab-42',
          workspacePath: '/ws',
        },
      );
      expect(callOrder).toEqual([
        'createTab:New Project',
        'setWorkflow:tab-42:harness-new-project',
        'setFirstMessagePreamble:tab-42:SYSTEM_SEED_PROMPT',
        'requestCanvasTab:tab-42:/ws:New Project:true',
        'setCurrentView:chat',
        'sendOrQueueMessage',
        'removeSent',
      ]);
    });

    it('throws, creates no tab, and preserves attachments when preparation fails', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({
          success: false,
          error: 'Plugin reconciliation failed',
        }),
      );
      const snapshot = makeSnapshot();

      await expect(
        service.launchNewProject(VALID_INTAKE, snapshot),
      ).rejects.toThrow('Plugin reconciliation failed');

      expect(tabs.createTab).not.toHaveBeenCalled();
      expect(appState.requestCanvasTab).not.toHaveBeenCalled();
      expect(appState.setCurrentView).not.toHaveBeenCalled();
      expect(chatStore.sendOrQueueMessage).not.toHaveBeenCalled();
      expect(snapshot.removeSent).not.toHaveBeenCalled();
    });

    it('preserves attachments and throws when sendOrQueueMessage reports failure', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({
          success: true,
          seedPrompt: 'SYSTEM_SEED_PROMPT',
          intake: VALID_INTAKE,
          plugins: {
            enabledBundled: [],
            missingExternal: [],
            availableSkillIds: [],
          },
        }),
      );
      chatStore.sendOrQueueMessage.mockResolvedValueOnce({
        success: false,
        error: 'Sign in required',
      });
      const snapshot = makeSnapshot();

      await expect(
        service.launchNewProject(VALID_INTAKE, snapshot),
      ).rejects.toThrow('Sign in required');

      expect(snapshot.removeSent).not.toHaveBeenCalled();
      expect(showError).toHaveBeenCalledWith('Sign in required', 'tab-42');
      expect(restore).toHaveBeenCalledWith('tab-42', [
        formatIntakeSummary(VALID_INTAKE),
      ]);
    });

    it('shows the error and restores the draft when sendOrQueueMessage throws', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({
          success: true,
          seedPrompt: 'SYSTEM_SEED_PROMPT',
          intake: VALID_INTAKE,
          plugins: {
            enabledBundled: [],
            missingExternal: [],
            availableSkillIds: [],
          },
        }),
      );
      chatStore.sendOrQueueMessage.mockRejectedValueOnce(
        new Error('Network down'),
      );
      const snapshot = makeSnapshot();
      const file = {
        path: '/ws/spec.md', name: 'spec.md', size: 10, type: 'text' as const,
        isLarge: false, tokenEstimate: 3,
      };
      const image = {
        id: 'pasted-1', data: 'YWJj', mediaType: 'image/png',
        dataUrl: 'data:image/png;base64,YWJj', name: 'pasted-image.png',
      };
      snapshot.attachments.files.push(file);
      snapshot.attachments.images.push(image);

      await expect(
        service.launchNewProject(VALID_INTAKE, snapshot),
      ).rejects.toThrow('Network down');

      expect(showError).toHaveBeenCalledWith('Network down', 'tab-42');
      expect(restore).toHaveBeenCalledWith('tab-42', [
        formatIntakeSummary(VALID_INTAKE),
      ]);
      expect(restoreAttachments).toHaveBeenCalledWith('tab-42', [file], [image]);
      expect(snapshot.removeSent).not.toHaveBeenCalled();
    });

    it('does not show a chat error when preparation fails', async () => {
      rpcCall.mockResolvedValueOnce(rpcFailure('Host unavailable'));

      await expect(
        service.launchNewProject(VALID_INTAKE, makeSnapshot()),
      ).rejects.toThrow('Host unavailable');

      expect(showError).not.toHaveBeenCalled();
      expect(restore).not.toHaveBeenCalled();
    });

    it('binds the canvas tab to the checked workspace when the active tab has no path', async () => {
      tabs.activeWorkspacePath = null;
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({ prompt: 'CONFIGURE_HARNESS_PREAMBLE' }),
      );

      await service.launchTeamBuilder('Build a QA team', makeSnapshot());

      expect(appState.requestCanvasTab).toHaveBeenCalledWith(
        'tab-42',
        '/ws',
        'AI Team Builder',
        true,
        { timeoutMs: 10_000 },
      );
    });

    it('pins the first send when the workspace changes during canvas adoption', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({ prompt: 'CONFIGURE_HARNESS_PREAMBLE' }),
      );
      appState.requestCanvasTab.mockImplementationOnce(async () => {
        config.set({ workspaceRoot: '/other' });
        return true;
      });

      await service.launchTeamBuilder('Build a QA team', makeSnapshot());

      expect(chatStore.sendOrQueueMessage).toHaveBeenCalledWith(
        'Build a QA team',
        expect.objectContaining({ tabId: 'tab-42', workspacePath: '/ws' }),
      );
    });

    it('stops before it opens chat when the start page was left during preparation', async () => {
      const controller = new AbortController();
      rpcCall.mockImplementationOnce(async () => {
        controller.abort();
        return rpcSuccess({
          success: true,
          seedPrompt: 'SYSTEM_SEED_PROMPT',
          intake: VALID_INTAKE,
          plugins: { enabledBundled: [], missingExternal: [], availableSkillIds: [] },
        });
      });
      const snapshot = makeSnapshot();

      await expect(
        service.launchNewProject(VALID_INTAKE, snapshot, {
          signal: controller.signal,
        }),
      ).rejects.toBeInstanceOf(HarnessChatLaunchCancelledError);

      expect(tabs.createTab).not.toHaveBeenCalled();
      expect(appState.setCurrentView).not.toHaveBeenCalled();
      expect(chatStore.sendOrQueueMessage).not.toHaveBeenCalled();
      expect(showError).not.toHaveBeenCalled();
      expect(snapshot.removeSent).not.toHaveBeenCalled();
    });

    it('rejects a preparation result when the workspace changed during the RPC', async () => {
      tabs.activeWorkspacePath = null;
      rpcCall.mockImplementationOnce(async () => {
        config.set({ workspaceRoot: '/other' });
        return rpcSuccess({
          success: true,
          seedPrompt: 'SYSTEM_SEED_PROMPT',
          intake: VALID_INTAKE,
          plugins: { enabledBundled: [], missingExternal: [], availableSkillIds: [] },
        });
      });
      const snapshot = makeSnapshot();

      await expect(
        service.launchNewProject(VALID_INTAKE, snapshot),
      ).rejects.toThrow('The workspace changed while the chat was being prepared.');

      expect(tabs.createTab).not.toHaveBeenCalled();
      expect(appState.requestCanvasTab).not.toHaveBeenCalled();
      expect(chatStore.sendOrQueueMessage).not.toHaveBeenCalled();
      expect(snapshot.removeSent).not.toHaveBeenCalled();
    });

    it('closes the tab and sends nothing when the canvas does not adopt it', async () => {
      appState.requestCanvasTab.mockImplementationOnce(async () => {
        callOrder.push('requestCanvasTab');
        return false;
      });
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({ prompt: 'CONFIGURE_HARNESS_PREAMBLE' }),
      );
      const snapshot = makeSnapshot();

      await expect(
        service.launchTeamBuilder('Build a QA team', snapshot),
      ).rejects.toThrow('Could not show the new chat on the canvas. Try again.');

      expect(callOrder).toEqual([
        'createTab:AI Team Builder',
        'setWorkflow:tab-42:harness-configure',
        'setFirstMessagePreamble:tab-42:CONFIGURE_HARNESS_PREAMBLE',
        'requestCanvasTab',
        'setCurrentView:chat',
        'closeTab:tab-42',
      ]);
      expect(tabs.closeTab).toHaveBeenCalledWith('tab-42', true);
      expect(showError).toHaveBeenCalledWith(
        'Could not show the new chat on the canvas. Try again.',
      );
      expect(chatStore.sendOrQueueMessage).not.toHaveBeenCalled();
      expect(snapshot.removeSent).not.toHaveBeenCalled();
    });
  });

  describe('launchTeamBuilder', () => {
    it('fetches harness:workflow-prompt then launches an AI Team Builder chat tab with attachments', async () => {
      rpcCall.mockResolvedValueOnce(
        rpcSuccess({ prompt: 'CONFIGURE_HARNESS_PREAMBLE' }),
      );
      const snapshot = makeSnapshot({
        files: ['/ws/team.md'],
        images: undefined,
      });

      const result = await service.launchTeamBuilder(
        '  Build a security review squad  ',
        snapshot,
      );

      expect(result).toEqual({ tabId: 'tab-42' });
      expect(rpcCall).toHaveBeenCalledWith('harness:workflow-prompt', {
        mode: 'configure-harness',
        contextOnly: true,
      });
      expect(chatStore.sendOrQueueMessage).toHaveBeenCalledWith(
        'Build a security review squad',
        {
          files: ['/ws/team.md'],
          images: undefined,
          tabId: 'tab-42',
          workspacePath: '/ws',
        },
      );
      expect(callOrder).toEqual([
        'createTab:AI Team Builder',
        'setWorkflow:tab-42:harness-configure',
        'setFirstMessagePreamble:tab-42:CONFIGURE_HARNESS_PREAMBLE',
        'requestCanvasTab:tab-42:/ws:AI Team Builder:true',
        'setCurrentView:chat',
        'sendOrQueueMessage',
        'removeSent',
      ]);
    });

    it('creates no tab and preserves attachments when harness:workflow-prompt fails', async () => {
      rpcCall.mockResolvedValueOnce(rpcFailure('Prompt service offline'));
      const snapshot = makeSnapshot();

      await expect(
        service.launchTeamBuilder('Build a QA team', snapshot),
      ).rejects.toThrow('Prompt service offline');

      expect(tabs.createTab).not.toHaveBeenCalled();
      expect(appState.setCurrentView).not.toHaveBeenCalled();
      expect(snapshot.removeSent).not.toHaveBeenCalled();
    });

    it('rejects before any RPC when no workspace is open', async () => {
      tabs.activeWorkspacePath = null;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          HarnessChatLauncherService,
          { provide: ClaudeRpcService, useValue: { call: rpcCall } },
          { provide: TabManagerService, useValue: tabs },
          { provide: AppStateManager, useValue: appState },
          { provide: ChatStore, useValue: chatStore },
          { provide: ActionBannerService, useValue: { showError } },
          { provide: ComposerRestoreService, useValue: { restore } },
          {
            provide: VSCodeService,
            useValue: { config: signal({ workspaceRoot: '' }) },
          },
          { provide: LoggingService, useValue: { error: loggerError } },
        ],
      });
      service = TestBed.inject(HarnessChatLauncherService);
      const snapshot = makeSnapshot();

      await expect(
        service.launchTeamBuilder('Build a QA team', snapshot),
      ).rejects.toThrow('Open a workspace before starting the team builder.');
      expect(rpcCall).not.toHaveBeenCalled();
      expect(tabs.createTab).not.toHaveBeenCalled();
    });
  });
});
