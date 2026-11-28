import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  LucideAngularModule,
  X,
} from 'lucide-angular';
import {
  NativePopoverComponent,
  ProviderMarkComponent,
  ProviderModelPickerComponent,
  PtahButtonDirective,
  PtahBadgeDirective,
  PtahFieldComponent,
  PtahFieldGridDirective,
  PtahIconButtonDirective,
  PtahInputDirective,
  SetupActionDirective,
  type ProviderIdentityOption,
  type ProviderModelSelection,
} from '@ptah-extension/ui';
import {
  AppStateManager,
  ProvidersSettingsStateService,
  WorkspaceScopeService,
  type ProvidersEditContext,
  type ProvidersSettingsPatch,
} from '@ptah-extension/core';
import type { ModelPair } from '@ptah-extension/shared';
import {
  SettingsSaveFeedbackService,
  settingNotSavedMessage,
} from '../feedback/settings-save-feedback.service';
import {
  SettingScopeRowComponent,
  type SettingScopeDisplay,
} from './setting-scope-row.component';
import {
  buildConsumerRows,
  consumerPatch,
  formatProviderDisplayName,
  inheritedConsumerProvider,
  providerReadiness,
  setupModelIssue,
  type ProviderConsumerId,
  type BackgroundConsumerRow,
  type SettingsPatchConsumerId,
} from './provider-consumer-rows';
import { settingsProviderConnections } from './provider-connection-options';
import { DecisionModelRowComponent } from './decision-model-row.component';
import { DRAWER_WRITE_NO_CONTEXT } from './connection-drawer/drawer-write';
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
const ACTION = `btn btn-ghost btn-sm px-2 text-xs font-medium text-base-content underline underline-offset-2 ${FOCUS}`;
const CELL = `flex w-full min-w-0 items-center justify-between gap-2 text-left ${FOCUS}`;
const SAVE_SCOPE = 'global';
// Matches the ENHANCE_TIMEOUT_* values in file-settings-keys.ts.
const TIMEOUT_MIN_SEC = 15;
const TIMEOUT_MAX_SEC = 600;
const TIMEOUT_DEFAULT_SEC = 120;
@Component({
  selector: 'ptah-provider-consumer-assignments',
  standalone: true,
  imports: [
    DecisionModelRowComponent,
    LucideAngularModule,
    NativePopoverComponent,
    PtahBadgeDirective,
    PtahFieldComponent,
    PtahFieldGridDirective,
    ProviderMarkComponent,
    ProviderModelPickerComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInputDirective,
    SettingScopeRowComponent,
    SetupActionDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="background-layout grid min-w-0 items-start gap-[var(--ptah-gap-field)]"
      data-testid="provider-consumer-assignments"
    >
      <header class="space-y-0.5">
        <h2
          class="text-base font-semibold text-base-content"
          data-testid="assignments-heading"
        >
          Background models
        </h2>
        <p
          class="text-xs text-base-content-muted"
          data-testid="assignments-copy"
        >
          Small jobs that run outside the chat. A fast model keeps them cheap.
        </p>
        <span ptahBadge size="xs">{{ rows().length + 1 }} roles</span>
      </header>
      <div
        class="consumer-grid grid min-w-0 gap-[var(--ptah-gap-field)]"
        aria-label="Background model roles"
        data-testid="consumer-table"
      >
        @for (row of rows(); track row.id) {
          <article
            [attr.data-testid]="'consumer-row-' + row.id"
            [class.border-primary]="activeEditId() === row.id"
            class="consumer-role grid min-w-0 items-center border-b border-base-content/10"
          >
            <div class="min-w-0">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h3
                  class="text-sm font-medium text-base-content"
                  [attr.data-testid]="'consumer-name-' + row.id"
                >
                  {{ row.name }}
                </h3>
                <span
                  ptahBadge
                  class="shrink-0 whitespace-nowrap"
                  [attr.data-testid]="'consumer-tier-' + row.id"
                  >{{ row.tierLabel }}</span
                >
              </div>
              @if (row.helperCopy) {
                <p
                  class="mt-[var(--ptah-gap-label)] text-sm leading-snug text-base-content-muted"
                  [title]="row.helperCopy"
                  [attr.data-testid]="'consumer-helper-' + row.id"
                >
                  {{ row.helperCopy }}
                </p>
              } @else {
                <p
                  class="mt-[var(--ptah-gap-label)] text-sm leading-snug text-base-content-muted"
                >
                  Keeps useful context for future chats.
                </p>
              }
            </div>
            @if (!row.loaded) {
              <!-- Not loaded: no effective value renders, only the section's state and its own Retry. -->
              <div
                class="mt-auto flex flex-wrap items-center gap-1.5"
                [attr.data-testid]="'consumer-notloaded-' + row.id"
              >
                <span
                  class="text-xs text-base-content"
                  [attr.data-testid]="'consumer-notloaded-copy-' + row.id"
                >
                  {{
                    row.sectionStatus === 'loading'
                      ? 'Loading…'
                      : 'Could not load this section. Retry.'
                  }}
                </span>
                @if (row.sectionStatus !== 'loading') {
                  <button
                    type="button"
                    [class]="action"
                    [attr.aria-label]="'Retry loading ' + row.name"
                    [disabled]="busy()"
                    (click)="retrySection(row.retryKey)"
                    [attr.data-testid]="'consumer-retry-' + row.id"
                  >
                    Retry
                  </button>
                }
              </div>
            } @else {
              <div ptahFieldGrid minColumn="md" class="min-w-0">
                <ptah-native-popover
                  class="consumer-cell-popover block w-full min-w-0"
                  [isOpen]="activeEditId() === row.id"
                  placement="bottom-start"
                  [hasBackdrop]="true"
                  backdropClass="transparent"
                  (opened)="onPopoverOpened(row.id)"
                  (closed)="cancelEdit()"
                >
                  <button
                    trigger
                    ptahButton
                    variant="outline"
                    align="start"
                    size="sm"
                    type="button"
                    [class]="cell + (row.followsMain ? ' font-medium' : '')"
                    [attr.aria-disabled]="(row.id === 'setup' ? setupActionsDisabled() : busy()) ? 'true' : null"
                    [attr.aria-label]="
                      row.name + ': ' + row.resolvedSummary + '. Reassign'
                    "
                    [attr.aria-expanded]="activeEditId() === row.id"
                    [title]="row.resolvedSummary"
                    aria-haspopup="dialog"
                    (click)="toggleEdit(row.id)"
                    [attr.data-testid]="'consumer-edit-' + row.id"
                  >
                    <ptah-provider-mark
                      [providerId]="
                        row.id === 'setup'
                          ? setupDisplayProvider()
                           : row.fallbackProvider?.id || row.provider || inheritedProvider()?.id || ''
                      "
                      fallback="Bot"
                      size="sm"
                    />
                    <span
                      class="min-w-0 flex-1 truncate text-left"
                      [attr.data-testid]="'consumer-summary-' + row.id"
                      >{{ row.cellLabel }}</span
                    >
                    <lucide-angular
                      [img]="ChevronIcon"
                      class="h-3 w-3 shrink-0 text-base-content-muted"
                      aria-hidden="true"
                    />
                  </button>
                  @if (activeEditId() === row.id) {
                    <!-- The picker's own header (the role name) is the visible title; Close sits in its empty right corner. -->
                    <div
                      content
                      role="dialog"
                      [attr.aria-label]="'Reassign ' + row.name"
                      class="relative w-[27rem] max-w-[calc(100vw-2rem)] space-y-2 whitespace-normal text-left text-xs [overflow-wrap:anywhere]"
                      [attr.data-testid]="'consumer-editor-' + row.id"
                    >
                      <span class="absolute right-2 top-1 z-10">
                        <button
                          type="button"
                          ptahIconButton
                          label="Close"
                          (click)="cancelEdit()"
                          [attr.data-testid]="'consumer-close-' + row.id"
                        >
                          <lucide-angular
                            [img]="CloseIcon"
                            class="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </button>
                      </span>
                      @let fallback = currentDraft().provider === row.provider ? row.fallbackProvider : null;
                      @if (fallback) {
                        <p role="status" class="px-[var(--ptah-space-2)] text-base-content-muted" data-testid="saved-provider-fallback">
                          The saved {{ providerName(row.provider) }} override is unavailable.
                          Memory curation uses {{ fallback.name }} until the override is available.
                        </p>
                      }
                      <ptah-provider-model-picker
                        [label]="row.name"
                        [provider]="currentDraft().provider"
                        [model]="currentDraft().model"
                        [inheritedProvider]="row.id === 'setup' ? null : inheritedProvider()"
                        [savedProviderFallback]="fallback?.id ?? ''"
                        [defaultTier]="row.defaultTier"
                        [richSelect]="true"
                        [requiresToolUse]="row.requiresToolUse"
                        [connectedProviders]="extraProviders()"
                        [excludedProviders]="row.unsupportedProviders"
                        [disabled]="
                          row.id === 'setup'
                            ? setupActionsDisabled()
                            : disabled() || (busy() && !assignmentSaving())
                        "
                        (selectionChange)="onDraftChange(row.id, $event)"
                        [attr.data-testid]="'picker-' + row.id"
                      />
                      @if (state.connections().status === 'ready' && !extraProviders().length) {
                        <p role="status">No providers connected.</p>
                        <button type="button" ptahButton variant="link" size="sm" (click)="connectProvider()">
                          Connect a provider
                        </button>
                      }
                      @if (row.id !== 'setup' && !currentDraft().provider && state.route().status === 'loading') {
                        <p role="status" class="px-[var(--ptah-space-2)] text-base-content-muted">Resolving the active provider…</p>
                      }
                      @if (!fallback && draftProviderReadiness(); as readiness) {
                        <div
                          class="flex flex-wrap items-center gap-1.5 rounded border border-base-content/10 p-2"
                          [attr.role]="readiness.blocking ? 'alert' : 'status'"
                          [attr.data-testid]="'readiness-alert-' + row.id"
                        >
                          <lucide-angular
                            [img]="AlertTriangleIcon"
                            class="h-3.5 w-3.5 shrink-0 text-warning"
                            aria-hidden="true"
                          />
                          <span
                            class="min-w-0 flex-1 text-base-content"
                            [attr.data-testid]="'readiness-message-' + row.id"
                          >
                            {{ readiness.message
                            }}{{ readiness.blocking ? ' Not saved.' : '' }}
                          </span>
                          @if (readiness.setupProviderId !== null) {
                            <button
                              type="button"
                              [class]="action"
                              [attr.aria-label]="
                                'Set up ' + readiness.providerDisplayName
                              "
                              (click)="
                                onSetupProvider(readiness.setupProviderId)
                              "
                              [attr.data-testid]="'readiness-setup-' + row.id"
                            >
                              Set up {{ readiness.providerDisplayName }}
                            </button>
                          }
                        </div>
                      }
                      @if (row.id === 'setup') {
                        <p class="px-[var(--ptah-space-1)] text-xs text-base-content-muted">
                          Choose a provider and model, then save them together.
                          @if (row.provider || row.model) {
                            Clearing the pair switches Setup to the workspace model.
                          }
                        </p>
                        <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)]">
                          <button
                            type="button"
                            ptahButton
                            variant="primary"
                            [disabled]="setupActionsDisabled() || !setupDraftComplete()"
                            (click)="saveSetupDraft()"
                            data-testid="setup-save"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            ptahButton
                            variant="outline"
                            [disabled]="setupActionsDisabled()"
                            (click)="commitSetup(null)"
                            [attr.data-testid]="row.provider || row.model ? 'setup-clear' : 'setup-use-workspace'"
                          >
                            {{ row.provider || row.model ? 'Clear' : 'Use workspace model' }}
                          </button>
                        </div>
                        @let commit = state.setupCommit();
                        @if (commit.status === 'saving' || commit.status === 'invalid' || commit.status === 'failed') {
                          <p
                            class="px-[var(--ptah-space-1)] text-xs text-base-content"
                            [attr.role]="commit.status === 'saving' ? 'status' : 'alert'"
                            data-testid="setup-commit-feedback"
                          >
                            {{ commit.status === 'saving' ? 'Saving Setup model…' : commit.message }}
                          </p>
                        }
                      } @else {
                        <p class="px-1 text-xs text-base-content-muted">
                          Each choice saves at once, with Undo. No provider
                          follows the main agent.
                        </p>
                      }
                    </div>
                  }
                </ptah-native-popover>
                @if (row.id === 'setup') {
                  @if (setupIssue(); as issue) {
                    <div class="flex flex-wrap items-center gap-[calc(var(--ptah-space-1)*1.5)] rounded border border-base-content/10 p-[var(--ptah-space-2)] text-xs">
                      <span class="min-w-0 basis-full" role="alert" data-testid="setup-model-issue">
                        {{ issue.message }}
                      </span>
                      @switch (issue.action) {
                        @case ('sign-in') {
                          @if (issue.provider; as provider) {
                            <button
                              type="button"
                              ptahSetupAction="ghostLink"
                              [disabled]="setupActionsDisabled()"
                              (click)="onSetupProvider(provider)"
                              data-testid="readiness-setup-setup"
                            >
                              Set up {{ providerName(provider) }}
                            </button>
                          }
                        }
                        @case ('retry') {
                          <button
                            type="button"
                            ptahSetupAction="ghostLink"
                            [disabled]="setupActionsDisabled()"
                            (click)="retrySection('setup')"
                          >
                            Retry loading Setup
                          </button>
                        }
                        @default {
                          <button
                            type="button"
                            ptahSetupAction="ghostLink"
                            [disabled]="setupActionsDisabled()"
                            (click)="chooseSetupPart(issue.action === 'provider' ? 'provider' : 'model')"
                          >
                            {{ issue.action === 'provider' ? 'Choose a provider' : 'Choose a model' }}
                          </button>
                        }
                      }
                      @if (issue.canUseWorkspace) {
                        <button
                          type="button"
                          ptahSetupAction="ghostLink"
                          [disabled]="setupActionsDisabled()"
                          (click)="commitSetup(null)"
                          data-testid="setup-use-workspace"
                        >
                          Use workspace model
                        </button>
                      }
                    </div>
                  } @else if (row.followsMain) {
                    <p class="text-xs text-base-content-muted">
                      No Setup model is chosen, so setup uses the workspace provider and its selected model.
                    </p>
                  }
                  @let setupCommit = state.setupCommit();
                  @if (setupCommit.status !== 'idle' && activeEditId() !== 'setup') {
                    <div class="flex flex-wrap items-center gap-[calc(var(--ptah-space-1)*1.5)] rounded border border-base-content/10 p-[var(--ptah-space-2)] text-xs">
                      <span
                        class="min-w-0 flex-1"
                        [attr.role]="setupCommit.status === 'invalid' || setupCommit.status === 'failed' ? 'alert' : 'status'"
                        data-testid="setup-commit-feedback"
                      >
                        {{ setupCommit.status === 'saving' ? 'Saving Setup model…' : setupCommit.message }}
                      </span>
                      @if (setupCommit.status === 'saved' && state.setupUndoEntry()) {
                        <button
                          type="button"
                          ptahSetupAction="ghostLink"
                          [disabled]="setupActionsDisabled()"
                          aria-label="Undo Setup model change"
                          (click)="commitSetup('undo')"
                          data-testid="setup-undo"
                        >
                          Undo
                        </button>
                      }
                    </div>
                  }
                }
                @if (row.scopeShown) {
                  <ptah-setting-scope-row
                    [fieldName]="row.providerFieldName"
                    [scope]="row.providerScope"
                    [hasOverride]="row.providerOverride"
                    [supportedTargets]="['global']"
                    [disabled]="disabled()"
                    [attr.data-testid]="'scope-row-provider-' + row.id"
                  />
                  <ptah-setting-scope-row
                    [fieldName]="row.modelFieldName"
                    [scope]="row.modelScope"
                    [hasOverride]="row.modelOverride"
                    [supportedTargets]="['global']"
                    [disabled]="disabled()"
                    [attr.data-testid]="'scope-row-model-' + row.id"
                  />
                }
                @if (row.sectionStatus === 'error') {
                  <!-- Loaded earlier; the latest refresh failed, so the values may be stale. -->
                  <span
                    class="text-xs text-base-content"
                    [attr.data-testid]="'consumer-reload-' + row.id"
                  >
                    <span [attr.data-testid]="'consumer-reload-copy-' + row.id"
                      >Could not load this section. Retry.</span
                    >
                    <button
                      type="button"
                      [class]="action"
                      [attr.aria-label]="'Retry loading ' + row.name"
                      [disabled]="busy()"
                      (click)="retrySection(row.retryKey)"
                      [attr.data-testid]="'consumer-retry-' + row.id"
                    >
                      Retry
                    </button>
                  </span>
                }
              </div>
            }
          </article>
          @if (row.id === 'enhancement' && timeoutMeta() !== null) {
            <section
              class="consumer-timeout-section space-y-1.5 rounded-lg border border-base-content/10 p-3"
              data-testid="enhancement-timeout-section"
            >
              @if (timeoutNotice(); as notice) {
                <div
                  class="flex flex-wrap items-center gap-1.5 border-b border-base-content/10 p-1.5"
                  role="alert"
                  data-testid="timeout-notice-alert"
                >
                  <lucide-angular
                    [img]="ClockIcon"
                    class="h-3.5 w-3.5 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span
                    class="text-xs text-base-content"
                    data-testid="timeout-notice-text"
                    >Enhancement stopped after {{ notice.seconds }} seconds. No
                    changes were saved.</span
                  >
                  <button
                    type="button"
                    [class]="action"
                    (click)="retryEnhancementRequested.emit()"
                    data-testid="timeout-retry-button"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    [class]="action"
                    (click)="editTimeout()"
                    data-testid="timeout-change-limit-button"
                  >
                    Change time limit
                  </button>
                </div>
              }
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="text-xs font-semibold text-base-content"
                  >Enhancement time limit</span
                >
                <span class="text-xs text-base-content-muted"
                  >Maximum time allowed for one enhancement attempt.</span
                >
                <span
                  ptahBadge
                  appearance="outline"
                  tone="warn"
                  class="whitespace-nowrap font-mono"
                  data-testid="timeout-effective-display"
                  >Time limit: {{ timeoutEffectiveSec() }} seconds</span
                >
                @if (!isEditingTimeout()) {
                  <button
                    type="button"
                    [class]="action"
                    [disabled]="busy() || disabled()"
                    aria-label="Edit Enhancement time limit"
                    (click)="editTimeout()"
                    data-testid="timeout-edit-button"
                  >
                    Edit limit
                  </button>
                }
                <ptah-setting-scope-row
                  [fieldName]="'Enhancement time limit'"
                  [scope]="timeoutScope()"
                  [hasOverride]="timeoutOverride()"
                  [supportedTargets]="['global']"
                  [disabled]="disabled()"
                  data-testid="scope-row-timeout"
                />
              </div>
              @if (isEditingTimeout()) {
                <div class="space-y-1" data-testid="timeout-editor">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <ptah-field
                      label="Time limit (sec)"
                      size="sm"
                      class="w-36 shrink-0"
                    >
                      <input
                        ptahInput
                        size="sm"
                        #timeoutInput
                        id="enhance-timeout-input"
                        type="number"
                        aria-label="Enhancement time limit in seconds"
                        class="w-full text-sm text-base-content"
                        [min]="timeoutMinSec()"
                        [max]="timeoutMaxSec()"
                        [value]="timeoutDraftSec()"
                        [disabled]="busy() || disabled()"
                        (input)="onTimeoutInput($event)"
                        data-testid="timeout-input"
                      />
                    </ptah-field>
                    <span class="text-xs text-base-content">seconds</span>
                    <button
                      type="button"
                      ptahButton
                      variant="primary"
                      [busy]="busy()"
                      [disabled]="isTimeoutSaveBlocked()"
                      aria-label="Save Enhancement time limit"
                      (click)="saveTimeout()"
                      data-testid="timeout-save-button"
                    >
                      Save limit
                    </button>
                    <button
                      type="button"
                      [class]="action"
                      [disabled]="busy() || disabled()"
                      aria-label="Cancel editing Enhancement time limit"
                      (click)="cancelTimeoutEdit()"
                      data-testid="timeout-cancel-button"
                    >
                      Cancel
                    </button>
                  </div>
                  <p
                    class="text-xs text-base-content-muted"
                    data-testid="timeout-range-helper"
                  >
                    Allowed: {{ timeoutMinSec() }}–{{ timeoutMaxSec() }} seconds
                    (default {{ timeoutDefaultSec() }} seconds). Maximum time
                    allowed for one enhancement attempt.
                  </p>
                  @if (timeoutValidationError(); as err) {
                    <p
                      class="text-xs text-base-content"
                      role="alert"
                      data-testid="timeout-validation-error"
                    >
                      {{ err }}
                    </p>
                  }
                </div>
              }
            </section>
          }
        }
        <!-- The seventh role (TASK_2026_646 Req 1): its own component, reading agent:getConfig. -->
        <ptah-decision-model-row
          [disabled]="disabled()"
          [providers]="extraProviders()"
          (setupProviderRequested)="onSetupProvider($event)"
        />
      </div>
    </section>
  `,
  styles: `
    /* An inline host cannot be a size container; without display: block the column queries never match. */
    :host {
      display: block;
      container-type: inline-size;
    }
    .consumer-role {
      gap: var(--ptah-gap-field);
      min-height: 5.5rem;
      padding-bottom: var(--ptah-gap-field);
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .consumer-role > [ptahFieldGrid] {
      grid-template-columns: minmax(0, 1fr);
    }
    @container (max-width: 400px) {
      .consumer-role {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @container (min-width: 761px) {
      .background-layout {
        grid-template-columns: minmax(16rem, 1fr) minmax(24rem, 2fr);
      }
    }
    /* The popover wraps its trigger in an inline-block sized by its content, so the summary could not truncate and
       overflowed a one-third card. Block width lets the cell's label truncate (its full text is the title). */
    :host ::ng-deep .consumer-cell-popover > .popover-trigger {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .consumer-timeout-section {
      grid-column: 1 / -1;
      order: 1;
    }
  `,
})
export class ProviderConsumerAssignmentsComponent {
  protected readonly state = inject(ProvidersSettingsStateService);
  private readonly appState = inject(AppStateManager);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly workspace = inject(WorkspaceScopeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly AlertTriangleIcon = AlertTriangle;
  protected readonly ClockIcon = Clock;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly CloseIcon = X;
  protected readonly focusRing = FOCUS;
  protected readonly action = ACTION;
  protected readonly cell = CELL;
  protected readonly providerName = formatProviderDisplayName;
  readonly timeoutNotice = input<{ seconds: number } | null>(null);
  readonly disabled = input<boolean>(false);
  readonly initialEditingConsumerId = input<ProviderConsumerId | null>(null);
  readonly setupProviderRequested = output<string>();
  readonly deepLinkOpened = output<ProviderConsumerId>();
  readonly retryEnhancementRequested = output<void>();
  readonly assignmentSaved = output<{
    id: SettingsPatchConsumerId;
    provider: string;
    model: string;
  }>();
  readonly timeoutSaved = output<number>();
  protected readonly activeEditId = signal<ProviderConsumerId | null>(null);
  protected readonly currentDraft = signal<ModelPair>(
    { provider: '', model: '' },
  );
  protected readonly assignmentSaving = signal(false);
  protected readonly isEditingTimeout = signal<boolean>(false);
  protected readonly timeoutDraftSec = signal<number>(0);
  private readonly timeoutInputRef =
    viewChild<ElementRef<HTMLInputElement>>('timeoutInput');
  private readonly popovers = viewChildren(NativePopoverComponent);
  private readonly pickers = viewChildren(ProviderModelPickerComponent);
  private readonly openPopover = computed(() =>
    this.popovers().find((popover) => popover.isOpen()),
  );
  private appliedDeepLinkId: ProviderConsumerId | null = null;
  private readonly setupFocusTarget = signal<'cell' | 'provider' | 'model' | null>(null);
  private context: ProvidersEditContext | null = null;
  private editScopeKey: string | null = null;
  constructor() {
    effect(() => {
      const scopeKey = this.workspace.scopeKey();
      if (this.activeEditId() && this.editScopeKey !== scopeKey)
        untracked(() => this.cancelEdit());
    });
    effect((onCleanup) => {
      const popover = this.openPopover();
      const panel = popover?.panel()?.nativeElement;
      if (!panel || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => popover.reposition());
      observer.observe(panel);
      onCleanup(() => observer.disconnect());
    });
    afterRenderEffect(() => {
      // NativePopoverComponent focuses its panel before it emits `opened`.
      // Cell focus belongs to that event; only field focus needs later retries.
      if (this.setupFocusTarget() !== 'cell') this.focusSetupTarget();
    });
    // Deep link stays reactive: a later input change still opens the popover.
    // Each new value applies once, so a user cancel is not fought.
    effect(() => {
      const deepLinkId = this.initialEditingConsumerId();
      // Cleared (the visit that applied it ended): the same role may be deep-linked again later.
      if (!deepLinkId) {
        this.appliedDeepLinkId = null;
        return;
      }
      if (deepLinkId !== this.appliedDeepLinkId) {
        // Waits for the row's data and for a running save to end (no popover opens while a save runs).
        if (
          !this.rows().find((row) => row.id === deepLinkId)?.loaded ||
          (deepLinkId === 'setup' ? this.setupActionsDisabled() : this.busy())
        )
          return;
        this.appliedDeepLinkId = deepLinkId;
        if (deepLinkId === 'setup') {
          this.setupFocusTarget.set('cell');
          if (this.activeEditId() === 'setup') {
            afterNextRender(() => this.onPopoverOpened('setup'), {
              injector: this.injector,
            });
          }
        }
        // Opens it (a toggle would close a popover the user already opened on this row).
        if (this.activeEditId() !== deepLinkId) this.toggleEdit(deepLinkId);
        this.deepLinkOpened.emit(deepLinkId);
      }
    });
  }
  protected readonly busy = computed(
    () => this.assignmentSaving() || this.feedback.saving(),
  );
  protected readonly extraProviders = computed<
    readonly ProviderIdentityOption[]
  >(() =>
    settingsProviderConnections(this.state.connections().data ?? []).map((connection) => ({
      id: connection.id,
      name: connection.name,
    })),
  );
  protected readonly timeoutMeta = computed(
    () => this.state.enhancement().data?.timeoutMs ?? null,
  );
  protected readonly timeoutMinSec = () => TIMEOUT_MIN_SEC;
  protected readonly timeoutMaxSec = () => TIMEOUT_MAX_SEC;
  protected readonly timeoutDefaultSec = () => TIMEOUT_DEFAULT_SEC;
  protected readonly timeoutEffectiveSec = computed<number>(() =>
    Math.round((this.timeoutMeta() ?? 0) / 1000),
  );
  protected readonly timeoutScope = computed<SettingScopeDisplay>(
    () =>
      this.state.scopeEntry('skills.enhancement.timeoutMs')?.scope ?? 'mixed',
  );
  protected readonly timeoutOverride = computed<boolean>(
    () =>
      this.state.scopeEntry('skills.enhancement.timeoutMs')?.hasOverride ===
      true,
  );
  protected readonly timeoutValidationError = computed<string | null>(() => {
    if (this.timeoutMeta() === null) return null;
    const sec = this.timeoutDraftSec(),
      min = this.timeoutMinSec(),
      max = this.timeoutMaxSec();
    return isNaN(sec) || sec < min || sec > max
      ? `Must be between ${min} and ${max} seconds.`
      : null;
  });
  protected readonly isTimeoutSaveBlocked = computed<boolean>(
    () =>
      this.timeoutMeta() === null ||
      this.disabled() ||
      this.timeoutValidationError() !== null ||
      this.timeoutDraftSec() === this.timeoutEffectiveSec(),
  );
  protected readonly isTimeoutSaveDisabled = computed<boolean>(
    () => this.busy() || this.isTimeoutSaveBlocked(),
  );
  protected readonly rows = computed<readonly BackgroundConsumerRow[]>(() =>
    buildConsumerRows(
      {
        setup: this.state.setupModel(),
        memory: this.state.memory(),
        enhancement: this.state.enhancement(),
      },
      this.effectiveRoute(),
      (key) => this.state.scopeEntry(key),
    ),
  );
  private readonly effectiveRoute = computed(() => {
    const { status, data } = this.state.route();
    return status === 'ready' && data?.ready && data.route !== 'unresolved'
      ? data
      : null;
  });
  protected readonly inheritedProvider = computed(() =>
    inheritedConsumerProvider(this.effectiveRoute()),
  );
  protected readonly draftProviderReadiness = computed(() => {
    const row = this.rows().find((r) => r.id === this.activeEditId());
    if (!this.currentDraft().provider && this.state.route().status === 'loading')
      return null;
    return row && row.id !== 'setup' ? this.readinessFor(row) : null;
  });
  private readonly setupState = computed(
    () => this.state.setupModel().data?.state,
  );
  protected readonly setupIssue = computed(() =>
    setupModelIssue(this.setupState()),
  );
  protected readonly setupDisplayProvider = computed(() => {
    const state = this.setupState();
    if (state?.kind === 'unset') return state.effective.provider;
    if (state?.kind === 'set') return state.pair.provider;
    return state?.provider ?? '';
  });
  protected readonly setupActionsDisabled = computed(
    () =>
      this.disabled() ||
      this.busy() ||
      this.state.setupCommit().status === 'saving',
  );
  protected readonly setupDraftComplete = computed(
    () => !!this.currentDraft().provider && !!this.currentDraft().model,
  );
  private readinessFor(row: BackgroundConsumerRow) {
    const route = this.state.route().data;
    const provider = this.currentDraft().provider;
    const inheritedId = this.inheritedProvider()?.id;
    return providerReadiness(
      provider || (inheritedId && row.unsupportedProviders.includes(inheritedId) ? inheritedId : ''),
      route?.providers ?? [],
      !!inheritedId,
      row.unsupportedProviders,
    );
  }
  protected toggleEdit(id: ProviderConsumerId): void {
    if (id === 'setup' && this.setupActionsDisabled()) return;
    if (this.activeEditId() === id) {
      this.cancelEdit();
      return;
    }
    const row = this.rows().find((r) => r.id === id);
    // While a save runs the cell is only aria-disabled (so it can keep and take focus): the click is refused here (D3).
    if (!row || !row.loaded || this.busy()) return;
    if (this.activeEditId() === 'setup') this.state.clearSetupDraftFeedback();
    this.context = this.state.reviewContext();
    this.editScopeKey = this.workspace.scopeKey();
    this.currentDraft.set({ provider: row.provider, model: row.model });
    this.activeEditId.set(id);
  }
  protected cancelEdit(): void {
    const id = this.activeEditId();
    if (id === 'setup') this.state.clearSetupDraftFeedback();
    this.setupFocusTarget.set(null);
    this.activeEditId.set(null);
    if (!id) return;
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLElement>(`[data-testid="consumer-edit-${id}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }
  protected onDraftChange(
    id: ProviderConsumerId,
    selection: ProviderModelSelection,
  ): void {
    if (this.activeEditId() !== id) return;
    this.currentDraft.set({
      provider: selection.provider,
      model: selection.model,
    });
    if (id !== 'setup') void this.saveDraft(id);
  }
  protected connectProvider(): void {
    this.cancelEdit();
    this.appState.requestSettingsTab({ tab: 'providers', section: 'more-providers' });
  }

  protected onSetupProvider(providerId: string): void {
    this.setupProviderRequested.emit(providerId);
  }
  protected chooseSetupPart(part: 'provider' | 'model'): void {
    this.setupFocusTarget.set(part);
    if (this.activeEditId() !== 'setup') this.toggleEdit('setup');
    else this.onPopoverOpened('setup');
  }
  protected onPopoverOpened(id: ProviderConsumerId): void {
    if (id === 'setup') this.focusSetupTarget();
  }
  private focusSetupTarget(): void {
    const target = this.setupFocusTarget();
    const panel = this.openPopover()?.panel()?.nativeElement;
    if (!target || this.activeEditId() !== 'setup' || !panel) return;
    if (target === 'cell') {
      const control = this.element.nativeElement.querySelector<HTMLElement>(
        '[data-testid="consumer-edit-setup"]',
      );
      control?.focus();
      if (control && document.activeElement === control) {
        this.setupFocusTarget.set(null);
      }
      return;
    }
    const picker = this.pickers().at(0);
    if (!picker || (target === 'model' && picker.modelsLoading())) return;
    const control = panel.querySelector<HTMLElement>(
      `[data-testid="provider-model-picker-${target}"] [role="combobox"]`,
    );
    if (
      !control ||
      control.matches(':disabled') ||
      control.getAttribute('aria-disabled') === 'true'
    )
      return;
    control.focus();
    if (document.activeElement === control) this.setupFocusTarget.set(null);
  }
  protected saveSetupDraft(): void {
    if (this.setupDraftComplete()) void this.commitSetup(this.currentDraft());
  }
  protected async commitSetup(pair: ModelPair | null | 'undo'): Promise<void> {
    if (this.setupActionsDisabled()) return;
    const draft = this.currentDraft();
    const accepted =
      pair === 'undo'
        ? await this.state.undoSetupPair()
        : await this.state.commitSetupPair(pair);
    if (
      accepted &&
      this.activeEditId() === 'setup' &&
      this.currentDraft() === draft
    ) {
      this.cancelEdit();
    }
  }
  private async saveDraft(id: SettingsPatchConsumerId): Promise<void> {
    if (this.busy() || this.disabled()) return;
    this.assignmentSaving.set(true);
    let savedAssignment = false;
    try {
      const scopeKey = this.editScopeKey;
      while (!this.disabled() && this.activeEditId() === id && this.workspace.scopeKey() === scopeKey) {
        // Each write (and its Undo) starts from the latest refreshed row.
        const row = this.rows().find((r) => r.id === id);
        if (!row) return;
        if (this.readinessFor(row)?.blocking) {
          if (savedAssignment) this.revertDraft(id);
          return;
        }
        const draft = this.currentDraft();
        if (draft.provider === row.provider && draft.model === row.model)
          return;
        const label = `${row.name} assignment`;
        const context = this.context ?? this.state.reviewContext();
        if (!context) {
          this.feedback.announce(
            `${settingNotSavedMessage(label)} ${DRAWER_WRITE_NO_CONTEXT}`,
            'alert',
          );
          break;
        }
        this.context = context;
        const result = await this.feedback.save({
          label,
          scope: SAVE_SCOPE,
          write: () =>
            this.writeAssignment(id, draft.provider, draft.model, context),
          undo: () => this.writeAssignment(id, row.provider, row.model, context),
        });
        if (result === 'saved') savedAssignment = true;
        if (result === 'failed' && this.state.commit().status === 'blocked')
          this.context = this.state.reviewContext();
        if (this.currentDraft() === draft) {
          if (result === 'saved') return;
          break;
        }
      }
      this.revertDraft(id);
    } finally {
      this.assignmentSaving.set(false);
    }
  }
  private revertDraft(id: ProviderConsumerId): void {
    if (this.activeEditId() !== id) return;
    const rejected = this.currentDraft();
    // Let the picker receive the rejected inputs before resetting them to their original values.
    afterNextRender(
      () => {
        if (this.activeEditId() !== id || this.currentDraft() !== rejected)
          return;
        const row = this.rows().find((r) => r.id === id);
        if (row)
          this.currentDraft.set({ provider: row.provider, model: row.model });
      },
      { injector: this.injector },
    );
  }
  private async writeAssignment(
    id: SettingsPatchConsumerId,
    provider: string,
    model: string,
    context: ProvidersEditContext,
  ): Promise<boolean> {
    const accepted = await this.state.saveSettings(
      consumerPatch(id, provider, model),
      context,
    );
    if (accepted && this.state.commit().status === 'saved')
      this.assignmentSaved.emit({ id, provider, model });
    return accepted;
  }
  protected async retrySection(
    retryKey: BackgroundConsumerRow['retryKey'],
  ): Promise<void> {
    if (retryKey === 'setup') await this.state.refreshSetupModel();
    else if (retryKey === 'memory') await this.state.refreshMemory();
    else await this.state.refreshEnhancement();
  }
  protected editTimeout(): void {
    if (this.timeoutMeta() === null) return;
    this.timeoutDraftSec.set(this.timeoutEffectiveSec());
    this.isEditingTimeout.set(true);
    afterNextRender(() => this.timeoutInputRef()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }
  protected cancelTimeoutEdit(): void {
    this.isEditingTimeout.set(false);
    this.timeoutDraftSec.set(this.timeoutEffectiveSec());
  }
  protected onTimeoutInput(event: Event): void {
    this.timeoutDraftSec.set((event.target as HTMLInputElement).valueAsNumber);
  }
  protected async saveTimeout(): Promise<void> {
    if (this.isTimeoutSaveDisabled()) return;
    const sec = this.timeoutDraftSec(),
      previousSec = this.timeoutEffectiveSec();
    const context: ProvidersEditContext = this.state.reviewContext() ?? {
      scopeKey: '',
      activePath: null,
    };
    const result = await this.feedback.save({
      label: 'enhancement time limit',
      scope: SAVE_SCOPE,
      write: () => this.writeTimeout(sec, context),
      undo: () => this.writeTimeout(previousSec, context),
    });
    if (result === 'saved') {
      this.isEditingTimeout.set(false);
      return;
    }
    if (!this.isEditingTimeout()) return;
    const savedSec = this.timeoutEffectiveSec();
    this.timeoutDraftSec.set(savedSec);
    // The binding may not change (the same value as before the edit), so the input is reset directly.
    const input = this.timeoutInputRef()?.nativeElement;
    if (input) input.value = String(savedSec);
  }
  private async writeTimeout(
    sec: number,
    context: ProvidersEditContext,
  ): Promise<boolean> {
    const patch: ProvidersSettingsPatch = {
      enhancement: { timeoutMs: Math.round(sec * 1000) },
    };
    const accepted = await this.state.saveSettings(patch, context);
    if (accepted && this.state.commit().status === 'saved')
      this.timeoutSaved.emit(sec);
    return accepted;
  }
}
