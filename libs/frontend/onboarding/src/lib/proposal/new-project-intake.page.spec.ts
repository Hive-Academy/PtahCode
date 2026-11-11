import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  ComposerAttachmentsService,
  FilePickerService,
} from '@ptah-extension/chat';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { NewProjectIntake } from '@ptah-extension/shared';
import {
  HarnessChatLauncherService,
  type HarnessChatLaunchOptions,
  type LauncherAttachmentSnapshot,
} from '../launcher/harness-chat-launcher.service';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';
import { NewProjectIntakePage } from './new-project-intake.page';

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

describe('NewProjectIntakePage', () => {
  let workspaceRoot: WritableSignal<string>;
  let checkFolderEmpty: jest.Mock<Promise<boolean>, [string?]>;
  let launchNewProject: jest.Mock<
    Promise<{ tabId: string }>,
    [NewProjectIntake, LauncherAttachmentSnapshot, HarnessChatLaunchOptions?]
  >;
  let navigate: jest.Mock<Promise<boolean>, [readonly string[]]>;

  const makePage = () =>
    TestBed.runInInjectionContext(() => new NewProjectIntakePage());

  beforeEach(() => {
    workspaceRoot = signal('/ws');
    checkFolderEmpty = jest.fn().mockResolvedValue(true);
    launchNewProject = jest.fn(
      async (
        _intake: NewProjectIntake,
        snapshot: LauncherAttachmentSnapshot,
      ) => {
        snapshot.removeSent();
        return { tabId: 'tab-new' };
      },
    );
    navigate = jest.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: HarnessChatLauncherService,
          useValue: {
            workspaceRoot,
            checkFolderEmpty,
            launchNewProject,
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

  it('validates required brief and other stack on submit', async () => {
    const page = makePage();
    await Promise.resolve();

    await page.submit(submitEvent());
    expect(page.errors()).toContain('What are you building is required.');

    page.what.set('A planning app');
    page.stack.set('other');
    expect(page.errors()).toContain('Enter your stack.');
  });

  it('requires confirmation before starting in a nonempty folder', async () => {
    checkFolderEmpty.mockResolvedValueOnce(false);
    const page = makePage();
    await Promise.resolve();

    expect(page.workspaceEmpty()).toBe(false);
    page.what.set('A planning app');
    await page.submit(submitEvent());
    expect(launchNewProject).not.toHaveBeenCalled();

    page.confirmedNonEmpty.set(true);
    await page.submit(submitEvent());
    expect(launchNewProject).toHaveBeenCalledTimes(1);
  });

  it('holds submission until the folder check succeeds and offers retry on failure', async () => {
    let finish!: (empty: boolean) => void;
    checkFolderEmpty
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true);

    const page = makePage();
    page.what.set('Planning app');
    await page.submit(submitEvent());
    expect(launchNewProject).not.toHaveBeenCalled();

    finish(true);
    await Promise.resolve();
    expect(page.workspaceEmpty()).toBe(true);
    await page.submit(submitEvent());
    expect(launchNewProject).toHaveBeenCalledTimes(1);

    page.workspaceEmpty.set(null);
    await page.retryWorkspaceCheck();
    expect(page.workspaceCheckError()).toBe(
      'Could not check this folder. Try again.',
    );
    await page.retryWorkspaceCheck();
    expect(page.workspaceEmpty()).toBe(true);
    expect(page.workspaceCheckError()).toBeNull();
  });

  it('resets stack and custom stack when platform changes', () => {
    const page = makePage();
    page.stack.set('other');
    page.stackOther.set('Rust');
    page.setPlatform('python');
    expect(page.stack()).toBe('recommend');
    expect(page.stackOther()).toBe('');
  });

  it('uses one registry option per stack, including the other platform', () => {
    const page = makePage();
    const labels = page.stackOptions().map((option) => option.label);
    expect(labels.filter((label) => label === 'Recommend for me')).toHaveLength(
      1,
    );
    expect(labels.filter((label) => label === 'Other')).toHaveLength(1);
    page.setPlatform('other');
    expect(page.stackOptions().map((option) => option.value)).toEqual([
      'recommend',
      'other',
    ]);
  });

  it('launches a chat session with attachments and does not navigate to a proposal route', async () => {
    const page = makePage();
    await Promise.resolve();

    page.what.set('Planning app');
    page.audience.set('b2b');
    page.constraints.set('Offline first');
    page.attachments.addFile(attachment('/ws/brief.md'));

    await page.submit(submitEvent());

    expect(launchNewProject).toHaveBeenCalledWith(
      {
        what: 'Planning app',
        audience: 'b2b',
        platform: 'node-ts',
        stack: 'recommend',
        constraints: 'Offline first',
      },
      expect.objectContaining({
        options: { files: ['/ws/brief.md'], images: undefined },
      }),
      { signal: expect.any(AbortSignal) },
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(page.attachments.files()).toHaveLength(0);
    expect(page.starting()).toBe(false);
    expect(page.actionError()).toBeNull();
  });

  it('surfaces a readable error, re-enables Continue, and preserves attachments when launch fails', async () => {
    launchNewProject.mockRejectedValueOnce(
      new Error('Failed to enable workspace plugin'),
    );
    const page = makePage();
    await Promise.resolve();

    page.what.set('Planning app');
    page.attachments.addFile(attachment('/ws/brief.md'));

    await page.submit(submitEvent());

    expect(page.actionError()).toBe('Failed to enable workspace plugin');
    expect(page.starting()).toBe(false);
    expect(page.attachments.files()).toHaveLength(1);
  });

  it('preserves attachments added while launch is pending', async () => {
    let finish!: () => void;
    launchNewProject.mockImplementationOnce(
      (_intake: NewProjectIntake, snapshot: LauncherAttachmentSnapshot) =>
        new Promise<{ tabId: string }>((resolve) => {
          finish = () => {
            snapshot.removeSent();
            resolve({ tabId: 'tab-new' });
          };
        }),
    );
    const page = makePage();
    await Promise.resolve();

    page.what.set('Planning app');
    page.attachments.addFile(attachment('/ws/first.md'));
    page.attachments.pendingReads.set(1);
    await page.submit(submitEvent());
    expect(launchNewProject).not.toHaveBeenCalled();

    page.attachments.pendingReads.set(0);
    const pending = page.submit(submitEvent());
    page.attachments.addFile(attachment('/ws/later.md'));
    finish();
    await pending;

    expect(launchNewProject).toHaveBeenCalledWith(
      expect.objectContaining({ what: 'Planning app' }),
      expect.objectContaining({
        options: { files: ['/ws/first.md'], images: undefined },
      }),
      { signal: expect.any(AbortSignal) },
    );
    expect(page.attachments.files().map((file) => file.path)).toEqual([
      '/ws/later.md',
    ]);
  });

  it('renders without stepper, draft banner, or leave dialog', () => {
    const fixture = TestBed.createComponent(NewProjectIntakePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('ptah-onboarding-stepper')).toBeNull();
    expect(
      element.querySelector('ptah-harness-builder-leave-dialog'),
    ).toBeNull();
    expect(element.textContent).not.toContain('Continue your draft');
    fixture.destroy();
  });
});
