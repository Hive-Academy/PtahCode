import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ArrowRight, LucideAngularModule, Users } from 'lucide-angular';
import {
  AttachmentTrayComponent,
  ComposerAttachmentsService,
} from '@ptah-extension/chat';
import {
  HarnessChatLaunchCancelledError,
  HarnessChatLauncherService,
} from '../launcher/harness-chat-launcher.service';
import { WorkspaceHeaderComponent } from '../shell/workspace-header.component';

@Component({
  selector: 'ptah-team-builder-start-page',
  standalone: true,
  imports: [
    FormsModule,
    AttachmentTrayComponent,
    WorkspaceHeaderComponent,
    LucideAngularModule,
  ],
  providers: [ComposerAttachmentsService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mx-auto max-w-[760px] space-y-5 p-4"
      aria-labelledby="team-builder-start-title"
      data-testid="team-builder-start"
    >
      <header class="flex items-center gap-3">
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-base-300 text-state-need"
          data-glass-surface="tile"
        >
          <lucide-angular
            [img]="icons.users"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <div>
          <h1
            id="team-builder-start-title"
            class="text-2xl font-semibold"
            tabindex="-1"
          >
            AI team builder
          </h1>
          <p class="text-sm text-base-content-muted">
            Describe the team you want. The agent proposes it.
          </p>
        </div>
      </header>
      <ptah-workspace-header [canSwitch]="true" />
      <form
        class="space-y-4 rounded-[22px] border border-base-300 p-4"
        data-glass-surface="content"
        (ngSubmit)="submit($event)"
        novalidate
      >
        <p class="text-xs text-base-content-muted">
          Workspace
          <span class="font-mono">{{
            launcher.workspaceRoot() || 'Open a workspace'
          }}</span>
        </p>
        <div>
          <label for="team-intent" class="block text-sm font-semibold"
            >What should the team do?</label
          ><textarea
            id="team-intent"
            name="intent"
            class="textarea textarea-bordered mt-2 min-h-[140px] w-full"
            [ngModel]="intent()"
            (ngModelChange)="intent.set($event)"
            (blur)="touched.set(true)"
            (paste)="attachments.onPaste($event)"
            (dragover)="$event.preventDefault()"
            (drop)="attachments.onDrop($event)"
            [attr.aria-invalid]="invalid() ? true : null"
            [attr.aria-describedby]="
              invalid()
                ? 'team-attachment-hint team-intent-error'
                : 'team-attachment-hint'
            "
          ></textarea>
          <ptah-attachment-tray />
          <p
            id="team-attachment-hint"
            class="mt-1 text-xs text-base-content-muted"
          >
            Required. Attachments are not saved if you leave this page.
          </p>
          @if (invalid()) {
            <p id="team-intent-error" class="text-sm text-state-err">
              Describe the team you want.
            </p>
          }
        </div>
        <details
          class="rounded-[14px] border border-base-300 p-3"
          data-glass-surface="tile"
        >
          <summary class="cursor-pointer text-sm font-semibold">
            Advanced · provider and model
          </summary>
          <p class="mt-2 text-sm text-base-content-muted">
            The session uses your current provider and model.
          </p>
        </details>
        @if (actionError(); as error) {
          <p role="alert" class="text-sm text-state-err">{{ error }}</p>
        }
        <div class="flex flex-wrap items-center justify-between gap-2">
          <button type="button" class="btn btn-ghost" (click)="back()">
            Back
          </button>
          <button
            type="submit"
            class="btn btn-primary grow sm:grow-0"
            [disabled]="starting() || attachments.pendingReads() > 0"
          >
            {{ starting() ? 'Starting…' : 'Start team builder' }}
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
export class TeamBuilderStartPage {
  protected readonly icons = { users: Users, next: ArrowRight };
  readonly attachments = inject(ComposerAttachmentsService);
  protected readonly launcher = inject(HarnessChatLauncherService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  /** Cancels a pending launch when the user leaves this page. */
  private launch: AbortController | null = null;
  readonly intent = signal('');
  readonly touched = signal(false);
  readonly submitted = signal(false);
  readonly starting = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly invalid = () =>
    (this.submitted() || this.touched()) && !this.intent().trim();

  constructor() {
    this.destroyRef.onDestroy(() => this.launch?.abort());
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    if (
      this.invalid() ||
      this.starting() ||
      this.attachments.pendingReads() > 0
    ) {
      return;
    }
    this.actionError.set(null);
    this.starting.set(true);
    const snapshot = this.attachments.snapshotForSend();
    const launch = new AbortController();
    this.launch = launch;
    try {
      await this.launcher.launchTeamBuilder(this.intent().trim(), snapshot, {
        signal: launch.signal,
      });
    } catch (cause: unknown) {
      // The user left the page on purpose. There is no failure to show.
      if (cause instanceof HarnessChatLaunchCancelledError) return;
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : 'Could not start the team builder. Try again.';
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
