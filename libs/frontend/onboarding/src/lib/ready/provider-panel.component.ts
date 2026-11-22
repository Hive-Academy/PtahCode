import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import {
  CLAUDE_CODE_SETUP_DOCS_URL,
  CLAUDE_CODE_SIGN_IN_COMMAND,
  CODEX_SETUP_DOCS_URL,
  codexTerminalLoginCommand,
  onboardingReadyTarget,
} from '@ptah-extension/core';
import { CodexSignInBlockComponent } from '@ptah-extension/chat';
import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clock,
  Download,
  ExternalLink,
  Info,
  ListChecks,
  Loader,
  LogIn,
  LucideAngularModule,
  type LucideIconData,
} from 'lucide-angular';
import { CommandCopyRowComponent } from './command-copy-row.component';
import { ConnectionOptionHeadingComponent } from './connection-option-heading.component';
import type { ConnectionOption, ConnectionRole } from './connection-options';
import { InstallGuideModalComponent } from './install-guide-modal.component';
import type {
  ProviderReadinessView,
  ProviderReadinessState,
} from './provider-readiness.derive';
import { PtahButtonDirective } from '@ptah-extension/ui';

const CHIP: Record<
  ProviderReadinessState,
  { label: string; icon: LucideIconData; tone: string }
> = {
  checking: { label: 'Checking', icon: Loader, tone: 'text-state-run' },
  slow: { label: 'Taking longer', icon: Clock, tone: 'text-state-run' },
  ready: { label: 'Ready', icon: CircleCheck, tone: 'text-state-done' },
  missing: { label: 'Not installed', icon: Download, tone: 'text-state-need' },
  'signed-out': {
    label: 'Not signed in',
    icon: LogIn,
    tone: 'text-state-need',
  },
  stale: { label: 'Sign in again', icon: LogIn, tone: 'text-state-need' },
  error: {
    label: 'Could not check',
    icon: CircleAlert,
    tone: 'text-state-err',
  },
};

