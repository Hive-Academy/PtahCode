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
  let launchTeamBuilder: jest.Mock<
    Promise<{ tabId: string }>,
    [string, LauncherAttachmentSnapshot, HarnessChatLaunchOptions?]
  >;
  let navigate: jest.Mock<Promise<boolean>, [readonly string[]]>;

  beforeEach(() => {
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
            workspaceRoot: signal('/ws'),
            launchTeamBuilder,
          },
        },
        { provide: Router, useValue: { navigate } },
        ComposerAttachmentsService,
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
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

  it('requires an intent, launches a chat session with attachments, and clears sent attachments', async () => {
    const page = TestBed.runInInjectionContext(
      () => new TeamBuilderStartPage(),
    );

    await page.submit(submitEvent());
    expect(launchTeamBuilder).not.toHaveBeenCalled();

    page.intent.set('  A research team  ');
    page.attachments.addFile(attachment('/ws/team.md'));
    await page.submit(submitEvent());

    expect(launchTeamBuilder).toHaveBeenCalledWith(
      'A research team',
      expect.objectContaining({
        options: { files: ['/ws/team.md'], images: undefined },
      }),
      { signal: expect.any(AbortSignal) },
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(page.attachments.files()).toHaveLength(0);
    expect(page.starting()).toBe(false);
    expect(page.actionError()).toBeNull();
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

    expect(page.actionError()).toBe(
      'Could not prepare the team builder prompt. Try again.',
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
    const pending = page.submit(submitEvent());
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
    const pending = page.submit(submitEvent());
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
});
