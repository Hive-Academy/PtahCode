import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ArrowRight, FolderPlus, LucideAngularModule } from 'lucide-angular';
import {
  AttachmentTrayComponent,
  ComposerAttachmentsService,
} from '@ptah-extension/chat';
import {
  isNewProjectStack,
  stackOptionsForPlatform,
  type NewProjectAudience,
  type NewProjectIntake,
  type NewProjectPlatform,
  type NewProjectStack,
} from '@ptah-extension/shared';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
} from '../launcher/harness-chat-launcher.service';
import { WorkspaceHeaderComponent } from '../shell/workspace-header.component';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahTextareaDirective,
} from '@ptah-extension/ui';
import {
  NEW_PROJECT_AUDIENCE_OPTIONS,
  NEW_PROJECT_PLATFORM_OPTIONS,
} from './new-project-intake.model';

@Component({
  selector: 'ptah-new-project-intake-page',
  standalone: true,
  imports: [
    FormsModule,
    AttachmentTrayComponent,
    WorkspaceHeaderComponent,
    LucideAngularModule,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahTextareaDirective,
  ],
  providers: [ComposerAttachmentsService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mx-auto max-w-[760px] space-y-5 p-4"
      aria-labelledby="new-project-intake-title"
      data-testid="new-project-intake"
    >
      <header class="flex items-center gap-3">
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-base-300 text-state-need"
          data-glass-surface="tile"
        >
          <lucide-angular
            [img]="icons.folder"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <div>
          <h1
            id="new-project-intake-title"
            class="text-2xl font-semibold"
            tabindex="-1"
          >
            New project
          </h1>
          <p class="text-sm text-base-content-muted">
            For a product you build and ship to your own users. Tell the agent
            what you want to build.
          </p>
        </div>
      </header>
      <ptah-workspace-header [canSwitch]="true" />
      @if (workspaceEmpty() === null) {
        <div
          class="rounded-xl border border-base-300 p-3 text-sm"
          role="status"
        >
          @if (workspaceCheckError()) {
            <p>{{ workspaceCheckError() }}</p>
            <button
              ptahButton
              type="button"
              class="mt-2"
              (click)="retryWorkspaceCheck()"
            >
              Retry folder check
            </button>
          } @else {
            Checking folder contents…
          }
        </div>
      }
      @if (workspaceEmpty() === false && !confirmedNonEmpty()) {
        <div class="rounded-xl border border-warning p-3 text-sm" role="alert">
          <p>
            Folder is not empty. Starting a new project here may use existing
            files.
          </p>
          <button
            type="button"
            class="btn btn-warning btn-sm mt-2"
            (click)="confirmedNonEmpty.set(true)"
          >
            Continue in this folder
          </button>
        </div>
      }
      <form
        class="space-y-4 rounded-[22px] border border-base-300 p-4"
        data-glass-surface="content"
        (ngSubmit)="submit($event)"
        novalidate
      >
        @if (submitted() && errors().length) {
          <div
            role="alert"
            class="rounded-[10px] border border-state-err bg-base-200 p-3 text-sm"
          >
            <p>Check your answers:</p>
            <ul>
              @for (error of errors(); track error) {
                <li>{{ error }}</li>
              }
            </ul>
          </div>
        }
        <div>
          <ptah-field
            label="What are you building?"
            appearance="stacked"
            [required]="true"
          >
            <textarea
              id="project-what"
              name="what"
              ptahTextarea
              [invalid]="whatInvalid()"
              class="min-h-[140px] w-full"
              [ngModel]="what()"
              (ngModelChange)="what.set($event)"
              (blur)="whatTouched.set(true)"
              (paste)="attachments.onPaste($event)"
              (dragover)="$event.preventDefault()"
              (drop)="attachments.onDrop($event)"
              [attr.aria-describedby]="
                whatInvalid()
                  ? 'project-attachment-hint project-what-error'
                  : 'project-attachment-hint'
              "
            ></textarea>
          </ptah-field>
          <ptah-attachment-tray />
          <p
            id="project-attachment-hint"
            class="mt-1 text-xs text-base-content-muted"
          >
            Attachments are not saved if you leave this page
          </p>
          @if (whatInvalid()) {
            <p id="project-what-error" class="text-sm text-state-err">
              Describe what you want to build.
            </p>
          }
        </div>
        <fieldset>
          <legend class="text-sm font-semibold">Who is it for?</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (option of audienceOptions; track option.value) {
              <button
                type="button"
                class="btn btn-sm min-h-9"
                [class.bg-base-content]="audience() === option.value"
                [class.text-base-100]="audience() === option.value"
                [attr.aria-pressed]="audience() === option.value"
                (click)="audience.set(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </fieldset>
        <fieldset>
          <legend class="text-sm font-semibold">Platform</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (option of platformOptions; track option.value) {
              <button
                type="button"
                class="btn btn-sm min-h-9"
                [class.bg-base-content]="platform() === option.value"
                [class.text-base-100]="platform() === option.value"
                [attr.aria-pressed]="platform() === option.value"
                (click)="setPlatform(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </fieldset>
        <fieldset>
          <legend class="text-sm font-semibold">Stack</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (option of stackOptions(); track option.value) {
              <button
                type="button"
                class="btn btn-sm min-h-9"
                [class.bg-base-content]="stack() === option.value"
                [class.text-base-100]="stack() === option.value"
                [attr.aria-pressed]="stack() === option.value"
                (click)="setStack(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          @if (stack() === 'other') {
            <ptah-field
              class="mt-3"
              label="Describe your stack"
              appearance="stacked"
            >
              <input
                id="project-stack-other"
                name="stackOther"
                ptahInput
                size="md"
                [invalid]="otherInvalid()"
                class="w-full"
                [ngModel]="stackOther()"
                (ngModelChange)="stackOther.set($event)"
                (blur)="otherTouched.set(true)"
                [attr.aria-describedby]="
                  otherInvalid() ? 'project-stack-other-error' : null
                "
              />
            </ptah-field>
            @if (otherInvalid()) {
              <p id="project-stack-other-error" class="text-sm text-state-err">
                Enter your stack.
              </p>
            }
          }
        </fieldset>
        <div>
          <ptah-field
            label="Must-haves or constraints (optional)"
            appearance="stacked"
          >
            <textarea
              id="project-constraints"
              name="constraints"
              ptahTextarea
              class="w-full"
              [ngModel]="constraints()"
              (ngModelChange)="constraints.set($event)"
            ></textarea>
          </ptah-field>
        </div>
        <details
          class="rounded-[14px] border border-base-300 p-3"
          data-glass-surface="tile"
        >
          <summary class="cursor-pointer text-sm font-semibold">
            Advanced · provider and model
          </summary>
          <p class="mt-2 text-sm text-base-content-muted">
            The session uses your current provider and model. You can change
            them in the session settings.
          </p>
        </details>
        @if (actionError(); as error) {
          <p role="alert" class="text-sm text-state-err">{{ error }}</p>
        }
        <div class="flex flex-wrap items-center justify-between gap-2">
          <button ptahButton variant="ghost" type="button" (click)="back()">
            Back
          </button>
          <button
            ptahButton
            variant="primary"
            type="submit"
            class="grow sm:grow-0"
            [disabled]="
              starting() ||
              attachments.pendingReads() > 0 ||
              workspaceEmpty() === null ||
              (workspaceEmpty() === false && !confirmedNonEmpty())
            "
          >
            {{ starting() ? 'Starting…' : 'Continue' }}
            <lucide-angular
              [img]="icons.next"
              class="size-4"
              aria-hidden="true"
            />
          </button>
        </div>
      </form>
    </section>
  `,
})
export class NewProjectIntakePage {
  protected readonly icons = { folder: FolderPlus, next: ArrowRight };
  readonly attachments = inject(ComposerAttachmentsService);
  protected readonly launcher = inject(HarnessChatLauncherService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly audienceOptions = NEW_PROJECT_AUDIENCE_OPTIONS;
  protected readonly platformOptions = NEW_PROJECT_PLATFORM_OPTIONS;
  readonly what = signal('');
  readonly audience = signal<NewProjectAudience>('unsure');
  readonly platform = signal<NewProjectPlatform>('node-ts');
  readonly stack = signal<NewProjectStack>('recommend');
  readonly stackOther = signal('');
  readonly constraints = signal('');
  readonly submitted = signal(false);
  readonly whatTouched = signal(false);
  readonly otherTouched = signal(false);
  readonly starting = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly workspaceEmpty = signal<boolean | null>(null);
  readonly workspaceCheckError = signal<string | null>(null);
  readonly confirmedNonEmpty = signal(false);
  private workspaceCheck = 0;
  private lastRoot = this.launcher.workspaceRoot();
  /** Cancels a pending launch when the user leaves this page. */
  private launch: AbortController | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.launch?.abort());
    void this.checkWorkspace(this.lastRoot);
    effect(() => {
      const root = this.launcher.workspaceRoot();
      if (root !== this.lastRoot) {
        this.lastRoot = root;
        this.workspaceEmpty.set(null);
        this.workspaceCheckError.set(null);
        this.confirmedNonEmpty.set(false);
        this.actionError.set(null);
        void this.checkWorkspace(root);
      }
    });
  }

  private async checkWorkspace(root: string): Promise<void> {
    const check = ++this.workspaceCheck;
    this.workspaceCheckError.set(null);
    try {
      const empty = await this.launcher.checkFolderEmpty(root);
      if (!this.destroyRef.destroyed && check === this.workspaceCheck) {
        this.workspaceEmpty.set(empty);
      }
    } catch {
      // degradation-audit: reported - intake offers a retry when the folder check fails.
      if (!this.destroyRef.destroyed && check === this.workspaceCheck) {
        this.workspaceEmpty.set(null);
        this.workspaceCheckError.set('Could not check this folder. Try again.');
      }
    }
  }

  retryWorkspaceCheck(): Promise<void> {
    return this.checkWorkspace(this.launcher.workspaceRoot());
  }

  readonly stackOptions = () => stackOptionsForPlatform(this.platform());
  readonly whatInvalid = () =>
    (this.submitted() || this.whatTouched()) && !this.what().trim();
  readonly otherInvalid = () =>
    (this.submitted() || this.otherTouched()) &&
    this.stack() === 'other' &&
    !this.stackOther().trim();
  readonly errors = () =>
    [
      !this.what().trim() ? 'What are you building is required.' : null,
      this.stack() === 'other' && !this.stackOther().trim()
        ? 'Enter your stack.'
        : null,
    ].filter((value): value is string => !!value);

  setPlatform(value: NewProjectPlatform): void {
    if (value !== this.platform()) {
      this.platform.set(value);
      this.stack.set('recommend');
      this.stackOther.set('');
      this.otherTouched.set(false);
    }
  }

  setStack(value: string): void {
    if (isNewProjectStack(value)) this.stack.set(value);
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.launcher.workspaceRoot() !== this.lastRoot) return;
    if (
      this.workspaceEmpty() === null ||
      (this.workspaceEmpty() === false && !this.confirmedNonEmpty())
    ) {
      return;
    }
    this.submitted.set(true);
    if (
      this.errors().length ||
      this.starting() ||
      this.attachments.pendingReads() > 0
    ) {
      return;
    }
    const intake: NewProjectIntake = {
      what: this.what().trim(),
      audience: this.audience(),
      platform: this.platform(),
      stack: this.stack(),
      ...(this.stack() === 'other'
        ? { stackOther: this.stackOther().trim() }
        : {}),
      ...(this.constraints().trim()
        ? { constraints: this.constraints().trim() }
        : {}),
    };
    this.actionError.set(null);
    this.starting.set(true);
    const snapshot = this.attachments.snapshotForSend();
    const launch = new AbortController();
    this.launch = launch;
    try {
      await this.launcher.launchNewProject(intake, snapshot, {
        signal: launch.signal,
      });
    } catch (cause: unknown) {
      // degradation-audit: reported - a cancelled launch is the user's own Back or
      // page exit, so there is no failure to show. Every other error is shown below.
      if (cause instanceof HarnessChatLaunchCancelledError) return;
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : 'Could not start New Project. Try again.';
      if (!this.destroyRef.destroyed) {
        this.actionError.set(message);
      }
    } finally {
      if (this.launch === launch) this.launch = null;
      if (!this.destroyRef.destroyed) {
        this.starting.set(false);
      }
    }
  }

  async back(): Promise<void> {
    this.launch?.abort();
    await this.router.navigate(['/onboarding']);
  }
}
