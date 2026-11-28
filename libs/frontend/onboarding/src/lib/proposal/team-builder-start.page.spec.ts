import { assertNotInReactiveContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import {
  ActionBannerService,
  ChatStore,
  ComposerAttachmentsService,
  ComposerRestoreService,
  FilePickerService,
} from '@ptah-extension/chat';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
  type ViewType,
} from '@ptah-extension/core';
import type { WizardInstallSkillsWithConsentResponse } from '@ptah-extension/shared';
import {
  SetupRunStore,
  type SetupRunRecord,
  type SetupRunReport,
  type SetupRunStartOptions,
  type SetupRunWorkflow,
} from '@ptah-extension/setup-wizard';
import { NativeModalComponent } from '@ptah-extension/ui';
import { HarnessChatLauncherService } from '../launcher/harness-chat-launcher.service';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';
import { StackSkillConsentComponent } from './stack-skill-consent.component';
import { TeamBuilderRunCoordinator } from './team-builder-run.coordinator';
import { TeamBuilderStartPage } from './team-builder-start.page';
import { StackSkillStore } from './stack-skill.store';

const attachment = (path: string) => ({
  path,
  name: path.split('/').pop() ?? path,
  size: 12,
  type: 'text' as const,
  isLarge: false,
  tokenEstimate: 3,
});

function submitEvent(): Event {
  return new Event('submit', { cancelable: true });
}