@Component({
  selector: 'ptah-provider-panel',
  standalone: true,
  imports: [
    RouterLink,
    NgTemplateOutlet,
    LucideAngularModule,
    CommandCopyRowComponent,
    CodexSignInBlockComponent,
    ConnectionOptionHeadingComponent,
    InstallGuideModalComponent,
    PtahButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section
      class="h-full rounded-[22px] border p-5 max-[480px]:p-4"
      [class.border-primary]="role() === 'main'"
      [class.bg-base-200]="role() === 'main'"
      [class.border-base-300]="role() !== 'main'"
      [class.bg-base-100]="role() !== 'main'"
      [attr.data-testid]="option().panelTestId"
      [attr.data-state]="view().state"
      [attr.aria-busy]="view().state === 'checking' || view().state === 'slow'"
    >
      <header class="flex flex-col gap-3">
        <ptah-connection-option-heading
          [option]="option()"
          [connectionRole]="role()"
          [headingLevel]="2"
        />
        <div
          class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)]"
          data-testid="ready-panel-status-row"
        >
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-base-300 px-2.5 py-0.5 text-xs font-medium"
          [class]="
            role() === 'information' && view().state !== 'ready'
              ? 'text-base-content-muted border-dashed'
              : chip().tone
          "
          data-glass-surface="tile"
          data-testid="ready-panel-status"
        >
          <lucide-angular
            [img]="
              role() === 'information' && view().state !== 'ready'
                ? view().state === 'error'
                  ? icons.info
                  : icons.minus
                : chip().icon
            "
            class="size-4"
            aria-hidden="true"
          />{{ chip().label }}
        </span>
        @if (installVisible()) {
          <button
            ptahButton
            [variant]="role() === 'information' ? 'ghost' : 'outline'"
            type="button"
            aria-haspopup="dialog"
            data-testid="ready-install-open"
            (click)="installOpen.set(true)"
          >
            <lucide-angular
              [img]="icons.install"
              class="size-4"
              aria-hidden="true"
            />How to install
          </button>
        }
        </div>
      </header>
      <dl
        class="mt-4 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm max-[480px]:grid-cols-1 max-[480px]:gap-y-1"
      >
        <dt class="text-base-content-muted">Installed</dt>
        <dd class="min-w-0 [overflow-wrap:anywhere]">
          @if (view().state === 'checking' || view().state === 'slow') {
            <span
              class="skeleton inline-block h-3.5 w-40"
              aria-hidden="true"
            ></span
            ><span class="sr-only">Checking</span>
          } @else if (view().state === 'missing') {
            No <span class="font-mono">{{ commandName() }}</span> command was
            found.
          } @else if (view().path && view().source === 'bundled') {
            <span class="font-mono">Ptah bundled copy: {{ view().path }}</span
            ><br />Yes. Ptah's bundled copy is used.
          } @else if (view().path) {
            <span class="font-mono">{{ view().path }}</span>
          } @else if (view().source === 'installed') {
            Yes. <span class="font-mono">{{ commandName() }}</span> is on your
            PATH.
          } @else {
            Unknown
          }
        </dd>
        <dt class="text-base-content-muted">Version</dt>
        <dd>
          @if (view().state === 'checking' || view().state === 'slow') {
            <span
              class="skeleton inline-block h-3.5 w-16"
              aria-hidden="true"
            ></span>
          } @else {
            <span class="font-mono">{{
              view().version ?? 'Not available'
            }}</span>
          }
        </dd>
        <dt class="text-base-content-muted">Signed in</dt>
        <dd>{{ signedInText() }}</dd>
      </dl>
      @if (helpVisible()) {
        @if (role() === 'information') {
          <details class="mt-5 border-t border-base-300 pt-4">
            <summary class="cursor-pointer text-sm">
              Help with {{ name() }}
            </summary>
            <ng-container [ngTemplateOutlet]="help" />
          </details>
        } @else {
          <ng-container [ngTemplateOutlet]="help" />
        }
      }
      <ng-template #help>
        @if (view().provider === 'claude-cli') {
          @switch (view().state) {
            @case ('signed-out') {
              <div
                class="mt-5 border-t border-base-300 pt-4"
                data-testid="ready-sign-in-block"
              >
                <h3 class="font-semibold">Sign in to Claude Code</h3>
                <p class="mt-1 text-sm text-base-content-muted">
                  Run this in a terminal and follow the browser prompts. Claude
                  Code needs a Pro, Max, Team, Enterprise or Console account.
                  Then press Re-check.
                </p>
                <p class="mt-3 text-xs text-base-content-muted">Terminal</p>
                <ptah-command-copy-row
                  class="mt-1"
                  [command]="signInCommand"
                  copyLabel="Copy sign-in command"
                />
                <p class="mt-4 text-sm text-base-content-muted">
                  Prefer a separate Claude account for Ptah?
                  <a
                    class="link"
                    [routerLink]="accountsLink.commands"
                    [queryParams]="accountsLink.queryParams"
                    data-testid="ready-named-account-link"
                    >Add a named account in Providers</a
                  >. The check above still reads your main Claude Code login.
                </p>
              </div>
            }
            @case ('error') {
              <div
                class="mt-5 border-t border-base-300 pt-4"
                data-testid="ready-error-block"
              >
                <h3 class="font-semibold">Ptah could not read Claude Code</h3>
                <p class="mt-1 text-sm text-base-content-muted">
                  @if (view().errorCause === 'timeout') {
                    The check timed out.
                  }
                  This is not the same as being signed out. Press Re-check. If
                  it keeps failing, run
                  <span class="font-mono">claude doctor</span>
                  in a terminal.
                </p>
                <details class="mt-3 text-sm">
                  <summary class="cursor-pointer">
                    Install or sign in by hand
                  </summary>
                  <p class="mt-2 text-base-content-muted">
                    Install guide and sign-in steps are in the official docs.
                  </p>
                  <a
                    ptahButton
                    variant="ghost"
                    class="mt-1"
                    [href]="docsUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="ready-docs-link"
                  >
                    Open the official install guide
                    <lucide-angular
                      [img]="icons.externalLink"
                      class="size-4"
                      aria-hidden="true"
                    />
                  </a>
                </details>
              </div>
            }
          }
        } @else if (view().provider === 'antigravity-cli') {
          @if (view().state === 'signed-out') {
            <div
              class="mt-5 border-t border-base-300 pt-4"
              data-testid="ready-sign-in-block"
            >
              <h3 class="font-semibold">Sign in to {{ name() }}</h3>
              <p class="mt-1 text-sm text-base-content-muted">
                Run this once in a terminal and follow the prompts to sign in
                with your Google account. Then press Re-check.
              </p>
              <p class="mt-3 text-xs text-base-content-muted">Terminal</p>
              <ptah-command-copy-row
                class="mt-1"
                [command]="commandName()"
                copyLabel="Copy Antigravity sign-in command"
              />
            </div>
          } @else if (view().state === 'error') {
            <div
              class="mt-5 border-t border-base-300 pt-4"
              data-testid="ready-error-block"
            >
              <h3 class="font-semibold">Ptah could not check {{ name() }}</h3>
              <p class="text-sm text-base-content-muted">
                This is not the same as being signed out. Press Re-check.
              </p>
            </div>
          }
        } @else {
          @if (showCodexSignIn()) {
            <div
              class="mt-5 border-t border-base-300 pt-4"
              data-testid="ready-sign-in-block"
            >
              <h3 class="font-semibold">
                {{
                  view().state === 'stale'
                    ? 'Sign in to Codex again'
                    : 'Sign in to Codex'
                }}
              </h3>
              <ptah-codex-sign-in-block
                layout="panel"
                [connectionRole]="role() === 'main' ? 'chosen' : 'information'"
                [terminalCommand]="terminalCommand()"
                [bundledNote]="view().source === 'bundled'"
                [executablePath]="view().path"
              />
            </div>
          } @else if (view().state === 'error') {
            <div
              class="mt-5 border-t border-base-300 pt-4"
              data-testid="ready-error-block"
            >
              <h3 class="font-semibold">
                {{
                  view().errorCause === 'home'
                    ? 'Ptah could not read the Codex home folder'
                    : 'Ptah could not check Codex'
                }}
              </h3>
              <p class="text-sm text-base-content-muted">
                This is not the same as being signed out. Press Re-check.
              </p>
              <a
                class="link text-sm"
                [href]="codexDocsUrl"
                target="_blank"
                rel="noopener noreferrer"
                >Open the official Codex guide</a
              >
            </div>
          }
        }
      </ng-template>
      @if (installVisible()) {
        <ptah-install-guide-modal
          [option]="option()"
          [open]="installOpen()"
          (closed)="installOpen.set(false)"
          (recheck)="onInstallRecheck()"
        />
      }
    </section>
  `,
})
export class ProviderPanelComponent {
  readonly option = input.required<ConnectionOption>();
  readonly view = input.required<ProviderReadinessView>();
  readonly role = input.required<ConnectionRole>();
  readonly platform = input.required<string>();
  /** Re-check was pressed inside the install dialog. */
  readonly recheck = output<void>();
  protected readonly icons = {
    externalLink: ExternalLink,
    info: Info,
    minus: CircleMinus,
    install: ListChecks,
  } as const;
  protected readonly chip = computed(() => CHIP[this.view().state]);
  protected readonly name = computed(() => this.option().name);
  protected readonly commandName = computed(() => this.option().commandName);
  /** The install dialog is open. */
  protected readonly installOpen = signal(false);
  /** The provider is not installed, so "How to install" is offered. */
  protected readonly installVisible = computed(
    () => this.view().state === 'missing' && this.view().source !== 'bundled',
  );
  protected readonly docsUrl = CLAUDE_CODE_SETUP_DOCS_URL;
  protected readonly signInCommand = CLAUDE_CODE_SIGN_IN_COMMAND;
  protected readonly accountsLink = {
    commands: [
      '/onboarding',
      ...onboardingReadyTarget('settings', 'providers', 'claude-accounts')
        .subPath,
    ],
    queryParams: onboardingReadyTarget(
      'settings',
      'providers',
      'claude-accounts',
    ).queryParams,
  };
  protected readonly codexDocsUrl = CODEX_SETUP_DOCS_URL;
  protected readonly terminalCommand = computed(() => {
    const view = this.view();
    return view.path && view.source
      ? codexTerminalLoginCommand(
          { path: view.path, source: view.source },
          this.platform(),
        )
      : null;
  });
  protected readonly showCodexSignIn = computed(
    () =>
      (this.view().state === 'signed-out' || this.view().state === 'stale') &&
      this.view().errorCause !== 'home' &&
      this.view().errorCause !== 'unreadable',
  );
  protected readonly helpVisible = computed(
    () =>
      this.view().state === 'signed-out' ||
      this.view().state === 'stale' ||
      this.view().state === 'error',
  );
  protected readonly signedInText = computed(() => {
    const v = this.view(),
      name = this.name();
    if (v.state === 'checking' || v.state === 'slow') return 'Checking';
    if (v.state === 'ready')
      return v.provider === 'claude-cli'
        ? 'Yes. Your Claude account is connected.'
        : `Yes. ${name} is signed in.`;
    if (v.state === 'missing') return `Install ${name} first.`;
    if (v.state === 'signed-out') return `No. Sign in to use ${name}.`;
    if (v.state === 'stale')
      return 'Your Codex sign-in has expired. Sign in again.';
    if (v.errorCause === 'home')
      return 'Ptah could not read the Codex home folder, so no sign-in was found. This is not the same as being signed out.';
    if (v.errorCause === 'unreadable' && v.provider === 'openai-codex')
      return 'Ptah could not read the Codex sign-in data.';
    if (v.failedFact === 'sign-in')
      return v.errorCause === 'timeout'
        ? `${name} did not answer the sign-in check in time. Your sign-in could not be read.`
        : `Ptah could not read your ${name} sign-in.`;
    return v.errorCause === 'timeout'
      ? `${name} did not answer in time. Your sign-in could not be read.`
      : `Ptah could not ask this computer about ${name}.`;
  });
  /** Close the dialog first, so focus returns to its opener, then re-read. */
  protected onInstallRecheck(): void {
    this.installOpen.set(false);
    this.recheck.emit();
  }
}
