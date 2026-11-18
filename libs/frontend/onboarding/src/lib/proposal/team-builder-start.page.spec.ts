import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  ComposerAttachmentsService,
  FilePickerService,
} from '@ptah-extension/chat';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
  type HarnessChatLaunchOptions,
  type LauncherAttachmentSnapshot,
} from '../launcher/harness-chat-launcher.service';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';
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
  let launchTeamBuilder: jest.Mock<
    Promise<{ tabId: string }>,
    [string, LauncherAttachmentSnapshot, HarnessChatLaunchOptions?]
  >;
  let navigate: jest.Mock<Promise<boolean>, [readonly string[]]>;

  beforeEach(() => {
    workspaceRoot = signal('/ws');
    call = jest.fn(async (method: string) => ({
      isSuccess: () => true,
      data:
        method === 'wizard:list-analyses'
          ? { analyses: [] }
          : method === 'wizard:get-project-guidance'
            ? { facts: [], ownerDecisionPrompt: '' }
            : { skills: [] },
    }));
    launchTeamBuilder = jest.fn(
      async (_intent: string, snapshot: LauncherAttachmentSnapshot) => {
        snapshot.removeSent();
        return { tabId: 'tab-team' };
      },
    );
    navigate = jest.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: HarnessChatLauncherService,
          useValue: {
            workspaceRoot,
            launchTeamBuilder,
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: LoggingService, useValue: { debug: jest.fn() } },
        ComposerAttachmentsService,
        StackSkillStore,
        {
          provide: ClaudeRpcService,
          useValue: { call },
        },
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

  afterEach(() => TestBed.resetTestingModule());

  it('retries a failed launch after successful installation without reinstalling', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
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
      data: { success: true, installed: ['owner/repo/one'] },
    });
    launchTeamBuilder.mockRejectedValueOnce(new Error('navigation failed'));
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
    const callsAfterInstall = call.mock.calls.length;
    await page.install();
    expect(call).toHaveBeenCalledTimes(callsAfterInstall);
    const retry = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Continue to team builder'),
    );
    expect(retry).toBeDefined();
    retry?.click();
    await fixture.whenStable();
    expect(launchTeamBuilder).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledTimes(callsAfterInstall);
  });

  it('shows launch completion and clears it on Back', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    const page = fixture.componentInstance;
    page.state.setIntent('Build a team');
    await page.launchChat();
    fixture.detectChanges();
    expect(page.launched()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Chat opened. Use Back to leave this page.',
    );
    await page.back();
    expect(page.launched()).toBe(false);
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
    expect(launchTeamBuilder).not.toHaveBeenCalled();
    page.state.setOwnerDecision('raise');
    await page.launchChat();
    expect(call).toHaveBeenCalledWith(
      'wizard:get-project-guidance',
      expect.objectContaining({ ownerDecision: 'raise' }),
    );
    expect(launchTeamBuilder.mock.calls[0][0]).toContain(
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
    expect(launchTeamBuilder).not.toHaveBeenCalled();
    page.state.setLoading(false);
    page.state.setOwnerDecision('match');
    call.mockImplementation(async (method: string) =>
      method === 'wizard:get-project-guidance'
        ? { isSuccess: () => false }
        : { isSuccess: () => true, data: { skills: [] } },
    );
    await page.launchChat();
    expect(launchTeamBuilder).toHaveBeenCalledTimes(1);
    expect(page.state.guidanceNote()).toBe('Guidance record was not written.');
  });

  it('starts the chat from Continue when no skill is selected', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.state.setIntent('Build a team');
    await page.reviewSelection();
    expect(launchTeamBuilder).toHaveBeenCalledTimes(1);
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
    expect(launchTeamBuilder).not.toHaveBeenCalled();

    page.state.setIntent('  A research team  ');
    page.attachments.addFile(attachment('/ws/team.md'));
    await page.submit(submitEvent());
    expect(page.state.stage()).toBe('review');
    expect(launchTeamBuilder).not.toHaveBeenCalled();
    await page.launchChat();

    expect(launchTeamBuilder).toHaveBeenCalledWith(
      'A research team',
      expect.objectContaining({
        options: { files: ['/ws/team.md'], images: undefined },
      }),
      { signal: expect.any(AbortSignal) },
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(page.attachments.files()).toHaveLength(0);
    expect(page.starting()).toBe(true);
    expect(page.actionError()).toBeNull();
    expect(page.state.stage()).toBe('launching');
    await page.launchChat();
    expect(launchTeamBuilder).toHaveBeenCalledTimes(1);
  });

  it('shows a readable error, re-enables the button, and preserves attachments when launch fails', async () => {
    launchTeamBuilder.mockRejectedValueOnce(
      new Error('Could not prepare the team builder prompt. Try again.'),
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

  it('cancels a pending launch on Back and shows no error', async () => {
    let launchSignal: AbortSignal | undefined;
    launchTeamBuilder.mockImplementationOnce(
      (
        _intent: string,
        _snapshot: LauncherAttachmentSnapshot,
        options?: HarnessChatLaunchOptions,
      ) =>
        new Promise<{ tabId: string }>((_resolve, reject) => {
          launchSignal = options?.signal;
          options?.signal?.addEventListener('abort', () =>
            reject(new HarnessChatLaunchCancelledError()),
          );
        }),
    );
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    page.state.setIntent('A research team');
    page.attachments.addFile(attachment('/ws/team.md'));
    await page.submit(submitEvent());
    const pending = page.launchChat();
    await page.back();
    await pending;

    expect(launchSignal?.aborted).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/onboarding']);
    expect(page.actionError()).toBeNull();
    expect(page.starting()).toBe(false);
    expect(page.attachments.files()).toHaveLength(1);
  });

  it('preserves attachments added while team start is pending', async () => {
    let finish!: () => void;
    launchTeamBuilder.mockImplementationOnce(
      (_intent: string, snapshot: LauncherAttachmentSnapshot) =>
        new Promise<{ tabId: string }>((resolve) => {
          finish = () => {
            snapshot.removeSent();
            resolve({ tabId: 'tab-team' });
          };
        }),
    );
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    page.state.setIntent('A research team');
    page.attachments.addFile(attachment('/ws/first.md'));
    page.attachments.pendingReads.set(1);
    await page.submit(submitEvent());
    expect(launchTeamBuilder).not.toHaveBeenCalled();

    page.attachments.pendingReads.set(0);
    await page.submit(submitEvent());
    const pending = page.launchChat();
    page.attachments.addFile(attachment('/ws/later.md'));
    finish();
    await pending;

    expect(launchTeamBuilder).toHaveBeenCalledWith(
      'A research team',
      expect.objectContaining({
        options: { files: ['/ws/first.md'], images: undefined },
      }),
      { signal: expect.any(AbortSignal) },
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
    expect(launchTeamBuilder).not.toHaveBeenCalled();
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
      data: { success: boolean; installed: string[] };
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
    finish({ isSuccess: () => true, data: { success: false, installed: [] } });
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
      expect(launchTeamBuilder).not.toHaveBeenCalled();
    },
  );
  it('ignores launcher failures from an aborted workspace', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    let fail: () => void = () => {
      throw new Error('launch not started');
    };
    launchTeamBuilder.mockImplementationOnce(
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
      data: { success: true, installed: ['owner/repo/skill'] },
    });
    launchTeamBuilder.mockRejectedValue(new Error('offline'));
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
});
