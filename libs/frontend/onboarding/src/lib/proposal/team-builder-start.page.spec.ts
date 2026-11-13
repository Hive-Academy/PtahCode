import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  ComposerAttachmentsService,
  FilePickerService,
} from '@ptah-extension/chat';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
  type HarnessChatLaunchOptions,
  type LauncherAttachmentSnapshot,
} from '../launcher/harness-chat-launcher.service';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';
import { TeamBuilderStartPage } from './team-builder-start.page';
import { TeamBuilderSkillStore } from './team-builder-skill.store';

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
        ComposerAttachmentsService,
        TeamBuilderSkillStore,
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

  it('shows launch completion and clears it on Back', async () => {
    const fixture = TestBed.createComponent(TeamBuilderStartPage);
    const page = fixture.componentInstance;
    page.intent.set('Build a team');
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
    page.intent.set('Build a team');
    await page.submit(submitEvent());
    page.state.guidanceFacts.set([
      { category: 'test', label: 'tolerate', fact: 'Old tests' },
    ]);
    page.state.selectedIds.set(new Set(['owner/skill']));
    await page.reviewSelection();
    expect(page.ownerDecisionError()).toBe(true);
    expect(call).not.toHaveBeenCalledWith(
      'wizard:preview-skills-for-consent',
      expect.anything(),
    );
    await page.launchChat();
    expect(launchTeamBuilder).not.toHaveBeenCalled();
    page.state.ownerDecision.set('raise');
    await page.launchChat();
    expect(call).toHaveBeenCalledWith('wizard:get-project-guidance', expect.objectContaining({ ownerDecision: 'raise' }));
    expect(launchTeamBuilder.mock.calls[0][0]).toContain(
      'Owner decision: Raise the standard',
    );
  });
  it('keeps Skip locked during loading and launches after record failure', async () => {
    const page = TestBed.runInInjectionContext(() => new TeamBuilderStartPage());
    page.intent.set('Build a team');
    page.state.loading.set(true);
    await page.launchChat();
    expect(launchTeamBuilder).not.toHaveBeenCalled();
    page.state.loading.set(false);
    page.state.ownerDecision.set('match');
    call.mockImplementation(async (method: string) => method === 'wizard:get-project-guidance'
      ? { isSuccess: () => false }
      : { isSuccess: () => true, data: { skills: [] } });
    await page.launchChat();
    expect(launchTeamBuilder).toHaveBeenCalledTimes(1);
    expect(page.state.guidanceNote()).toBe('Guidance record was not written.');
  });

  it('shows limited guidance without a saved analysis and returns to intent on Back', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );
    page.intent.set('Build a team');
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

    page.intent.set('  A research team  ');
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

    page.intent.set('A research team');
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

    page.intent.set('A research team');
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

    page.intent.set('A research team');
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
    page.state.preview.set([
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
    page.state.recommendations.set([
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
    page.state.searchResults.set([
      {
        source: 'old',
        skillId: 'skill',
        name: 'Old',
        description: '',
        installs: 0,
        isInstalled: false,
      },
    ]);
    page.state.guidanceFacts.set([
      { category: 'old', label: 'follow', fact: 'Old' },
    ]);
    page.state.installed.set(['old']);
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
    page.state.guidanceFacts.set([
      { category: 'old', label: 'follow', fact: 'Old' },
    ]);
    page.state.selectedIds.set(new Set(['old']));
    page.state.ownerDecision.set('raise');
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
    page.state.preview.set([
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
});