describe('TeamBuilderStartPage', () => {
  let call: jest.Mock;
  let workspaceRoot: ReturnType<typeof signal<string>>;
  let currentView: ReturnType<typeof signal<ViewType>>;
  let navigate: jest.Mock;
  let openTabs: ReturnType<typeof signal<Array<{ id: string }>>>;
  let switchTab: jest.Mock;
  let createTab: jest.Mock;
  let setWorkflow: jest.Mock;
  let setFirstMessagePreamble: jest.Mock;
  let closeTab: jest.Mock;
  let requestCanvasTab: jest.Mock;
  let setCurrentView: jest.Mock;
  let sendOrQueueMessage: jest.Mock;
  let showError: jest.Mock;
  let restore: jest.Mock;
  let restoreAttachments: jest.Mock;
  let runRecords: ReturnType<typeof signal<SetupRunRecord[]>>;
  let nextRunSeq: number;
  let setupRuns: {
    runsFor: jest.Mock<SetupRunRecord[], [string | null | undefined]>;
    get: jest.Mock<SetupRunRecord | null, [string]>;
    start: jest.Mock<
      SetupRunRecord | null,
      [SetupRunWorkflow, string | null | undefined, SetupRunStartOptions?]
    >;
    report: jest.Mock<SetupRunRecord | null, [string, SetupRunReport]>;
    attach: jest.Mock<SetupRunRecord | null, [string]>;
    release: jest.Mock;
    cancel: jest.Mock<Promise<boolean>, [string]>;
    retry: jest.Mock<Promise<SetupRunRecord | null>, [string]>;
  };

  beforeEach(() => {
    localStorage.clear();
    workspaceRoot = signal('/ws');
    currentView = signal<ViewType>('onboarding');
    openTabs = signal([{ id: 'tab-team' }]);
    switchTab = jest.fn();
    createTab = jest.fn(() => 'tab-team');
    setWorkflow = jest.fn();
    setFirstMessagePreamble = jest.fn();
    closeTab = jest.fn().mockResolvedValue(undefined);
    requestCanvasTab = jest.fn().mockResolvedValue(true);
    setCurrentView = jest.fn((view: ViewType) => currentView.set(view));
    sendOrQueueMessage = jest.fn().mockResolvedValue({ success: true });
    showError = jest.fn();
    restore = jest.fn();
    restoreAttachments = jest.fn();
    runRecords = signal([]);
    nextRunSeq = 0;

    setupRuns = {
      runsFor: jest.fn((workspace: string | null | undefined) =>
        workspace
          ? runRecords()
              .filter((record) => record.workspacePath === workspace)
              .sort(
                (a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt,
              )
          : [],
      ),
      get: jest.fn(
        (id: string) => runRecords().find((record) => record.id === id) ?? null,
      ),
      start: jest.fn(
        (
          workflow: SetupRunWorkflow,
          workspace: string | null | undefined,
          options: SetupRunStartOptions = {},
        ): SetupRunRecord | null => {
          if (!workspace) return null;
          const live = runRecords().find(
            (record) =>
              record.workspacePath === workspace &&
              record.workflow === workflow &&
              (record.status === 'running' || record.status === 'needs-input'),
          );
          if (live) return live;
          const now = Date.now() + ++nextRunSeq;
          const record: SetupRunRecord = {
            id: `setup-tb-${nextRunSeq}`,
            workspacePath: workspace,
            workflow,
            status: options.status ?? 'running',
            step: options.step ?? 'intent',
            backendRunId: null,
            analysisRunId: null,
            parentId: options.parentId ?? null,
            unseen: false,
            createdAt: now,
            updatedAt: now,
          };
          runRecords.update((list) => [...list, record]);
          return record;
        },
      ),
      report: jest.fn((id: string, update: SetupRunReport) => {
        let updated: SetupRunRecord | null = null;
        runRecords.update((list) =>
          list.map((record) => {
            if (record.id !== id) return record;
            const next: SetupRunRecord = {
              ...record,
              ...(update.status !== undefined ? { status: update.status } : {}),
              ...(update.step !== undefined ? { step: update.step } : {}),
              ...(update.handoffTabId !== undefined
                ? { handoffTabId: update.handoffTabId }
                : {}),
              ...(update.teamBuilder !== undefined
                ? {
                    teamBuilder: {
                      ...record.teamBuilder,
                      intent: update.teamBuilder.intent,
                      installed: [...update.teamBuilder.installed],
                    },
                  }
                : {}),
              updatedAt: record.updatedAt + 1,
            };
            if (update.error === null) delete next.error;
            else if (update.error !== undefined) next.error = update.error;
            updated = next;
            return next;
          }),
        );
        return updated;
      }),
      attach: jest.fn((id: string) => setupRuns.get(id)),
      release: jest.fn(),
      cancel: jest.fn(async (id: string) => {
        const current = setupRuns.get(id);
        if (
          !current ||
          (current.status !== 'running' && current.status !== 'needs-input')
        ) {
          return false;
        }
        setupRuns.report(id, { status: 'cancelled' });
        return true;
      }),
      retry: jest.fn(async (id: string) => {
        const current = setupRuns.get(id);
        if (
          !current ||
          (current.status !== 'failed' && current.status !== 'interrupted')
        ) {
          return null;
        }
        return setupRuns.report(id, {
          status: 'needs-input',
          step: 'review',
          error: null,
        });
      }),
    };

    call = jest.fn(async (method: string) => ({
      isSuccess: () => true,
      data:
        method === 'wizard:list-analyses'
          ? { analyses: [] }
          : method === 'wizard:get-project-guidance'
            ? { facts: [], ownerDecisionPrompt: '' }
            : method === 'harness:workflow-prompt'
              ? { prompt: 'CONFIGURE_PREAMBLE' }
              : { skills: [] },
    }));
    navigate = jest.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        TeamBuilderRunCoordinator,
        { provide: SetupRunStore, useValue: setupRuns },
        {
          provide: HarnessChatLauncherService,
          useValue: { workspaceRoot, launchTeamBuilder: jest.fn() },
        },
        {
          provide: TabManagerService,
          useValue: {
            tabs: openTabs.asReadonly(),
            backgroundTabsRevision: signal(0),
            findTabByIdAcrossWorkspaces: jest.fn((tabId: string) =>
              openTabs().some((t) => t.id === tabId)
                ? { tab: { id: tabId } }
                : null,
            ),
            switchTab,
            createTab,
            setWorkflow,
            setFirstMessagePreamble,
            closeTab,
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
        { provide: Router, useValue: { navigate } },
        {
          provide: LoggingService,
          useValue: { debug: jest.fn(), error: jest.fn() },
        },
        ComposerAttachmentsService,
        StackSkillStore,
        { provide: ClaudeRpcService, useValue: { call } },
        {
          provide: FilePickerService,
          useValue: { isFileSupported: () => true },
        },
        {
          provide: OnboardingWorkspaceStore,
          useValue: {
            isElectron: false,
            active: signal(null),
            activePath: signal('/ws'),
            folders: signal([]),
            activeIndex: signal(-1),
            openFolder: jest.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('retries a failed launch after successful installation without reinstalling', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    try {
      fixture.detectChanges();
      await fixture.whenStable();
      const page = fixture.componentInstance;
      page.state.setIntent('Build a team');
      page.state.setPreview([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ]);
      page.state.setStage('consent');
      call.mockResolvedValueOnce({
        isSuccess: () => true,
        data: {
          success: true,
          installed: ['owner/repo/one'],
          workspacePath: '/ws',
        },
      });
      sendOrQueueMessage.mockRejectedValueOnce(new Error('navigation failed'));
      await page.install();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(page.state.installed()).toEqual(['owner/repo/one']);
      expect(root.textContent).toContain(
        'Skills are installed. Could not start the team builder. Try again.',
      );
      expect(
        root.querySelector('[data-testid="skill-install-primary"]'),
      ).toBeNull();
      expect('set' in page.loadError).toBe(false);
      const installCallsBefore = call.mock.calls.filter(
        ([method]) => method === 'wizard:install-skills-with-consent',
      ).length;
      await page.install();
      expect(
        call.mock.calls.filter(
          ([method]) => method === 'wizard:install-skills-with-consent',
        ),
      ).toHaveLength(installCallsBefore);
      const retry = [...root.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Continue to team builder'),
      );
      expect(retry).toBeDefined();
      retry?.click();
      await fixture.whenStable();
      expect(sendOrQueueMessage).toHaveBeenCalledTimes(2);
      expect(
        call.mock.calls.filter(
          ([method]) => method === 'wizard:install-skills-with-consent',
        ),
      ).toHaveLength(installCallsBefore);
    } finally {
      fixture.destroy();
    }
  });

  it('closes the consent modal on install so Back and Cancel are reachable by mouse and keyboard while installing', async () => {
    let finishInstall!: (value: {
      isSuccess: () => boolean;
      data: WizardInstallSkillsWithConsentResponse;
    }) => void;
    call.mockImplementation(async (method: string) => {
      if (method === 'wizard:install-skills-with-consent') {
        return new Promise((resolve) => {
          finishInstall = resolve;
        });
      }
      return { isSuccess: () => true, data: { prompt: 'PREAMBLE', skills: [] } };
    });

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    try {
      fixture.detectChanges();
      TestBed.tick();
      const root = fixture.nativeElement as HTMLElement;
      const page = fixture.componentInstance;
      expect(page.viewStage()).toBe('intent');
      const consent = fixture.debugElement.query(
        By.directive(StackSkillConsentComponent),
      );
      if (!consent) {
        throw new Error(
          `Expected skill consent (stage=${page.viewStage()}, rootChildren=${root.childElementCount}, rootHtml=${root.innerHTML.slice(0, 500)})`,
        );
      }
      const consentHost = consent.nativeElement as HTMLElement;
      const dialog = consentHost.getElementsByTagName('dialog').item(0);
      if (!dialog) {
        const nativeModal = consent.query(By.directive(NativeModalComponent));
        throw new Error(
          `Expected a native dialog in skill consent (nativeModal=${Boolean(nativeModal)}, rootDialogs=${root.getElementsByTagName('dialog').length}, documentDialogs=${document.getElementsByTagName('dialog').length}, consentHtml=${consentHost.outerHTML.slice(0, 500)})`,
        );
      }
      expect(dialog.isConnected).toBe(true);
      expect(root.contains(dialog)).toBe(true);
      expect(dialog.open).toBe(false);

      page.state.setIntent('Build a team');
      page.state.setPreview([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ]);
      page.state.setStage('consent');
      fixture.detectChanges();
      TestBed.tick();
      expect(page.viewStage()).toBe('consent');
      expect(dialog.open).toBe(true);

      // Click Install from inside the consent modal.
      const installBtn = [...dialog.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes('Install 1 skill'),
      );
      if (!installBtn) {
        throw new Error(
          `Expected the consent Install button (stage=${page.viewStage()}, dialogHtml=${dialog.outerHTML.slice(0, 500)})`,
        );
      }
      installBtn.click();
      fixture.detectChanges();
      TestBed.tick();

      // Consent modal must be closed and inert; progress controls must be reachable.
      expect(dialog.open).toBe(false);
      expect(dialog.inert).toBe(true);
      const backBtn = root.querySelector<HTMLButtonElement>(
        '[data-testid="team-builder-installing-back"]',
      );
      const cancelBtn = root.querySelector<HTMLButtonElement>(
        '[data-testid="team-builder-cancel"]',
      );
      if (!backBtn || !cancelBtn) {
        throw new Error(
          `Expected Back and Cancel while installing (stage=${page.viewStage()}, back=${Boolean(backBtn)}, cancel=${Boolean(cancelBtn)}, rootHtml=${root.innerHTML.slice(0, 500)})`,
        );
      }
      expect(cancelBtn.closest('[inert]')).toBeNull();
      expect(backBtn.closest('[inert]')).toBeNull();
      expect(document.activeElement).toBe(cancelBtn);

      // Keyboard activation (Enter on focused Cancel) cancels the pending install.
      cancelBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      cancelBtn.click();
      // Let the async handlers settle before checking each rendered state.
      await fixture.whenStable();
      fixture.detectChanges();
      TestBed.tick();
      finishInstall({
        isSuccess: () => true,
        data: { success: true, installed: [], workspacePath: '/ws' },
      });
      await fixture.whenStable();
      fixture.detectChanges();
      TestBed.tick();

      expect(runRecords()[0]?.status).toBe('cancelled');
      expect(page.viewStage()).toBe('intent');
    } finally {
      fixture.destroy();
    }
  });

  it('shows Conversation opened with Open conversation while the tab exists, and closed text once closed (D3)', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    const page = fixture.componentInstance;
    page.state.setIntent('Build a team');
    await page.launchChat();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(page.launched()).toBe(true);
    expect(page.viewStage()).toBe('handed-off');
    expect(root.textContent).toContain('Conversation opened');
    const openBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="team-builder-open-conversation"]',
    );
    expect(openBtn?.textContent?.trim()).toBe('Open conversation');

    openBtn?.click();
    expect(switchTab).toHaveBeenCalledWith('tab-team');
    expect(requestCanvasTab).toHaveBeenCalledWith(
      'tab-team',
      '/ws',
      'AI Team Builder',
      true,
    );
    expect(setCurrentView).toHaveBeenCalledWith('chat');

    openTabs.set([]);
    fixture.detectChanges();
    expect(
      root.querySelector('[data-testid="team-builder-open-conversation"]'),
    ).toBeNull();
    expect(root.textContent).toContain('The conversation was closed');

    await page.back();
    expect(navigate).toHaveBeenCalledWith(['/onboarding']);
  });

  it('requires an owner decision for weak-practice facts on Continue and Skip', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setIntent('Build a team');
    await page.submit(submitEvent());
    page.state.setGuidanceFacts([
      { category: 'test', label: 'tolerate', fact: 'Old tests' },
    ]);
    page.state.setSelectedIds(new Set(['owner/skill']));
    await page.reviewSelection();
    expect(page.ownerDecisionError()).toBe(true);
    expect(call).not.toHaveBeenCalledWith(
      'wizard:preview-skills-for-consent',
      expect.anything(),
    );
    await page.launchChat();
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
    page.state.setOwnerDecision('raise');
    await page.launchChat();
    expect(call).toHaveBeenCalledWith(
      'wizard:get-project-guidance',
      expect.objectContaining({ ownerDecision: 'raise' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(sendOrQueueMessage.mock.calls[0][0]).toContain(
      'Owner decision: Raise the standard',
    );
  });

  it('keeps Skip locked during loading and launches after record failure', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setIntent('Build a team');
    page.state.setLoading(true);
    await page.launchChat();
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
    page.state.setLoading(false);
    page.state.setOwnerDecision('match');
    call.mockImplementation(async (method: string) =>
      method === 'wizard:get-project-guidance'
        ? { isSuccess: () => false }
        : method === 'harness:workflow-prompt'
          ? { isSuccess: () => true, data: { prompt: 'PREAMBLE' } }
          : { isSuccess: () => true, data: { skills: [] } },
    );
    await page.launchChat();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
    expect(page.guidanceNote()).toBe('Guidance record was not written.');
  });

  it('starts the chat from Continue when no skill is selected', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setIntent('Build a team');
    await page.reviewSelection();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalledWith(
      'wizard:preview-skills-for-consent',
      expect.anything(),
    );
  });

  it('shows limited guidance without a saved analysis and returns to intent on Back', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setIntent('Build a team');
    await page.submit(submitEvent());
    expect(page.state.guidanceNote()).toBe(
      'No stored project analysis. Guidance is limited.',
    );
    page.backToIntent();
    expect(page.state.stage()).toBe('intent');
  });

  it('requires an intent, launches a chat session with attachments, and clears sent attachments', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    await page.submit(submitEvent());
    expect(sendOrQueueMessage).not.toHaveBeenCalled();

    page.state.setIntent('  A research team  ');
    page.attachments.addFile(attachment('/ws/team.md'));
    await page.submit(submitEvent());
    expect(page.state.stage()).toBe('review');
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
    await page.launchChat();

    expect(sendOrQueueMessage).toHaveBeenCalledWith('A research team', {
      files: ['/ws/team.md'],
      images: undefined,
      tabId: 'tab-team',
      workspacePath: '/ws',
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(page.attachments.files()).toHaveLength(0);
    expect(page.launched()).toBe(true);
    expect(page.starting()).toBe(false);
    expect(page.actionError()).toBeNull();
    expect(page.viewStage()).toBe('handed-off');
    await page.launchChat();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
  });

  it('shows a readable error, re-enables the button, and preserves attachments when launch fails', async () => {
    sendOrQueueMessage.mockRejectedValueOnce(
      new Error('Could not send the first message. Try again.'),
    );
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    page.state.setIntent('A research team');
    page.attachments.addFile(attachment('/ws/team.md'));
    await page.submit(submitEvent());
    await page.launchChat();

    expect(page.actionError()).toBe(
      'Could not start the team builder. Try again.',
    );
    expect(page.starting()).toBe(false);
    expect(page.attachments.files()).toHaveLength(1);
  });

  it('cancels a pending launch on explicit Cancel and marks the record cancelled without an error', async () => {
    let promptSignal: AbortSignal | undefined;
    let settlePrompt!: (value: { isSuccess: () => boolean }) => void;
    call.mockImplementation((method: string, _params: unknown, opts?: { signal?: AbortSignal }) => {
      if (method === 'harness:workflow-prompt') {
        promptSignal = opts?.signal;
        return new Promise((resolve) => {
          settlePrompt = resolve;
        });
      }
      return Promise.resolve({
        isSuccess: () => true,
        data:
          method === 'wizard:list-analyses'
            ? { analyses: [] }
            : method === 'wizard:get-project-guidance'
              ? { facts: [], ownerDecisionPrompt: '' }
              : { skills: [] },
      });
    });
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    page.state.setIntent('A research team');
    page.attachments.addFile(attachment('/ws/team.md'));
    await page.submit(submitEvent());
    const pending = page.launchChat();
    await page.cancelRun();
    settlePrompt({ isSuccess: () => false });
    await pending;

    expect(promptSignal?.aborted).toBe(true);
    expect(page.actionError()).toBeNull();
    expect(page.starting()).toBe(false);
    expect(page.viewStage()).toBe('intent');
    expect(page.attachments.files()).toHaveLength(1);
    expect(runRecords()[0]).toMatchObject({
      status: 'cancelled',
      step: 'intent',
    });
  });

  it('keeps installing and launching in the background without stealing focus when the page is destroyed or Back is clicked', async () => {
    let finishInstall!: (value: {
      isSuccess: () => boolean;
      data: WizardInstallSkillsWithConsentResponse;
    }) => void;
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInstall = resolve;
        }),
    );

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.setIntent('Build a background team');
    page.state.setPreview([
      {
        skillName: 'owner/repo/one',
        files: [],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'hash',
      },
    ]);
    page.state.setStage('consent');

    const pending = page.install();
    await page.back();
    expect(navigate).toHaveBeenCalledWith(['/onboarding']);

    fixture.destroy();

    finishInstall({
      isSuccess: () => true,
      data: { success: true, installed: ['owner/repo/one'], workspacePath: '/ws' },
    });
    await pending;

    expect(createTab).toHaveBeenCalledWith('AI Team Builder', undefined, false);
    expect(setCurrentView).not.toHaveBeenCalled();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
    expect(runRecords()[0]).toMatchObject({
      status: 'completed',
      step: 'handed-off',
      handoffTabId: 'tab-team',
      teamBuilder: {
        intent: 'Build a background team',
        installed: ['owner/repo/one'],
      },
    });
  });

  it('interrupts a detached installing run on workspace switch A -> B -> A and remounts A in interrupted recovery', async () => {
    let finishInstall!: (value: {
      isSuccess: () => boolean;
      data: WizardInstallSkillsWithConsentResponse;
    }) => void;
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInstall = resolve;
        }),
    );

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.setIntent('Workspace A team');
    page.state.setPreview([
      {
        skillName: 'owner/repo/one',
        files: [],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'hash',
      },
    ]);
    page.state.setStage('consent');

    const pending = page.install();
    fixture.destroy();

    workspaceRoot.set('/ws-b');
    TestBed.tick();
    expect(runRecords()[0]?.status).toBe('interrupted');

    workspaceRoot.set('/ws');
    TestBed.tick();
    finishInstall({
      isSuccess: () => true,
      data: { success: true, installed: [], workspacePath: '/ws' },
    });
    await pending;

    const remount = TestBed.createComponent(TeamBuilderStartPage);
    remount.componentRef.setInput('tab', runRecords()[0].id);
    remount.detectChanges();
    expect(remount.componentInstance.interrupted()).toBe(true);
    expect(remount.componentInstance.starting()).toBe(false);
    expect(
      (remount.nativeElement as HTMLElement).querySelector(
        '[data-testid="team-builder-interrupted"]',
      ),
    ).not.toBeNull();
    remount.destroy();
  });

  it('gives the workspace live run precedence over a historical failed URL id and blocks a second run', async () => {
    runRecords.set([
      {
        id: 'setup-tb-live',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'running',
        step: 'installing',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: { intent: 'Live team', installed: [] },
        unseen: false,
        createdAt: 2000,
        updatedAt: 2000,
      },
      {
        id: 'setup-tb-old-failed',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: { intent: 'Old team', installed: [] },
        error: 'Old failure',
        unseen: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-old-failed');
    fixture.detectChanges();

    expect(fixture.componentInstance.activeRecord()?.id).toBe('setup-tb-live');
    expect(fixture.componentInstance.viewStage()).toBe('installing');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { tab: 'setup-tb-live' },
        replaceUrl: true,
      }),
    );

    await fixture.componentInstance.launchChat();
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
    expect(
      runRecords().find((r) => r.id === 'setup-tb-old-failed')?.status,
    ).toBe('failed');
    fixture.destroy();
  });

  it('replaces a cancelled-run URL id when resubmitting and drives subsequent launch on the new id', async () => {
    runRecords.set([
      {
        id: 'setup-tb-cancelled',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'cancelled',
        step: 'intent',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: { intent: 'Old cancelled', installed: [] },
        unseen: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-cancelled');
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.state.setIntent('Fresh team intent');
    await page.submit(submitEvent());
    fixture.detectChanges();

    const active = page.activeRecord();
    expect(active?.id).not.toBe('setup-tb-cancelled');
    expect(active?.id).toBe('setup-tb-1');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { tab: 'setup-tb-1' },
        replaceUrl: true,
      }),
    );

    await page.launchChat();
    expect(
      runRecords().find((r) => r.id === 'setup-tb-cancelled')?.status,
    ).toBe('cancelled');
    expect(runRecords().find((r) => r.id === 'setup-tb-1')).toMatchObject({
      status: 'completed',
      step: 'handed-off',
      handoffTabId: 'tab-team',
    });
    fixture.destroy();
  });

  it('re-enters a failed post-install run using the explicit installCompleted checkpoint and retains guidance and attachments across teardown', async () => {
    const first = TestBed.createComponent(TeamBuilderStartPage);
    first.detectChanges();
    const page1 = first.componentInstance;
    page1.state.setIntent('Build a resilient team');
    page1.attachments.addFile(attachment('/ws/spec.md'));
    await page1.submit(submitEvent());
    page1.state.setGuidanceFacts([
      { category: 'test', label: 'tolerate', fact: 'Legacy tests' },
    ]);
    page1.onOwnerDecisionChange('raise');
    page1.state.setPreview([
      {
        skillName: 'owner/repo/one',
        files: [],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'hash',
      },
    ]);
    page1.state.setStage('consent');

    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { success: true, installed: ['owner/repo/one'], workspacePath: '/ws' },
    });
    sendOrQueueMessage.mockRejectedValueOnce(new Error('send failed'));
    await page1.install();
    const recordId = page1.activeRecord()?.id ?? '';
    // Mutate error text to prove checkpoint does NOT depend on display copy.
    setupRuns.report(recordId, { error: 'Custom launch error copy.' });
    first.destroy();

    const second = TestBed.createComponent(TeamBuilderStartPage);
    second.componentRef.setInput('tab', recordId);
    second.detectChanges();
    const page2 = second.componentInstance;

    expect(page2.intent()).toBe('Build a resilient team');
    expect(page2.skillsInstalled()).toBe(true);
    expect(page2.state.ownerDecision()).toBe('raise');
    expect(page2.attachments.files().map((f) => f.path)).toEqual([
      '/ws/spec.md',
    ]);

    const installCallsBefore = call.mock.calls.filter(
      ([method]) => method === 'wizard:install-skills-with-consent',
    ).length;
    await page2.launchChat();

    expect(
      call.mock.calls.filter(
        ([method]) => method === 'wizard:install-skills-with-consent',
      ),
    ).toHaveLength(installCallsBefore);
    expect(sendOrQueueMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('Owner decision: Raise the standard'),
      expect.objectContaining({ files: ['/ws/spec.md'] }),
    );
    second.destroy();
  });

  it('warns before sending when reload drops attachments on a failed post-install run', async () => {
    runRecords.set([
      {
        id: 'setup-tb-reload',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Build a team with spec',
          installed: ['owner/repo/one'],
          ownerDecision: 'match',
          installCompleted: true,
          hadAttachments: true,
        },
        error: 'Could not start chat.',
        unseen: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-reload');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.skillsInstalled()).toBe(true);
    expect(fixture.componentInstance.missingAttachments()).toBe(true);
    expect(
      root.querySelector('[data-testid="team-builder-attachments-unavailable"]'),
    ).not.toBeNull();

    // Direct launch is blocked until the user acknowledges missing attachments.
    await fixture.componentInstance.launchChat();
    expect(sendOrQueueMessage).not.toHaveBeenCalled();

    const continueWithout = root.querySelector<HTMLButtonElement>(
      '[data-testid="team-builder-continue-without-attachments"]',
    );
    continueWithout?.click();
    await fixture.whenStable();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('restores selected skills and re-previews for consent on consent re-entry, requiring refreshed script approval', async () => {
    call.mockImplementation(async (method: string) => {
      if (method === 'wizard:preview-skills-for-consent') {
        return {
          isSuccess: () => true,
          data: {
            skills: [
              {
                skillName: 'owner/repo/scripted',
                files: ['run.sh'],
                scriptFiles: ['run.sh'],
                hasScripts: true,
                contentHash: 'hash-fresh',
              },
            ],
          },
        };
      }
      return {
        isSuccess: () => true,
        data:
          method === 'wizard:list-analyses'
            ? { analyses: [] }
            : method === 'wizard:get-project-guidance'
              ? { facts: [], ownerDecisionPrompt: '' }
              : { skills: [] },
      };
    });

    runRecords.set([
      {
        id: 'setup-tb-consent',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'needs-input',
        step: 'consent',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Build scripted team',
          installed: [],
          selectedIds: ['owner/repo/scripted'],
          ownerDecision: 'raise',
        },
        unseen: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-consent');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.componentInstance;
    expect(page.state.selectedIds()).toEqual(new Set(['owner/repo/scripted']));
    expect(page.state.ownerDecision()).toBe('raise');
    expect(call).toHaveBeenCalledWith('wizard:preview-skills-for-consent', {
      skills: ['owner/repo/scripted'],
    });
    expect(page.viewStage()).toBe('consent');
    expect(page.state.approvedIds().size).toBe(0);
    fixture.destroy();
  });

  it('loads recommendations without wiping restored selection on failed-review hydration', async () => {
    runRecords.set([
      {
        id: 'setup-tb-failed-review',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Retry review',
          installed: [],
          selectedIds: ['owner/repo/kept'],
          ownerDecision: 'match',
        },
        error: 'Could not install skills.',
        unseen: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-failed-review');
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance;
    expect(call).toHaveBeenCalledWith(
      'wizard:recommend-skills',
      expect.anything(),
    );
    expect(page.state.selectedIds()).toEqual(new Set(['owner/repo/kept']));
    expect(page.state.ownerDecision()).toBe('match');
    expect(page.actionError()).toBe('Could not install skills.');
    fixture.destroy();
  });

  it('re-checks skills and re-previews recorded selection on Continue for an interrupted team-builder run', async () => {
    call.mockImplementation(async (method: string) => {
      if (method === 'wizard:preview-skills-for-consent') {
        return {
          isSuccess: () => true,
          data: {
            skills: [
              {
                skillName: 'owner/repo/resume',
                files: ['install.sh'],
                scriptFiles: ['install.sh'],
                hasScripts: true,
                contentHash: 'hash-r',
              },
            ],
          },
        };
      }
      return {
        isSuccess: () => true,
        data:
          method === 'wizard:list-analyses'
            ? { analyses: [] }
            : method === 'wizard:get-project-guidance'
              ? { facts: [], ownerDecisionPrompt: '' }
              : { skills: [] },
      };
    });
    runRecords.set([
      {
        id: 'setup-tb-interrupted',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'interrupted',
        step: 'installing',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Resume my team',
          installed: [],
          selectedIds: ['owner/repo/resume'],
        },
        unseen: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-interrupted');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const continueBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="team-builder-continue-interrupted"]',
    );
    expect(continueBtn?.textContent?.trim()).toBe('Continue');
    continueBtn?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setupRuns.retry).toHaveBeenCalledWith('setup-tb-interrupted');
    expect(call).toHaveBeenCalledWith(
      'wizard:recommend-skills',
      expect.anything(),
    );
    expect(call).toHaveBeenCalledWith('wizard:preview-skills-for-consent', {
      skills: ['owner/repo/resume'],
    });
    expect(fixture.componentInstance.viewStage()).toBe('consent');
    expect(fixture.componentInstance.state.approvedIds().size).toBe(0);
    fixture.destroy();
  });

  it('does not swallow TabManagerService construction errors via an optional DI catch', () => {
    TestBed.overrideProvider(TabManagerService, {
      useFactory: () => {
        throw new Error('tab manager init boom');
      },
    });
    expect(() => TestBed.createComponent(TeamBuilderStartPage)).toThrow(
      'tab manager init boom',
    );
  });

  it('preserves attachments added while team start is pending', async () => {
    let markSendStarted!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    let finish!: () => void;
    sendOrQueueMessage.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          finish = () => resolve({ success: true });
          markSendStarted();
        }),
    );
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    page.state.setIntent('A research team');
    page.attachments.addFile(attachment('/ws/first.md'));
    page.attachments.pendingReads.set(1);
    await page.submit(submitEvent());
    expect(sendOrQueueMessage).not.toHaveBeenCalled();

    page.attachments.pendingReads.set(0);
    await page.submit(submitEvent());
    const pending = page.launchChat();
    await sendStarted;
    page.attachments.addFile(attachment('/ws/later.md'));
    finish();
    await pending;

    expect(sendOrQueueMessage).toHaveBeenCalledWith(
      'A research team',
      expect.objectContaining({ files: ['/ws/first.md'], images: undefined }),
    );
    expect(page.attachments.files().map((file) => file.path)).toEqual([
      '/ws/later.md',
    ]);
  });

  it('renders without stepper, Load saved draft button, or leave dialog', () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('ptah-onboarding-stepper')).toBeNull();
    expect(
      element.querySelector('ptah-harness-builder-leave-dialog'),
    ).toBeNull();
    expect(element.textContent).not.toContain('Load saved draft');
    fixture.destroy();
  });

  it('names the failed skill and retains installed names without launching chat', async () => {
    call.mockImplementation(async (method: string) => ({
      isSuccess: () => true,
      data:
        method === 'wizard:install-skills-with-consent'
          ? {
              success: false,
              installed: ['first'],
              workspacePath: '/ws',
              failedSkill: '<broken>',
              reason: 'Copy failed.',
            }
          : { skills: [] },
    }));
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setPreview([
      {
        skillName: '<broken>',
        contentHash: 'hash',
        hasScripts: false,
        scriptFiles: [],
        files: [],
      },
    ]);
    await page.install();
    expect(page.state.stage()).toBe('review');
    expect(page.state.installed()).toEqual(['first']);
    expect(page.actionError()).toContain(
      'Failed: <broken>. Copy failed. Installed: first.',
    );
    expect(sendOrQueueMessage).not.toHaveBeenCalled();
  });

  it('clears workspace data before a new load resolves', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.setRecommendations([
      {
        skill: {
          source: 'old',
          skillId: 'skill',
          name: 'Old',
          description: '',
          installs: 0,
          isInstalled: false,
        },
        evidence: '',
        score: 1,
      },
    ]);
    page.state.setSearchResults([
      {
        source: 'old',
        skillId: 'skill',
        name: 'Old',
        description: '',
        installs: 0,
        isInstalled: false,
      },
    ]);
    page.state.setGuidanceFacts([
      { category: 'old', label: 'follow', fact: 'Old' },
    ]);
    page.state.setInstalled(['old']);
    workspaceRoot.set('/next');
    fixture.detectChanges();
    expect(page.state.recommendations()).toEqual([]);
    expect(page.state.searchResults()).toEqual([]);
    expect(page.state.guidanceFacts()).toEqual([]);
    expect(page.state.installed()).toEqual([]);
    fixture.destroy();
  });

  it('clears old guidance facts when guidance fails', async () => {
    call.mockImplementation(async (method: string) =>
      method === 'wizard:get-project-guidance'
        ? { isSuccess: () => false, error: 'private details' }
        : { isSuccess: () => true, data: { skills: [] } },
    );
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setGuidanceFacts([
      { category: 'old', label: 'follow', fact: 'Old' },
    ]);
    page.state.setSelectedIds(new Set(['old']));
    page.state.setOwnerDecision('raise');
    await page.loadReview();
    expect(page.state.guidanceFacts()).toEqual([]);
    expect(page.state.selectedIds().size).toBe(0);
    expect(page.state.ownerDecision()).toBeNull();
  });

  it('uses fixed text for a non-user-facing RPC failure', async () => {
    call.mockResolvedValue({ isSuccess: () => false, error: 'secret path' });
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    await page.loadReview();
    expect(page.actionError()).toBe('Could not load skill recommendations.');
  });

  it('keeps install state when the consent dialog requests closure', async () => {
    let finish!: (value: {
      isSuccess: () => boolean;
      data: WizardInstallSkillsWithConsentResponse;
    }) => void;
    call.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setPreview([
      {
        skillName: 'skill',
        contentHash: 'hash',
        hasScripts: false,
        scriptFiles: [],
        files: [],
      },
    ]);
    const pending = page.install();
    page.closeConsent();
    expect(page.state.stage()).toBe('installing');
    await page.install();
    expect(call).toHaveBeenCalledTimes(1);
    finish({ isSuccess: () => true, data: { success: false, installed: [], workspacePath: '/ws' } });
    await pending;
  });

  it('keeps the review grid while previewing and clears previewing when returning to intent', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.setStage('review');
    page.state.setRecommendations([
      {
        skill: {
          source: 'owner/repo',
          skillId: 'one',
          name: 'One skill',
          description: 'Patterns',
          installs: 1,
          isInstalled: false,
        },
        evidence: 'Angular',
        score: 1,
      },
    ]);
    page.state.setSelectedIds(new Set(['owner/repo/one']));
    let finish: () => void = () => {
      throw new Error('Preview not started');
    };
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              isSuccess: () => true,
              data: {
                skills: [
                  {
                    skillName: 'owner/repo/one',
                    files: [],
                    scriptFiles: [],
                    hasScripts: false,
                    contentHash: 'abc',
                  },
                ],
              },
            });
        }),
    );
    const pending = page.reviewSelection();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(page.state.previewing()).toBe(true);
    expect(page.state.loading()).toBe(false);
    expect(root.querySelectorAll('ptah-skill-pick-card')).toHaveLength(1);
    expect(
      root.querySelector('[data-testid="skill-install-primary"]')?.textContent,
    ).toContain('Preparing install\u2026');
    page.backToIntent();
    expect(page.state.previewing()).toBe(false);
    finish();
    await pending;
    expect(page.state.stage()).toBe('intent');
  });

  it('renders launching chat as one clean status string', () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentInstance.state.setStage('launching');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[role="status"]')
        ?.textContent?.trim(),
    ).toBe('Launching chat…');
  });

  it.each(['response', 'throw'])(
    'ignores stale guidance %s failures after a workspace switch',
    async (failure) => {
      const fixture = TestBed.createComponent(TeamBuilderStartPage);
      fixture.detectChanges();
      const page = fixture.componentInstance;
      page.state.setOwnerDecision('match');
      let finish: () => void = () => {
        throw new Error('guidance not started');
      };
      call.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = () =>
              failure === 'throw'
                ? reject(new Error('offline'))
                : resolve({ isSuccess: () => false });
          }),
      );
      const pending = page.launchChat();
      workspaceRoot.set('/next');
      fixture.detectChanges();
      finish();
      await pending;
      expect(page.state.guidanceNote()).toBe('');
      expect(page.state.error()).toBeNull();
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
      expect(runRecords()[0]?.status).toBe('interrupted');
    },
  );

  it('ignores launcher failures from an aborted workspace and marks the old record interrupted', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.setIntent('Build a team');
    let fail: () => void = () => {
      throw new Error('launch not started');
    };
    call.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new Error('offline'));
        }),
    );
    const pending = page.launchChat();
    workspaceRoot.set('/next');
    fixture.detectChanges();
    fail();
    await pending;
    expect(page.state.error()).toBeNull();
    expect(page.state.stage()).toBe('intent');
    expect(runRecords()[0]?.status).toBe('interrupted');
  });

  it('interrupts a Team Builder execution outside the workspace effect', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const coordinator = TestBed.inject(TeamBuilderRunCoordinator);
    const realAbort = coordinator.abortWorkspace.bind(coordinator);
    const abort = jest
      .spyOn(coordinator, 'abortWorkspace')
      .mockImplementation((root) => {
        assertNotInReactiveContext(coordinator.abortWorkspace);
        realAbort(root);
      });
    let finish: (result: unknown) => void = () => {
      throw new Error('launch not started');
    };
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const page = fixture.componentInstance;
    page.state.setIntent('Build a team');
    const pending = page.launchChat();
    expect(runRecords()[0]?.status).toBe('running');

    workspaceRoot.set('/next');
    fixture.detectChanges();
    finish({ isSuccess: () => false });
    await pending;

    expect(abort).toHaveBeenCalledWith('/ws');
    expect(runRecords()[0]?.status).toBe('interrupted');
  });

  it('focuses installed recovery after launch failure and retry failure', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.state.setPreview([
      {
        skillName: 'owner/repo/skill',
        files: [],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'hash',
      },
    ]);
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { success: true, installed: ['owner/repo/skill'], workspacePath: '/ws' },
    });
    sendOrQueueMessage.mockRejectedValue(new Error('offline'));
    await page.install();
    fixture.detectChanges();
    TestBed.tick();
    const root = fixture.nativeElement as HTMLElement;
    const button = [...root.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Continue to team builder'),
    );
    expect(button).toBeDefined();
    expect(document.activeElement).toBe(button);
    await page.launchChat();
    fixture.detectChanges();
    TestBed.tick();
    expect(document.activeElement?.textContent).toContain(
      'Continue to team builder',
    );
  });

  it('preserves installCompleted, selection, ownerDecision and hadAttachments across repeated reloads when records carry only SetupRunStore.report fields', async () => {
    const first = TestBed.createComponent(TeamBuilderStartPage);
    first.detectChanges();
    const page1 = first.componentInstance;
    page1.state.setIntent('Build a resilient team');
    page1.attachments.addFile(attachment('/ws/spec.md'));
    await page1.submit(submitEvent());
    page1.state.setGuidanceFacts([
      { category: 'test', label: 'tolerate', fact: 'Legacy tests' },
    ]);
    page1.onSelectionToggled('owner/repo/one');
    page1.onOwnerDecisionChange('raise');
    page1.state.setPreview([
      {
        skillName: 'owner/repo/one',
        files: [],
        scriptFiles: [],
        hasScripts: false,
        contentHash: 'hash',
      },
    ]);
    page1.state.setStage('consent');

    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { success: true, installed: ['owner/repo/one'], workspacePath: '/ws' },
    });
    sendOrQueueMessage.mockRejectedValueOnce(new Error('send failed'));
    await page1.install();
    const fullRecord = page1.activeRecord();
    expect(fullRecord).not.toBeNull();
    // Strip record.teamBuilder to ONLY what SetupRunStore.report writes.
    const reportOnlyRecord: SetupRunRecord = {
      ...(fullRecord as SetupRunRecord),
      teamBuilder: {
        intent: fullRecord?.teamBuilder?.intent ?? '',
        installed: [...(fullRecord?.teamBuilder?.installed ?? [])],
      },
    };
    const persistedSidecar = localStorage.getItem(
      'ptah.team-builder-recovery.v1',
    );
    expect(persistedSidecar).not.toBeNull();
    first.destroy();

    const rebootWithStrippedRecord = (
      rpcImpl: jest.Mock,
    ): void => {
      TestBed.resetTestingModule();
      runRecords.set([reportOnlyRecord]);
      TestBed.configureTestingModule({
        providers: [
          TeamBuilderRunCoordinator,
          { provide: SetupRunStore, useValue: setupRuns },
          {
            provide: HarnessChatLauncherService,
            useValue: { workspaceRoot, launchTeamBuilder: jest.fn() },
          },
          {
            provide: TabManagerService,
            useValue: {
              tabs: openTabs.asReadonly(),
              backgroundTabsRevision: signal(0),
              findTabByIdAcrossWorkspaces: jest.fn((tabId: string) =>
                openTabs().some((t) => t.id === tabId)
                  ? { tab: { id: tabId } }
                  : null,
              ),
              switchTab,
              createTab,
              setWorkflow,
              setFirstMessagePreamble,
              closeTab,
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
            useValue: { debug: jest.fn(), error: jest.fn() },
          },
          {
            provide: OnboardingWorkspaceStore,
            useValue: {
              isElectron: false,
              active: signal(null),
              activePath: signal('/ws'),
              folders: signal([]),
              activeIndex: signal(-1),
              openFolder: jest.fn(),
            },
          },
          { provide: Router, useValue: { navigate } },
          { provide: ClaudeRpcService, useValue: { call: rpcImpl } },
          {
            provide: FilePickerService,
            useValue: { isFileSupported: () => true },
          },
        ],
      });
    };

    // Reload 1: mount and leave BEFORE the review RPC settles.
    const deferredListRpc = jest.fn(
      (method: string) =>
        method === 'wizard:list-analyses'
          ? new Promise(() => undefined)
          : Promise.resolve({ isSuccess: () => true, data: {} }),
    );
    rebootWithStrippedRecord(deferredListRpc);
    const reload1 = TestBed.createComponent(TeamBuilderStartPage);
    reload1.componentRef.setInput('tab', reportOnlyRecord.id);
    reload1.detectChanges();
    expect(reload1.componentInstance.skillsInstalled()).toBe(true);
    expect(reload1.componentInstance.missingAttachments()).toBe(true);
    expect(reload1.componentInstance.state.selectedIds()).toEqual(
      new Set(['owner/repo/one']),
    );
    expect(reload1.componentInstance.state.ownerDecision()).toBe('raise');
    reload1.destroy();

    // Reload 2: mount, let review RPC settle (calling persistDraftFor), then leave.
    const settledRpc = jest.fn(async (method: string) => ({
      isSuccess: () => true,
      data:
        method === 'wizard:list-analyses'
          ? { analyses: [] }
          : method === 'wizard:get-project-guidance'
            ? {
                facts: [
                  { category: 'test', label: 'tolerate', fact: 'Legacy tests' },
                ],
                ownerDecisionPrompt: 'Match or raise?',
              }
            : method === 'harness:workflow-prompt'
              ? { prompt: 'CONFIGURE_PREAMBLE' }
              : { skills: [] },
    }));
    rebootWithStrippedRecord(settledRpc);
    const reload2 = TestBed.createComponent(TeamBuilderStartPage);
    reload2.componentRef.setInput('tab', reportOnlyRecord.id);
    reload2.detectChanges();
    await reload2.whenStable();
    reload2.detectChanges();
    expect(reload2.componentInstance.skillsInstalled()).toBe(true);
    expect(reload2.componentInstance.missingAttachments()).toBe(true);
    expect(reload2.componentInstance.state.selectedIds()).toEqual(
      new Set(['owner/repo/one']),
    );
    expect(reload2.componentInstance.state.ownerDecision()).toBe('raise');
    const sharedCoordinator = TestBed.inject(TeamBuilderRunCoordinator);
    const draftAfterRefresh = sharedCoordinator.draftFor(reportOnlyRecord.id);
    expect(draftAfterRefresh).not.toBeNull();
    expect(draftAfterRefresh?.hadAttachments).toBe(true);
    expect(draftAfterRefresh?.attachmentFiles).toEqual([]);
    expect(draftAfterRefresh?.attachmentImages).toEqual([]);
    reload2.destroy();

    // Same-renderer remount: reuse the exact same root coordinator after the
    // review refresh created an in-memory draft with empty attachment arrays.
    // Chat must stay blocked until reattachment or explicit opt-out.
    const sendsBeforeRemount = sendOrQueueMessage.mock.calls.length;
    const remountSameCoordinator = TestBed.createComponent(TeamBuilderStartPage);
    remountSameCoordinator.componentRef.setInput('tab', reportOnlyRecord.id);
    remountSameCoordinator.detectChanges();
    await remountSameCoordinator.whenStable();
    remountSameCoordinator.detectChanges();

    const remountRoot = remountSameCoordinator.nativeElement as HTMLElement;
    expect(remountSameCoordinator.componentInstance.skillsInstalled()).toBe(
      true,
    );
    expect(remountSameCoordinator.componentInstance.missingAttachments()).toBe(
      true,
    );
    expect(
      remountRoot.querySelector(
        '[data-testid="team-builder-attachments-unavailable"]',
      ),
    ).not.toBeNull();
    await remountSameCoordinator.componentInstance.launchChat();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(sendsBeforeRemount);
    remountSameCoordinator.destroy();

    // Reattachment on a same-renderer remount clears the warning and allows
    // launching with the newly attached payload.
    const remountReattach = TestBed.createComponent(TeamBuilderStartPage);
    remountReattach.componentRef.setInput('tab', reportOnlyRecord.id);
    remountReattach.detectChanges();
    expect(remountReattach.componentInstance.missingAttachments()).toBe(true);
    remountReattach.componentInstance.attachments.addFile(
      attachment('/ws/reattached.md'),
    );
    remountReattach.detectChanges();
    expect(remountReattach.componentInstance.missingAttachments()).toBe(false);
    // Destroy without launching, then restore original empty-payload draft
    // state for Reload 3's explicit opt-out assertion by using a fresh reload
    // below after verifying reattachment persisted into the shared draft.
    const draftAfterReattach = sharedCoordinator.draftFor(reportOnlyRecord.id);
    expect(draftAfterReattach?.attachmentFiles).toHaveLength(1);
    remountReattach.destroy();

    const remountWithReattachedPayload =
      TestBed.createComponent(TeamBuilderStartPage);
    remountWithReattachedPayload.componentRef.setInput(
      'tab',
      reportOnlyRecord.id,
    );
    remountWithReattachedPayload.detectChanges();
    expect(
      remountWithReattachedPayload.componentInstance.missingAttachments(),
    ).toBe(false);
    expect(
      remountWithReattachedPayload.componentInstance.attachments.files(),
    ).toHaveLength(1);
    remountWithReattachedPayload.destroy();

    // Reload 3: fresh coordinator from actual localStorage still offers chat retry, not install,
    // and blocks until explicit opt-out ("Continue without attachments").
    rebootWithStrippedRecord(settledRpc);
    const reload3 = TestBed.createComponent(TeamBuilderStartPage);
    reload3.componentRef.setInput('tab', reportOnlyRecord.id);
    reload3.detectChanges();
    await reload3.whenStable();
    reload3.detectChanges();

    const root3 = reload3.nativeElement as HTMLElement;
    expect(reload3.componentInstance.skillsInstalled()).toBe(true);
    expect(reload3.componentInstance.missingAttachments()).toBe(true);
    expect(reload3.componentInstance.state.selectedIds()).toEqual(
      new Set(['owner/repo/one']),
    );
    expect(reload3.componentInstance.state.ownerDecision()).toBe('raise');
    expect(root3.textContent).toContain('Continue to team builder');
    await reload3.componentInstance.launchChat();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(sendsBeforeRemount);

    // Explicit opt-out persists across same-renderer remount and fresh reload.
    sendOrQueueMessage.mockRejectedValueOnce(new Error('retry failed'));
    const continueWithout = root3.querySelector<HTMLButtonElement>(
      '[data-testid="team-builder-continue-without-attachments"]',
    );
    continueWithout?.click();
    await reload3.whenStable();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(sendsBeforeRemount + 1);
    reload3.destroy();

    const reload3Remount = TestBed.createComponent(TeamBuilderStartPage);
    reload3Remount.componentRef.setInput('tab', reportOnlyRecord.id);
    reload3Remount.detectChanges();
    await reload3Remount.whenStable();
    expect(reload3Remount.componentInstance.missingAttachments()).toBe(false);
    reload3Remount.destroy();

    // Fresh reload after explicit opt-out keeps the opt-out persisted and allows direct launch.
    rebootWithStrippedRecord(settledRpc);
    const reload4 = TestBed.createComponent(TeamBuilderStartPage);
    reload4.componentRef.setInput('tab', reportOnlyRecord.id);
    reload4.detectChanges();
    await reload4.whenStable();
    reload4.detectChanges();
    expect(reload4.componentInstance.skillsInstalled()).toBe(true);
    expect(reload4.componentInstance.missingAttachments()).toBe(false);
    await reload4.componentInstance.launchChat();

    expect(
      settledRpc.mock.calls.filter(
        ([method]) => method === 'wizard:install-skills-with-consent',
      ),
    ).toHaveLength(0);
    expect(sendOrQueueMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('Owner decision: Raise the standard'),
      expect.objectContaining({ files: undefined }),
    );
    reload4.destroy();
  });

  it('resets and hydrates all record-owned fields atomically when switching between two failed records on a mounted page', async () => {
    const coordinator = TestBed.inject(TeamBuilderRunCoordinator);
    runRecords.set([
      {
        id: 'setup-tb-a',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Build Team A',
          installed: ['owner/repo/skill-a'],
        },
        error: 'Launch A failed.',
        unseen: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'setup-tb-b',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Build Team B',
          installed: ['owner/repo/skill-b'],
        },
        error: 'Launch B failed.',
        unseen: true,
        createdAt: 2000,
        updatedAt: 2000,
      },
    ]);
    coordinator.saveDraft('setup-tb-a', {
      workspacePath: '/ws',
      intent: 'Build Team A',
      selectedIds: ['owner/repo/skill-a'],
      ownerDecision: 'raise',
      guidanceFacts: [{ category: 'test', label: 'tolerate', fact: 'Fact A' }],
      guidanceLoaded: true,
      ownerDecisionPrompt: 'Prompt A',
      guidanceNote: 'Note A',
      attachmentFiles: [attachment('/ws/file-a.md')],
      attachmentImages: [],
      hadAttachments: true,
      installCompleted: true,
    });
    coordinator.saveDraft('setup-tb-b', {
      workspacePath: '/ws',
      intent: 'Build Team B',
      selectedIds: ['owner/repo/skill-b'],
      ownerDecision: null,
      guidanceFacts: [],
      guidanceLoaded: true,
      ownerDecisionPrompt: '',
      guidanceNote: '',
      attachmentFiles: [],
      attachmentImages: [],
      hadAttachments: false,
      installCompleted: true,
    });

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-a');
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.intent()).toBe('Build Team A');
    expect(page.attachments.files().map((file) => file.path)).toEqual([
      '/ws/file-a.md',
    ]);
    expect(page.state.ownerDecision()).toBe('raise');
    expect(page.state.installed()).toEqual(['owner/repo/skill-a']);

    // Rebind the SAME mounted fixture to record B (empty attachments, no ownerDecision, different installed skills).
    fixture.componentRef.setInput('tab', 'setup-tb-b');
    fixture.detectChanges();

    expect(page.activeRecord()?.id).toBe('setup-tb-b');
    expect(page.intent()).toBe('Build Team B');
    expect(page.attachments.files()).toEqual([]);
    expect(page.attachments.images()).toEqual([]);
    expect(page.missingAttachments()).toBe(false);
    expect(page.state.ownerDecision()).toBeNull();
    expect(page.state.guidanceFacts()).toEqual([]);
    expect(page.state.guidanceNote()).toBe('');
    expect(page.state.installed()).toEqual(['owner/repo/skill-b']);

    await page.launchChat();
    expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
    const [sentText, sentOpts] = sendOrQueueMessage.mock.calls[0];
    expect(sentText).toBe('Build Team B');
    expect(sentText).not.toContain('Fact A');
    expect(sentText).not.toContain('Owner decision');
    expect(sentOpts).toEqual(
      expect.objectContaining({ files: undefined, images: undefined }),
    );
    expect(runRecords().find((r) => r.id === 'setup-tb-b')).toMatchObject({
      status: 'completed',
      step: 'handed-off',
      teamBuilder: {
        intent: 'Build Team B',
        installed: ['owner/repo/skill-b'],
      },
    });
    fixture.destroy();
  });

  it('invalidates pending loadReview work when rebinding a mounted page to another record', async () => {
    let finishRecommendA!: (value: {
      isSuccess: () => boolean;
      data: { skills: Array<{ skill: { source: string; skillId: string; name: string; installs: number } }> };
    }) => void;
    call.mockImplementation(async (method: string) => {
      if (method === 'wizard:recommend-skills') {
        return new Promise((resolve) => {
          finishRecommendA = resolve;
        });
      }
      return {
        isSuccess: () => true,
        data:
          method === 'wizard:list-analyses'
            ? { analyses: [] }
            : method === 'wizard:get-project-guidance'
              ? { facts: [], ownerDecisionPrompt: '' }
              : { prompt: 'CONFIGURE_PREAMBLE', skills: [] },
      };
    });

    const coordinator = TestBed.inject(TeamBuilderRunCoordinator);
    runRecords.set([
      {
        id: 'setup-tb-a',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: { intent: 'Pre-install A', installed: [] },
        error: 'Install A failed.',
        unseen: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'setup-tb-b',
        workspacePath: '/ws',
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        backendRunId: null,
        analysisRunId: null,
        parentId: null,
        teamBuilder: {
          intent: 'Post-install B',
          installed: ['owner/repo/b'],
        },
        error: 'Launch B failed.',
        unseen: true,
        createdAt: 2000,
        updatedAt: 2000,
      },
    ]);
    coordinator.saveDraft('setup-tb-b', {
      workspacePath: '/ws',
      intent: 'Post-install B',
      selectedIds: ['owner/repo/b'],
      ownerDecision: null,
      guidanceFacts: [],
      guidanceLoaded: true,
      attachmentFiles: [],
      attachmentImages: [],
      hadAttachments: false,
      installCompleted: true,
    });

    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.componentRef.setInput('tab', 'setup-tb-a');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    // Switch to B while A's wizard:recommend-skills is still in flight.
    fixture.componentRef.setInput('tab', 'setup-tb-b');
    fixture.detectChanges();
    const page = fixture.componentInstance;

    finishRecommendA({
      isSuccess: () => true,
      data: {
        skills: [
          {
            skill: {
              source: 'owner/repo',
              skillId: 'stale-a',
              name: 'Stale A',
              installs: 10,
            },
          },
        ],
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(page.activeRecord()?.id).toBe('setup-tb-b');
    expect(page.state.recommendations()).toEqual([]);
    expect(page.state.loading()).toBe(false);
    expect(page.actionError()).toBe('Launch B failed.');
    expect(page.skillsInstalled()).toBe(true);
    fixture.destroy();
  });

  describe('Phase C F6 post-install attachment recovery regressions', () => {
    it.each(['failed', 'interrupted'] as const)(
      'preserves confirmed install state, selection, and owner decision when clicking Re-attach files and submitting on a reloaded post-install %s run',
      async (initialStatus) => {
        call.mockImplementation(async (method: string) => ({
          isSuccess: () => true,
          data:
            method === 'wizard:list-analyses'
              ? { analyses: [] }
              : method === 'wizard:get-project-guidance'
                ? {
                    facts: [
                      {
                        category: 'test',
                        label: 'tolerate',
                        fact: 'Legacy Jest specs',
                      },
                    ],
                    ownerDecisionPrompt: 'Match or raise?',
                  }
                : method === 'harness:workflow-prompt'
                  ? { prompt: 'CONFIGURE_PREAMBLE' }
                  : { skills: [] },
        }));

        const recordId = `setup-tb-reattach-${initialStatus}`;
        runRecords.set([
          {
            id: recordId,
            workspacePath: '/ws',
            workflow: 'team-builder',
            status: initialStatus,
            step: initialStatus === 'failed' ? 'review' : 'launching',
            backendRunId: null,
            analysisRunId: null,
            parentId: null,
            teamBuilder: {
              intent: 'Build a resilient team',
              installed: ['owner/repo/one'],
              selectedIds: ['owner/repo/one'],
              ownerDecision: 'raise',
              installCompleted: true,
              hadAttachments: true,
            },
            ...(initialStatus === 'failed'
              ? { error: 'Could not start chat.' }
              : {}),
            unseen: true,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ]);

        const fixture = TestBed.createComponent(TeamBuilderStartPage);
        fixture.componentRef.setInput('tab', recordId);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const page = fixture.componentInstance;
        const coordinator = TestBed.inject(TeamBuilderRunCoordinator);
        const root = fixture.nativeElement as HTMLElement;
        expect(page.skillsInstalled()).toBe(true);
        expect(page.missingAttachments()).toBe(true);

        // Click "Re-attach files" to return to the intent form.
        const reattachBtn = [...root.querySelectorAll('button')].find((btn) =>
          btn.textContent?.includes('Re-attach files'),
        );
        expect(reattachBtn).toBeDefined();
        reattachBtn?.click();
        fixture.detectChanges();
        expect(page.viewStage()).toBe('intent');
        const submitBtn = root.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        );
        expect(submitBtn?.textContent?.trim()).toBe('Continue');

        // Re-attach a file and submit the intent form.
        page.attachments.addFile(attachment('/ws/reattached.md'));
        fixture.detectChanges();
        await page.submit(submitEvent());
        fixture.detectChanges();

        // Confirmed install state must NOT be wiped.
        expect(page.viewStage()).toBe('review');
        expect(page.skillsInstalled()).toBe(true);
        expect(coordinator.hasCompletedInstall(recordId)).toBe(true);
        expect(page.missingAttachments()).toBe(false);
        expect(page.state.installed()).toEqual(['owner/repo/one']);
        expect(page.state.selectedIds()).toEqual(new Set(['owner/repo/one']));
        expect(page.state.ownerDecision()).toBe('raise');
        expect(runRecords()[0]).toMatchObject({
          status: 'needs-input',
          step: 'review',
          teamBuilder: {
            intent: 'Build a resilient team',
            installed: ['owner/repo/one'],
          },
        });
        expect(
          root.querySelector('[data-testid="skill-install-primary"]'),
        ).toBeNull();
        expect(root.textContent).toContain('Continue to team builder');

        // Clicking Continue to team builder launches directly with re-attached file,
        // loaded project guidance, and zero re-install RPC calls.
        const continueBtn = [...root.querySelectorAll('button')].find((btn) =>
          btn.textContent?.includes('Continue to team builder'),
        );
        expect(continueBtn).toBeDefined();
        continueBtn?.click();
        await fixture.whenStable();

        expect(
          call.mock.calls.filter(
            ([method]) => method === 'wizard:install-skills-with-consent',
          ),
        ).toHaveLength(0);
        expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
        const [sentMessage, sentOpts] = sendOrQueueMessage.mock.calls[0];
        expect(sentMessage).toContain('Build a resilient team');
        expect(sentMessage).toContain('Legacy Jest specs');
        expect(sentMessage).toContain('Owner decision: Raise the standard');
        expect(sentOpts).toEqual(
          expect.objectContaining({ files: ['/ws/reattached.md'] }),
        );
        expect(runRecords()[0]).toMatchObject({
          status: 'completed',
          step: 'handed-off',
          teamBuilder: {
            intent: 'Build a resilient team',
            installed: ['owner/repo/one'],
          },
        });
        fixture.destroy();
      },
    );

    it('loads project guidance and retries before launching when clicking Continue without attachments on a reloaded post-install interrupted run', async () => {
      call.mockImplementation(async (method: string) => ({
        isSuccess: () => true,
        data:
          method === 'wizard:list-analyses'
            ? { analyses: [] }
            : method === 'wizard:get-project-guidance'
              ? {
                  facts: [
                    {
                      category: 'test',
                      label: 'tolerate',
                      fact: 'Legacy Jest specs',
                    },
                  ],
                  ownerDecisionPrompt: 'Match or raise?',
                }
              : method === 'harness:workflow-prompt'
                ? { prompt: 'CONFIGURE_PREAMBLE' }
                : { skills: [] },
      }));

      runRecords.set([
        {
          id: 'setup-tb-interrupted-post',
          workspacePath: '/ws',
          workflow: 'team-builder',
          status: 'interrupted',
          step: 'launching',
          backendRunId: null,
          analysisRunId: null,
          parentId: null,
          teamBuilder: {
            intent: 'Build a team without old files',
            installed: ['owner/repo/one'],
            selectedIds: ['owner/repo/one'],
            ownerDecision: 'raise',
            installCompleted: true,
            hadAttachments: true,
          },
          unseen: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);

      const fixture = TestBed.createComponent(TeamBuilderStartPage);
      fixture.componentRef.setInput('tab', 'setup-tb-interrupted-post');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const page = fixture.componentInstance;
      const root = fixture.nativeElement as HTMLElement;
      expect(page.interrupted()).toBe(true);
      expect(page.skillsInstalled()).toBe(true);
      expect(page.missingAttachments()).toBe(true);
      expect(page.state.guidanceFacts()).toEqual([]);

      const continueWithout = root.querySelector<HTMLButtonElement>(
        '[data-testid="team-builder-continue-without-attachments"]',
      );
      expect(continueWithout).not.toBeNull();
      continueWithout?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(setupRuns.retry).toHaveBeenCalledWith('setup-tb-interrupted-post');
      expect(call).toHaveBeenCalledWith(
        'wizard:get-project-guidance',
        expect.anything(),
      );
      expect(
        call.mock.calls.filter(
          ([method]) => method === 'wizard:install-skills-with-consent',
        ),
      ).toHaveLength(0);
      expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
      const [sentMessage, sentOpts] = sendOrQueueMessage.mock.calls[0];
      expect(sentMessage).toContain('Build a team without old files');
      expect(sentMessage).toContain('Legacy Jest specs');
      expect(sentMessage).toContain('Owner decision: Raise the standard');
      expect(sentOpts).toEqual(
        expect.objectContaining({ files: undefined, images: undefined }),
      );
      expect(runRecords()[0]).toMatchObject({
        status: 'completed',
        step: 'handed-off',
        teamBuilder: {
          intent: 'Build a team without old files',
          installed: ['owner/repo/one'],
        },
      });
      fixture.destroy();
    });

    it.each(['unsuccessful', 'rejected', 'recommendations'] as const)(
      'does not dispatch chat when guidance fails (%s) on reloaded post-install interrupted recovery and stays actionable for retry',
      async (failureKind) => {
        let guidanceShouldFail = true;
        let recoveredFacts: Array<{
          category: string;
          label: 'follow' | 'tolerate';
          fact: string;
        }> = [];
        call.mockImplementation(async (method: string) => {
          if (
            method === 'wizard:recommend-skills' &&
            failureKind === 'recommendations' &&
            guidanceShouldFail
          ) {
            return {
              isSuccess: () => false,
              error: 'recommendations offline',
            };
          }
          if (method === 'wizard:get-project-guidance') {
            if (guidanceShouldFail) {
              if (failureKind === 'rejected') {
                throw new Error('guidance transport offline');
              }
              return {
                isSuccess: () => false,
                error: 'internal guidance error',
              };
            }
            return {
              isSuccess: () => true,
              data: {
                facts: recoveredFacts,
                ownerDecisionPrompt: recoveredFacts.length
                  ? 'Match or raise?'
                  : '',
              },
            };
          }
          return {
            isSuccess: () => true,
            data:
              method === 'wizard:list-analyses'
                ? { analyses: [] }
                : method === 'harness:workflow-prompt'
                  ? { prompt: 'CONFIGURE_PREAMBLE' }
                  : { skills: [] },
          };
        });

        const recordId = `setup-tb-guidance-fail-${failureKind}`;
        const expectedError =
          failureKind === 'recommendations'
            ? 'Could not load skill recommendations.'
            : 'Could not load project guidance.';
        runRecords.set([
          {
            id: recordId,
            workspacePath: '/ws',
            workflow: 'team-builder',
            status: 'interrupted',
            step: 'launching',
            backendRunId: null,
            analysisRunId: null,
            parentId: null,
            teamBuilder: {
              intent: 'Build a team with reliable guidance',
              installed: ['owner/repo/one'],
              selectedIds: ['owner/repo/one'],
              ownerDecision: 'raise',
              installCompleted: true,
              hadAttachments: true,
            },
            unseen: true,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ]);

        const fixture = TestBed.createComponent(TeamBuilderStartPage);
        fixture.componentRef.setInput('tab', recordId);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const page = fixture.componentInstance;
        const root = fixture.nativeElement as HTMLElement;
        const continueWithout = root.querySelector<HTMLButtonElement>(
          '[data-testid="team-builder-continue-without-attachments"]',
        );
        expect(continueWithout).not.toBeNull();
        continueWithout?.click();
        await fixture.whenStable();
        fixture.detectChanges();

        // Must retry the record, surface the load error, and NEVER dispatch chat.
        expect(setupRuns.retry).toHaveBeenCalledWith(recordId);
        expect(sendOrQueueMessage).not.toHaveBeenCalled();
        expect(page.skillsInstalled()).toBe(true);
        expect(page.interrupted()).toBe(false);
        expect(page.actionError()).toBe(expectedError);

        // Post-install recovery remains actionable; clicking Continue while guidance still fails still blocks chat.
        const continueBtn = [...root.querySelectorAll('button')].find((btn) =>
          btn.textContent?.includes('Continue to team builder'),
        ) as HTMLButtonElement | undefined;
        expect(continueBtn).toBeDefined();
        expect(continueBtn?.disabled).toBe(false);
        continueBtn?.click();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(sendOrQueueMessage).not.toHaveBeenCalled();
        expect(page.actionError()).toBe(expectedError);

        // Once guidance succeeds (zero facts for unsuccessful case, real fact for rejected case), retry launches chat.
        guidanceShouldFail = false;
        recoveredFacts =
          failureKind === 'rejected'
            ? [
                {
                  category: 'test',
                  label: 'tolerate',
                  fact: 'Recovered guidance fact',
                },
              ]
            : [];
        continueBtn?.click();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
        const [sentMessage] = sendOrQueueMessage.mock.calls[0];
        expect(sentMessage).toContain('Build a team with reliable guidance');
        if (failureKind === 'rejected') {
          expect(sentMessage).toContain('Recovered guidance fact');
        }
        expect(runRecords()[0]).toMatchObject({
          status: 'completed',
          step: 'handed-off',
          teamBuilder: {
            intent: 'Build a team with reliable guidance',
            installed: ['owner/repo/one'],
          },
        });
        fixture.destroy();
      },
    );

    it('reconciles confirmed partial installs on the page when continuing an interrupted run before the cancelled install reply settles', async () => {
      let finishInstall!: (value: {
        isSuccess: () => boolean;
        data: WizardInstallSkillsWithConsentResponse;
      }) => void;
      call.mockImplementation(async (method: string) => {
        if (method === 'wizard:install-skills-with-consent') {
          return new Promise((resolve) => {
            finishInstall = resolve;
          });
        }
        if (method === 'wizard:preview-skills-for-consent') {
          return {
            isSuccess: () => true,
            data: {
              skills: [
                {
                  skillName: 'owner/repo/one',
                  files: [],
                  scriptFiles: [],
                  hasScripts: false,
                  contentHash: 'hash-1',
                },
              ],
            },
          };
        }
        return {
          isSuccess: () => true,
          data:
            method === 'wizard:list-analyses'
              ? { analyses: [] }
              : method === 'wizard:get-project-guidance'
                ? { facts: [], ownerDecisionPrompt: '' }
                : method === 'harness:workflow-prompt'
                  ? { prompt: 'CONFIGURE_PREAMBLE' }
                  : { skills: [] },
        };
      });

      const fixture = TestBed.createComponent(TeamBuilderStartPage);
      fixture.detectChanges();
      const page = fixture.componentInstance;
      page.state.setIntent('Build A with retry');
      page.state.setPreview([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash-1',
        },
        {
          skillName: 'owner/repo/two',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash-2',
        },
      ]);
      page.state.setStage('consent');

      const pendingInstall = page.install();
      const recordId = page.activeRecord()?.id ?? '';
      expect(recordId).toBeTruthy();

      // Switch workspace A -> B while install reply is still pending.
      workspaceRoot.set('/ws-b');
      fixture.detectChanges();
      TestBed.tick();
      expect(runRecords()[0]?.status).toBe('interrupted');
      await pendingInstall;

      // Return to A and click Continue before the backend install reply settles.
      workspaceRoot.set('/ws');
      fixture.componentRef.setInput('tab', recordId);
      fixture.detectChanges();
      TestBed.tick();
      expect(page.interrupted()).toBe(true);

      await page.continueInterrupted();
      fixture.detectChanges();
      expect(runRecords()[0]?.status).toBe('needs-input');

      // Now the cancelled install reply arrives carrying workspace A and a confirmed skill.
      finishInstall({
        isSuccess: () => true,
        data: {
          success: false,
          cancelled: true,
          installed: ['owner/repo/one'],
          workspacePath: '/ws/',
        },
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(runRecords()[0]).toMatchObject({
        id: recordId,
        status: 'needs-input',
        teamBuilder: {
          installed: ['owner/repo/one'],
        },
      });
      expect(page.state.installed()).toEqual(['owner/repo/one']);
      expect(page.skillsInstalled()).toBe(false);
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
      fixture.destroy();
    });

    it('keeps failed guidance unloaded through install, workspace interruption, and same-renderer recovery (18B r2 F1)', async () => {
      let guidanceShouldFail = true;
      let markPromptStarted!: () => void;
      const promptStarted = new Promise<void>((resolve) => {
        markPromptStarted = resolve;
      });
      let finishPrompt!: (value: {
        isSuccess: () => boolean;
        data: { prompt: string };
      }) => void;
      let promptCalls = 0;

      call.mockImplementation(async (method: string) => {
        if (method === 'wizard:list-analyses') {
          return { isSuccess: () => true, data: { analyses: [] } };
        }
        if (method === 'wizard:recommend-skills') {
          return {
            isSuccess: () => true,
            data: {
              skills: [
                {
                  skill: {
                    source: 'owner/repo',
                    skillId: 'one',
                    name: 'One',
                    description: 'Angular skill',
                    installs: 100,
                  },
                  evidence: 'Angular',
                },
              ],
            },
          };
        }
        if (method === 'wizard:get-project-guidance') {
          if (guidanceShouldFail) {
            return { isSuccess: () => false, error: 'guidance offline' };
          }
          return {
            isSuccess: () => true,
            data: { facts: [], ownerDecisionPrompt: '' },
          };
        }
        if (method === 'wizard:preview-skills-for-consent') {
          return {
            isSuccess: () => true,
            data: {
              skills: [
                {
                  skillName: 'owner/repo/one',
                  files: [],
                  scriptFiles: [],
                  hasScripts: false,
                  contentHash: 'hash-1',
                },
              ],
            },
          };
        }
        if (method === 'wizard:install-skills-with-consent') {
          return {
            isSuccess: () => true,
            data: {
              success: true,
              cancelled: false,
              installed: ['owner/repo/one'],
              workspacePath: '/ws',
            },
          };
        }
        if (method === 'harness:workflow-prompt') {
          promptCalls += 1;
          if (promptCalls === 1) {
            markPromptStarted();
            return new Promise((resolve) => {
              finishPrompt = resolve;
            });
          }
          return {
            isSuccess: () => true,
            data: { prompt: 'CONFIGURE_PREAMBLE' },
          };
        }
        return { isSuccess: () => true, data: {} };
      });

      const coordinator = TestBed.inject(TeamBuilderRunCoordinator);
      const fixture = TestBed.createComponent(TeamBuilderStartPage);
      fixture.detectChanges();
      const page = fixture.componentInstance;
      page.state.setIntent('Build team with failed guidance');

      await page.submit(new Event('submit'));
      fixture.detectChanges();
      const recordId = page.activeRecord()?.id ?? '';
      expect(recordId).toBeTruthy();
      expect(coordinator.draftFor(recordId)?.guidanceLoaded).toBe(false);

      // Recommendations succeeded even though guidance failed: select skill, preview, and install.
      page.onSelectionToggled('owner/repo/one');
      await page.reviewSelection();
      fixture.detectChanges();
      expect(page.viewStage()).toBe('consent');

      const pendingInstall = page.install();
      await promptStarted;

      // Install completed and draft must STILL record guidanceLoaded: false (never inferred).
      expect(coordinator.hasCompletedInstall(recordId)).toBe(true);
      expect(coordinator.draftFor(recordId)?.guidanceLoaded).toBe(false);

      // Interrupt via workspace switch before first send.
      workspaceRoot.set('/ws-b');
      fixture.detectChanges();
      TestBed.tick();
      finishPrompt({
        isSuccess: () => true,
        data: { prompt: 'CONFIGURE_PREAMBLE' },
      });
      await pendingInstall;
      expect(runRecords()[0]?.status).toBe('interrupted');

      // Return to workspace A in the SAME renderer and click Continue while guidance still fails.
      workspaceRoot.set('/ws');
      fixture.componentRef.setInput('tab', recordId);
      fixture.detectChanges();
      TestBed.tick();
      expect(page.interrupted()).toBe(true);
      expect(page.skillsInstalled()).toBe(true);

      const guidanceCallsBeforeContinue = call.mock.calls.filter(
        ([method]) => method === 'wizard:get-project-guidance',
      ).length;
      const root = fixture.nativeElement as HTMLElement;
      const continueInterruptedBtn = root.querySelector<HTMLButtonElement>(
        '[data-testid="team-builder-continue-interrupted"]',
      );
      expect(continueInterruptedBtn).not.toBeNull();
      continueInterruptedBtn?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        call.mock.calls.filter(
          ([method]) => method === 'wizard:get-project-guidance',
        ).length,
      ).toBeGreaterThan(guidanceCallsBeforeContinue);
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
      expect(page.actionError()).toBe('Could not load project guidance.');
      expect(coordinator.draftFor(recordId)?.guidanceLoaded).toBe(false);

      // Once guidance succeeds (even with an empty facts array), Continue to team builder dispatches chat.
      guidanceShouldFail = false;
      const continueBtn = [...root.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes('Continue to team builder'),
      ) as HTMLButtonElement | undefined;
      expect(continueBtn).toBeDefined();
      continueBtn?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
      expect(runRecords()[0]).toMatchObject({
        id: recordId,
        status: 'completed',
        step: 'handed-off',
        teamBuilder: {
          installed: ['owner/repo/one'],
        },
      });
      fixture.destroy();
    });

    it('surfaces owner-decision controls in installed recovery when reloaded guidance requires a decision and allows Continue without reinstalling (18B r2 F2)', async () => {
      call.mockImplementation(async (method: string) => {
        if (method === 'wizard:list-analyses') {
          return { isSuccess: () => true, data: { analyses: [] } };
        }
        if (method === 'wizard:recommend-skills') {
          return { isSuccess: () => true, data: { skills: [] } };
        }
        if (method === 'wizard:get-project-guidance') {
          return {
            isSuccess: () => true,
            data: {
              facts: [
                {
                  category: 'testing',
                  label: 'tolerate',
                  fact: 'Legacy Jest specs coexist with Vitest',
                  evidence: 'jest.config.ts',
                },
              ],
              ownerDecisionPrompt:
                'How should the team handle existing practices?',
            },
          };
        }
        if (method === 'harness:workflow-prompt') {
          return {
            isSuccess: () => true,
            data: { prompt: 'CONFIGURE_PREAMBLE' },
          };
        }
        return { isSuccess: () => true, data: {} };
      });

      const recordId = 'setup-tb-recovery-decision';
      runRecords.set([
        {
          id: recordId,
          workspacePath: '/ws',
          workflow: 'team-builder',
          status: 'interrupted',
          step: 'launching',
          backendRunId: null,
          analysisRunId: null,
          parentId: null,
          teamBuilder: {
            intent: 'Build a team after guidance change',
            installed: ['owner/repo/one'],
            selectedIds: ['owner/repo/one'],
            ownerDecision: null,
            installCompleted: true,
            hadAttachments: false,
          },
          unseen: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);

      const fixture = TestBed.createComponent(TeamBuilderStartPage);
      fixture.componentRef.setInput('tab', recordId);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const page = fixture.componentInstance;
      const root = fixture.nativeElement as HTMLElement;
      expect(page.interrupted()).toBe(true);
      expect(page.skillsInstalled()).toBe(true);
      expect(page.state.ownerDecision()).toBeNull();

      // Click Continue on the interrupted run: reloaded guidance has a `tolerate` fact, so dispatch must block.
      const continueInterruptedBtn = root.querySelector<HTMLButtonElement>(
        '[data-testid="team-builder-continue-interrupted"]',
      );
      expect(continueInterruptedBtn).not.toBeNull();
      continueInterruptedBtn?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(setupRuns.retry).toHaveBeenCalledWith(recordId);
      expect(sendOrQueueMessage).not.toHaveBeenCalled();
      expect(page.skillsInstalled()).toBe(true);
      expect(page.ownerDecisionRequired()).toBe(true);
      expect(page.ownerDecisionError()).toBe(true);
      expect(root.textContent).toContain(
        'Legacy Jest specs coexist with Vitest',
      );

      // The installed recovery panel must expose the owner-decision radio buttons.
      const matchRadio = root.querySelector<HTMLInputElement>(
        'input[name="owner-decision"][value="match"]',
      );
      const raiseRadio = root.querySelector<HTMLInputElement>(
        'input[name="owner-decision"][value="raise"]',
      );
      expect(matchRadio).not.toBeNull();
      expect(raiseRadio).not.toBeNull();

      // Selecting a decision enables launching without reinstalling.
      raiseRadio?.click();
      raiseRadio?.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(page.state.ownerDecision()).toBe('raise');
      expect(page.ownerDecisionError()).toBe(false);

      const continueBtn = [...root.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes('Continue to team builder'),
      ) as HTMLButtonElement | undefined;
      expect(continueBtn).toBeDefined();
      expect(continueBtn?.disabled).toBe(false);
      continueBtn?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        call.mock.calls.filter(
          ([method]) => method === 'wizard:install-skills-with-consent',
        ),
      ).toHaveLength(0);
      expect(sendOrQueueMessage).toHaveBeenCalledTimes(1);
      const [sentMessage] = sendOrQueueMessage.mock.calls[0];
      expect(sentMessage).toContain('Build a team after guidance change');
      expect(sentMessage).toContain('Legacy Jest specs coexist with Vitest');
      expect(sentMessage).toContain('Owner decision: Raise the standard');
      expect(runRecords()[0]).toMatchObject({
        id: recordId,
        status: 'completed',
        step: 'handed-off',
        teamBuilder: {
          intent: 'Build a team after guidance change',
          installed: ['owner/repo/one'],
        },
      });
      fixture.destroy();
    });
  });
});
