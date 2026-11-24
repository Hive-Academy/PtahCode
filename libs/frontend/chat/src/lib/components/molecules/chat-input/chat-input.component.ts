import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  afterNextRender,
  Injector,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  viewChild,
  ElementRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  LucideAngularModule,
  ArrowUp,
  GitBranch,
  Square,
  ImageIcon,
  Folder as FolderIcon,
} from 'lucide-angular';
import type { EffortLevel } from '@ptah-extension/shared';
import { ChatStore } from '../../../services/chat.store';
import { isTabBusyGenerating } from '../../../services/chat-store/tab-busy';
import { ComposerRestoreService } from '../../../services/composer-restore.service';
import {
  CommandCenterSendLockService,
  TabManagerService,
} from '@ptah-extension/chat-state';
import {
  SESSION_CONTEXT,
  SESSION_START_GUARD,
  SESSION_STOP_HANDLER,
} from '../../../tokens/session-context.token';
import { ComposerCompactStore } from '../../../services/composer-compact.store';
import { ComposerActivityDirective } from '../../../directives/composer-activity.directive';
import { ComposerTypeToExpandDirective } from './composer-type-to-expand.directive';
import {
  ComposerDraftStore,
  type ComposerDraft,
} from '../../../services/composer-draft.store';
import {
  AuthStateService,
  AutopilotStateService,
  CommandDiscoveryFacade,
  AppStateManager,
  VSCodeService,
} from '@ptah-extension/core';
import { VoiceInputService } from '../../../services/voice-input.service';
import {
  SessionGitStatsStore,
  sessionBranch,
  sessionWorkingRoot,
} from '../../../services/session-git-stats/session-git-stats.store';
import { ModelSelectorComponent } from './model-selector.component';
import {
  AutopilotPopoverComponent,
  ComposerCompactBarComponent,
  COMPOSER_CARD_BORDER_CLASS,
  COMPOSER_CARD_CLASS,
} from '@ptah-extension/chat-ui';
import type { ChatFile } from '../../../services/file-picker.service';
import { UnifiedSuggestionsDropdownComponent } from '../../file-suggestions/unified-suggestions-dropdown.component';
import { AttachmentTrayComponent } from '../attachment-tray/attachment-tray.component';
import { ComposerAttachmentsService, type ComposerImage } from '../../../services/composer-attachments.service';
import {
  ComposerInputController,
  type ComposerCommandSource,
  type ComposerFileMode,
} from '../../../services/composer-input.controller';
import { AtTriggerDirective } from '../../../directives/at-trigger.directive';
import { SlashTriggerDirective } from '../../../directives/slash-trigger.directive';
import { EffortSelectorComponent } from './effort-selector.component';
import { McpStatusChipComponent } from '../mcp-status-chip.component';
import { PeerSessionSendComponent } from '../peer-session-send';
import { ComposerAttachMenuComponent } from '../composer-controls/composer-attach-menu.component';
import { ComposerVoiceButtonComponent } from '../composer-controls/composer-voice-button.component';

/** Main chat lists the workspace command catalogue behind `/`. */
const DISCOVERY_COMMANDS: ComposerCommandSource = { state: 'discovery' };

/** Per-instance suffix for the textarea id (several composers can mount). */
let nextComposerId = 0;

/** Last path segment of a working root (`/a/b/` and `C:\a\b` -> `b`). */
function folderName(root: string): string {
  const parts = root.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? root;
}

/**
 * ChatInputComponent - Enhanced message input with bottom bar controls
 *
 * Complexity Level: 2 (Input with model selector and autopilot toggle)
 * Patterns: Signal-based state, Composition
 *
 * Layout ("card + status line", design-spec §6):
 * - One `<form aria-label="Message composer">` card holds the workspace /
 *   branch hint strip, attachments, a borderless textarea and a toolbar
 *   (`+` attach menu, approval chip | model + effort, voice, stop, round
 *   send). The card's 1px border carries the plan-mode / autopilot tint.
 * - A quiet status line under the card holds MCP, peer send and the auth
 *   method label.
 *
 * Features:
 * - Shift+Enter for newlines, Enter to send
 * - Clear input after send
 * - Disable during streaming
 * - Auto-resize textarea via CSS `field-sizing: content` (no JS height writes)
 *
 * MIGRATION NOTE:
 * - Removed CdkOverlayOrigin - now using native ElementRef for overlay positioning
 * - UnifiedSuggestionsDropdownComponent uses Floating UI instead of CDK Overlay
 * - Overlay origin now passed as { elementRef } object instead of CdkOverlayOrigin
 *
 * SOLID Principles:
 * - Single Responsibility: Message input and bottom bar controls
 * - Dependency Inversion: Injects ChatStore abstraction
 */
@Component({
  selector: 'ptah-chat-input',
  imports: [
    LucideAngularModule,
    ModelSelectorComponent,
    AutopilotPopoverComponent,
    UnifiedSuggestionsDropdownComponent,
    AttachmentTrayComponent,
    AtTriggerDirective,
    SlashTriggerDirective,
    EffortSelectorComponent,
    McpStatusChipComponent,
    PeerSessionSendComponent,
    ComposerActivityDirective,
    ComposerCompactBarComponent,
    ComposerTypeToExpandDirective,
    ComposerAttachMenuComponent,
    ComposerVoiceButtonComponent,
  ],
  // VoiceInputService is per composer; the voice button uses this instance.
  providers: [
    VoiceInputService,
    ComposerCompactStore,
    ComposerAttachmentsService,
    ComposerInputController,
  ],
  template: `
    <div
      class="ptah-composer relative flex flex-col px-3 pt-2 pb-2 bg-surface-0"
      data-testid="chat-composer"
      [ptahComposerTypeToExpand]="isCompact()"
      (typeToExpand)="expandComposer()"
      (pasteToExpand)="pasteIntoCompact($event)"
      (dragover)="handleDragOver($event)"
      (dragleave)="composerInput.handleDragLeave($event)"
      (drop)="composerInput.handleDrop($event)"
    >
      <!-- Image attachment validation error (auto-clears after 4s) -->
      @if (commandCenterHeld()) {
        <div role="status" class="text-xs text-base-content-muted px-2 pb-1.5">
          Command Center voice owns this session. Regular chat sends are held.
          <button type="button" class="link" (click)="openCommandCenter()">
            Open Command Center
          </button>
        </div>
      }
      <ptah-attachment-tray [showPickButtons]="false" [showChips]="false" />
      <!-- Two-state streaming composer. Both states share one grid cell and
           fold by animating grid-template-rows 0fr <-> 1fr, so no height is
           measured in script. The folded state is inert (no tab stops, hidden
           from assistive tech). ComposerCompactStore owns the rules. -->
      <div
        class="ptah-composer-stage"
        [attr.data-compact]="isCompact() ? '' : null"
        data-testid="chat-composer-stage"
      >
      <div class="ptah-composer-fold ptah-composer-fold--full">
      <div
        class="ptah-composer-fold-clip"
        [class.is-unclipped]="compactStore.unclipped()"
        [id]="composerFullId"
        [attr.inert]="isCompact() ? '' : null"
        ptahComposerActivity
        data-testid="chat-composer-full"
      >
      <!-- Composer card (design-spec §6): workspace / branch hints, attachments,
           textarea, toolbar. A form landmark; sending stays on the Send click
           and Enter handlers, so a native submit is always prevented. The
           border carries the mode tint (plan = info, autopilot = primary). -->
      <form
        [class]="cardClasses()"
        data-glass-surface="tile"
        aria-label="Message composer"
        data-testid="chat-composer-form"
        (submit)="$event.preventDefault()"
      >
        <!-- Compaction overlay on the card -->
        @if (resolvedIsCompacting()) {
          <div
            class="absolute inset-0 z-10 flex items-center justify-center bg-base-100/60 backdrop-blur-[1px] rounded-xl"
          >
            <div
              class="flex items-center gap-2 text-base-content-muted text-sm font-medium"
            >
              <span class="loading loading-spinner loading-sm"></span>
              <span>Optimizing context...</span>
            </div>
          </div>
        }
        <!-- Drop zone overlay -->
        @if (composerInput.dragging()) {
          <div
            class="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border border-dashed border-primary rounded-xl pointer-events-none"
          >
            <div
              class="flex items-center gap-2 text-primary text-sm font-medium"
            >
              <lucide-angular [img]="ImageIconRef" class="w-5 h-5" />
              <span>Drop image here</span>
            </div>
          </div>
        }

        <!-- Top strip: workspace and branch hints. Non-interactive (no tab
             stops, design D8); absent when neither is known. -->
        @if (workspaceName() || branchName()) {
          <div
            class="ptah-fold-fade h-[38px] flex items-center gap-3.5 px-3 min-w-0 border-b border-surface-border text-xs text-base-content-muted"
            data-testid="composer-top-strip"
          >
            @if (workspaceName(); as name) {
              <span
                class="inline-flex items-center gap-1.5 min-w-0 flex-shrink"
                [title]="workspaceRoot() ?? name"
                data-testid="composer-workspace-hint"
              >
                <lucide-angular
                  [img]="FolderHintIcon"
                  class="w-3.5 h-3.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <span class="ptah-composer-workspace-label truncate">{{
                  name
                }}</span>
              </span>
            }
            @if (branchName(); as branch) {
              <span
                class="inline-flex items-center gap-1.5 min-w-0 flex-shrink"
                [title]="'Branch ' + branch"
                data-testid="composer-branch-hint"
              >
                <lucide-angular
                  [img]="GitBranchIcon"
                  class="w-3.5 h-3.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <span class="truncate font-mono text-[11.5px]">{{
                  branch
                }}</span>
              </span>
            }
          </div>
        }

        <ptah-attachment-tray [showPickButtons]="false" [showError]="false" />
        <!-- Textarea + Suggestions Dropdown -->
        <div class="relative">
          <label class="sr-only" [attr.for]="inputId"
            >Message the orchestrator</label
          >
          <!-- Auto-resize is pure CSS (field-sizing: content), so typing never
               forces a document layout. The min-height is the 60 px resting
               field (design-spec §2.2, which field-sizing ignores); it grows
               to 8 lines, then scrolls. -->
          <textarea
            dir="auto"
            #inputElement
            [id]="inputId"
            style="field-sizing: content"
            class="ptah-fold-fade block w-full min-h-[60px] max-h-[calc(8lh+1rem)] overflow-y-auto resize-none bg-transparent border-0 px-3.5 pt-3 pb-1 text-[13px] leading-[1.6] text-base-content placeholder:text-base-content-muted outline-none focus:outline-none focus:ring-0"
            [placeholder]="
              commandCenterHeld()
                ? 'Command Center voice owns this session — sends held'
                : attachedReadOnly()
                  ? 'Session is attached to messaging — read-only'
                  : 'Ask the orchestrator to plan, build or review...'
            "
            [value]="currentMessage()"
            [readonly]="attachedReadOnly()"
            [class.opacity-60]="attachedReadOnly()"
            (input)="handleInput($event)"
            (keydown)="composerInput.handleKeyDown($event)"
            (paste)="composerInput.handlePaste($event)"
            rows="2"
            role="combobox"
            [attr.aria-expanded]="composerInput.showSuggestions()"
            [attr.aria-controls]="composerInput.getListboxId()"
            [attr.aria-activedescendant]="composerInput.getActiveDescendantId()"
            aria-autocomplete="list"
            ptahAtTrigger
            (atActivated)="composerInput.handleAtActivated($event)"
            (atTriggered)="composerInput.handleAtTriggered($event)"
            (atClosed)="composerInput.handleAtClosed()"
            (atQueryChanged)="composerInput.handleQueryChanged($event)"
            ptahSlashTrigger
            (slashActivated)="composerInput.handleSlashActivated($event)"
            (slashTriggered)="composerInput.handleSlashTriggered()"
            (slashClosed)="composerInput.handleSlashClosed()"
            (slashQueryChanged)="composerInput.handleQueryChanged($event)"
          ></textarea>

          <!-- File/Folder Suggestions Dropdown - positioned above textarea.
               Rendered only once the fold has settled: while the card still
               moves, its clip box carries a translate, which makes it the
               containing block of this position:fixed panel. Floating UI
               would then write box-relative left/top that land near the
               window's top-left once the translate returns to none. -->
          @if (
            composerInput.showSuggestions() &&
            textareaOrigin() &&
            compactStore.unclipped()
          ) {
            <ptah-unified-suggestions-dropdown
              #suggestionsDropdown
              [overlayOrigin]="textareaOrigin()!"
              [suggestions]="composerInput.filteredSuggestions()"
              [isLoading]="composerInput.isLoadingSuggestions()"
              [errorMessage]="composerInput.filePickerError()"
              (suggestionSelected)="
                composerInput.handleSuggestionSelected($event)
              "
              (closed)="composerInput.closeSuggestions()"
            />
          }
        </div>

        <!-- In-card toolbar (design-spec §6.3 order): + -> approval chip ->
             spacer -> model / effort group -> mic -> stop / send -->
        <div class="ptah-composer-toolbar flex items-center gap-1 px-2 pr-2.5 pb-2 min-w-0">
          <div class="ptah-composer-toolbar-start flex items-center gap-1 min-w-0 flex-1">
            <ptah-composer-attach-menu
              (pickFiles)="handleAttachFiles()"
              (pickImages)="handleAttachImages()"
            />

            <!-- Approval chip (moved from the status line; data unchanged:
                 AutopilotStateService.stateFor(sessionId)) -->
            <ptah-autopilot-popover
              class="min-w-0"
              [sessionId]="tabSessionId()"
            />
          </div>

          <!-- Right: model / effort, voice, stop, send -->
          <div class="ptah-composer-toolbar-end flex items-center gap-1 min-w-0 flex-shrink">
            <!-- Both existing controls kept (Decision A2-5); below 640 px the
                 effort label hides and its icon trigger stays. -->
            <div
              role="group"
              aria-label="Model and effort"
              class="inline-flex items-center h-7 min-w-0 rounded-md text-xs text-base-content-muted"
            >
              <ptah-model-selector class="min-w-0" />
              <span class="px-0.5" aria-hidden="true">·</span>
              <ptah-effort-selector
                class="min-w-0 flex-shrink-0"
                (effortChanged)="onEffortChange($event)"
              />
            </div>

            <!-- Dictation (renders only in Electron) -->
            <ptah-composer-voice-button
              (transcript)="composerInput.insertTranscript($event)"
              (failed)="composerInput.showError($event)"
            />

            <!-- Stop Button (streaming only), same 28 px circle as Send.
                 Gated on the same busy predicate the dispatcher queues on, so
                 a queued send always has a Stop to drain it. Exactly one Stop
                 exists at a time: while folded it lives on the compact bar,
                 because this card is then inert and clipped to zero height,
                 so a Stop left here keeps a layout box nothing can click. -->
            @if (isActiveTabStreaming() && !isCompact()) {
              <button
                class="inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-full bg-error/15 text-error hover:bg-error/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
                (click)="handleStop()"
                title="Stop generating"
                aria-label="Stop generating"
                type="button"
                data-testid="chat-stop-btn"
              >
                <lucide-angular
                  [img]="SquareIcon"
                  class="w-3.5 h-3.5"
                  aria-hidden="true"
                />
              </button>
            }

            <!-- Send Button (always functional - queues message during
                 streaming). Neutral inverse circle, design D1. -->
            <button
              class="inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-full bg-base-content text-base-100 transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
              [disabled]="
                !canSend() || attachedReadOnly() || commandCenterHeld()
              "
              (click)="handleSend()"
              type="button"
              title="Send message"
              aria-label="Send message"
              data-testid="chat-send-btn"
            >
              <lucide-angular
                [img]="ArrowUpIcon"
                class="w-4 h-4"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </form>

      <!-- Status line under the card: MCP, peer send, auth (unchanged) -->
      <div
        class="ptah-composer-status-line chat-composer-column flex items-center gap-2 px-1 mt-1.5 min-w-0 w-full mx-auto"
        data-glass-surface="plate"
      >
        <div class="flex items-center gap-0.5 min-w-0">
          <!-- MCP status (host is display: contents; renders nothing when the
               session reports no servers) -->
          <ptah-mcp-status-chip
            [sessionId]="tabSessionId()"
            [tabId]="mcpTabId()"
          />

          <!-- Peer session send affordance (TASK_2026_402 §11) -->
          <ptah-peer-session-send />
        </div>

        @if (authMethodLabel()) {
          <span
            class="ml-auto min-w-0 truncate text-xs text-base-content-muted"
            [title]="'Authenticated via ' + authMethodLabel()"
            >{{ authMethodLabel() }}</span
          >
        }
      </div>
      </div>
      </div>

      <!-- Compact bar: shown only while the tab streams and the composer is
           idle; any expand request moves focus into the textarea. -->
      <div class="ptah-composer-fold ptah-composer-fold--bar">
        <div
          class="ptah-composer-fold-clip"
          [attr.inert]="isCompact() ? null : ''"
        >
          <ptah-composer-compact-bar
            [statusLabel]="compactStatusLabel()"
            [modelLabel]="compactModelLabel()"
            [controlsId]="composerFullId"
            [showStop]="isActiveTabStreaming() && isCompact()"
            [collapsed]="!isCompact()"
            (expandRequested)="expandComposer()"
            (stopRequested)="stopFromCompact()"
          />
        </div>
      </div>
      </div>

      <!-- Announces the fold politely; empty until the first change. -->
      <div
        class="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="chat-composer-fold-announcer"
      >
        {{ compactAnnouncement() }}
      </div>
    </div>
  `,
  // Narrow-width container queries and the streaming fold live in the sheet.
  styleUrl: './chat-input.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInputComponent implements OnInit, OnDestroy {
  readonly chatStore = inject(ChatStore);
  readonly tabManager = inject(TabManagerService);
  private readonly commandCenterSendLock = inject(CommandCenterSendLockService);
  private readonly appState = inject(AppStateManager);
  private readonly draftStore = inject(ComposerDraftStore);
  private readonly composerRestore = inject(ComposerRestoreService);
  private readonly _sessionContext = inject(SESSION_CONTEXT, {
    optional: true,
  });
  private readonly sessionStartGuard = inject(SESSION_START_GUARD, {
    optional: true,
  });
  private readonly sessionStopHandler = inject(SESSION_STOP_HANDLER, {
    optional: true,
  });
  readonly autopilotState = inject(AutopilotStateService);
  private readonly vscodeService = inject(VSCodeService);
  private readonly gitStore = inject(SessionGitStatsStore);
  /** Textarea behaviour: `/` and `@` suggestions, paste, drop, keys, voice. */
  readonly composerInput = inject(ComposerInputController);
  readonly commandDiscovery = inject(CommandDiscoveryFacade);
  private readonly authState = inject(AuthStateService);

  /**
   * Auth badge label, read straight off `AuthStateService`.
   *
   * This component used to issue the auth-status RPC itself in `ngOnInit` and
   * derive the label locally — a third independent boot caller of a 2-5s
   * handler, re-fired on every workspace switch because the input re-inits
   * (TASK_2026_342). The label rule now has one owner.
   */
  readonly authMethodLabel = this.authState.authMethodLabel;

  /**
   * Stop-button visibility. Reads `isTabBusyGenerating` — the SAME predicate
   * `MessageDispatchService` uses to decide send-vs-queue.
   *
   * This used to read `tabManager.isTabStreaming()` (the `_streamingTabIds`
   * spinner set) alone, which is only one of that predicate's three sources.
   * Whenever the other two said busy and the spinner set did not, every send
   * was queued while Stop stayed hidden — and Stop is the only drain for a
   * queue outside a root turn-end, so the tab was a dead end until reload
   * (TASK_2026_382 review B5). Widening the busy predicate without widening the
   * recovery affordance that reads the same state is what made that reachable;
   * the two now cannot disagree by construction.
   */
  readonly isActiveTabStreaming = computed(() => {
    const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
    if (!tabId) return false;
    // Resolved across workspaces, like the dispatcher: a canvas tile or a tab
    // parked in a background workspace is absent from `tabs()`.
    const tab = this.tabManager.findTabByIdAcrossWorkspaces(tabId)?.tab ?? null;
    return isTabBusyGenerating({
      status: tab?.status,
      streamingState: tab?.streamingState,
      isStreamingTab: this.tabManager.isTabStreaming(tabId),
    });
  });

  /**
   * Per-`SessionStatus` direct-send enablement matrix.
   *
   * - `fresh` — enabled
   * - `draft` — enabled
   * - `loaded` — enabled
   * - `awaiting-background` — enabled
   * - `sleeping` — enabled (agent idle until its next scheduled wakeup)
   * - `streaming` — disabled
   * - `resuming` — disabled
   * - `switching` — disabled
   */
  readonly inputEnabled = computed<boolean>(() => {
    const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
    if (!tabId) return true;
    const tab = this.tabManager.tabs().find((t) => t.id === tabId);
    if (!tab) return true;
    switch (tab.status) {
      case 'fresh':
      case 'draft':
      case 'loaded':
      case 'awaiting-background':
      case 'sleeping':
        return true;
      case 'streaming':
      case 'resuming':
      case 'switching':
        return false;
    }
  });

  /**
   * The active tab resolved the same way `inputEnabled` resolves it
   * (SESSION_CONTEXT tile scope first, else the global active tab). Single
   * source of truth for both the read-only gate and the "Send to messaging"
   * trigger so they always agree on which tab they act on.
   */
  private readonly resolvedTab = computed(() => {
    const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
    if (!tabId) return null;
    return this.tabManager.tabs().find((t) => t.id === tabId) ?? null;
  });

  /**
   * Working root of this composer's session for the top-strip workspace
   * hint: the same `sessionWorkingRoot` call the session details use
   * (worktree, else the tab's workspace partition, else the webview root).
   * With no tab yet, the webview root, where a new session starts.
   */
  protected readonly workspaceRoot = computed<string | null>(() => {
    const fallback = this.vscodeService.config().workspaceRoot || undefined;
    const tab = this.resolvedTab();
    if (!tab) return fallback ?? null;
    return sessionWorkingRoot(
      tab,
      this.tabManager.findTabByIdAcrossWorkspaces(tab.id)?.workspacePath ??
        null,
      fallback,
    );
  });

  protected readonly workspaceName = computed(() => {
    const root = this.workspaceRoot();
    return root ? folderName(root) : null;
  });

  /**
   * Branch hint: the agent-origin branch, else the last known branch of the
   * working root. Reads the git state only; the composer never starts git
   * tracking, so the hint shows once another surface (the inspector) tracks
   * the root.
   */
  protected readonly branchName = computed(() =>
    sessionBranch(
      this.resolvedTab(),
      this.gitStore.stateFor(this.workspaceRoot()),
    ),
  );

  /** Ties the visually hidden label to the textarea. */
  protected readonly inputId = `ptah-composer-input-${nextComposerId++}`;

  /** The full composer region; the compact bar's `aria-controls` target. */
  protected readonly composerFullId = `${this.inputId}-full`;

  /**
   * Tab and session ids of the tab this composer belongs to, resolved exactly
   * as `ChatViewComponent` resolves them: a canvas tile scopes to its own tab
   * via SESSION_CONTEXT, the main panel falls back to the global active tab.
   * The MCP status chip gets both ids because the backend pushes MCP status
   * under the tabId until the SDK reports the session UUID. The autopilot
   * popover gets the session id so a toggle re-gates THIS tab's session, not
   * the backend's most recently active one.
   */
  protected readonly mcpTabId = computed(
    () => this._sessionContext?.() ?? this.tabManager.activeTabId(),
  );

  protected readonly tabSessionId = computed(() =>
    this._sessionContext
      ? (this.resolvedTab()?.claudeSessionId ?? null)
      : this.chatStore.currentSessionId(),
  );

  /**
   * The messaging binding this tab's session is attached to, or null. When
   * non-null the composer is READ-ONLY (the session is being driven from
   * Telegram / Discord / Slack). The "attached" indicator and the "Resolve
   * back to webview" detach action now live in the tile header
   * (`SendToMessagingComponent`); this composer only gates input on the state.
   */
  private readonly attachedBinding = computed(
    () => this.resolvedTab()?.attachedBinding ?? null,
  );

  /** True when this tab's session is attached to a messaging binding. */
  readonly attachedReadOnly = computed(() => this.attachedBinding() != null);

  public readonly commandCenterHeld = computed(() => {
    this.commandCenterSendLock.state();
    const tab = this.resolvedTab();
    return tab != null && this.commandCenterSendLock.isHeld(tab.id);
  });

  public openCommandCenter(): void {
    this.appState.setCurrentView('command-center');
  }

  /**
   * Per-tab compaction state. In canvas mode, scoped to this tile's tab
   * (a tile whose SESSION_CONTEXT resolves null shows no overlay); otherwise
   * the global active tab. Reads the SAME registry derivation as the
   * chat-view banner, so the overlay and banner always agree.
   */
  readonly resolvedIsCompacting = computed(() =>
    this.chatStore.isCompactingForTab(
      this._sessionContext
        ? this._sessionContext()
        : this.tabManager.activeTabId(),
    ),
  );
  private readonly textareaRef =
    viewChild<ElementRef<HTMLTextAreaElement>>('inputElement');

  // ---- Two-state streaming composer (rules in ComposerCompactStore) ----
  protected readonly compactStore = inject(ComposerCompactStore);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly composerActivity = viewChild(ComposerActivityDirective);
  private readonly modelSelector = viewChild(ModelSelectorComponent);
  private readonly attachMenu = viewChild(ComposerAttachMenuComponent);

  /** The composer is folded into its one-row bar. */
  readonly isCompact = this.compactStore.compact;

  protected readonly compactStatusLabel = computed(() =>
    this.resolvedIsCompacting() ? 'Optimizing context…' : 'Ptah is working…',
  );

  /** The model chip reuses the selector's own display rule. */
  protected readonly compactModelLabel = computed(
    () => this.modelSelector()?.effectiveModelDisplay() ?? '',
  );

  /** Polite screen-reader note for each fold change (empty at first). */
  protected readonly compactAnnouncement = signal('');

  /**
   * Open the full composer and put focus in the textarea now, inside the
   * triggering event. The view is checked first so the region is no longer
   * inert; a key press that expanded it then types into the textarea.
   */
  expandComposer(): void {
    this.compactStore.expand();
    this.cdr.detectChanges();
    this.textareaRef()?.nativeElement.focus({ preventScroll: true });
  }

  /**
   * Stop from the bar. The bar turns inert when the stream ends, which drops
   * its focus; the textarea takes it back on that expand.
   */
  protected stopFromCompact(): Promise<void> {
    this.focusTextareaOnExpand = true;
    return this.handleStop();
  }
  private focusTextareaOnExpand = false;

  /** Paste while folded: expand, then take the clipboard text and images. */
  protected pasteIntoCompact(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    this.expandComposer();
    if (text) this._currentMessage.update((current) => current + text);
    this.composerInput.handlePaste(event);
  }

  /** Wire the store and the polite fold announcement. */
  private setupCompactComposer(): void {
    this.compactStore.connect({
      scope: computed(
        () => this._sessionContext?.() ?? this.tabManager.activeTabId(),
      ),
      streaming: this.isActiveTabStreaming,
      hasContent: computed(
        () =>
          this._currentMessage().length > 0 ||
          this._selectedFiles().length > 0 ||
          this._pastedImages().length > 0,
      ),
      focused: computed(
        () => this.composerActivity()?.focusWithin() ?? false,
      ),
      overlayOpen: computed(
        () =>
          this.composerInput.showSuggestions() ||
          (this.attachMenu()?.isOpen() ?? false) ||
          (this.composerActivity()?.popoverOpen() ?? false),
      ),
      dragging: this.composerInput.dragging,
    });

    let announced = false;
    effect(() => {
      const compact = this.isCompact();
      if (!announced && !compact) return;
      announced = true;
      untracked(() => {
        this.compactAnnouncement.set(
          compact
            ? 'Composer minimized while Ptah works. Start typing to expand it.'
            : 'Composer expanded.',
        );
        if (compact || !this.focusTextareaOnExpand) return;
        this.focusTextareaOnExpand = false;
        afterNextRender(
          () => {
            const active = this.document.activeElement;
            if (active && active !== this.document.body) return;
            this.textareaRef()?.nativeElement.focus({ preventScroll: true });
          },
          { injector: this.injector },
        );
      });
    });
  }

  /**
   * Textarea origin for Floating UI positioning.
   * Returns an object with elementRef to match the expected interface.
   * Replaces CdkOverlayOrigin which was removed in the native migration.
   */
  readonly textareaOrigin = computed(() => {
    const ref = this.textareaRef();
    return ref ? { elementRef: ref } : null;
  });

  private readonly dropdownRef = viewChild<UnifiedSuggestionsDropdownComponent>(
    'suggestionsDropdown',
  );
  readonly ArrowUpIcon = ArrowUp;
  readonly FolderHintIcon = FolderIcon;
  readonly GitBranchIcon = GitBranch;
  readonly SquareIcon = Square;
  readonly ImageIconRef = ImageIcon;

  /**
   * Composer card classes (design-spec §6 card line: surface-1, 12 px radius,
   * hairline, inset highlight + elevation). The 1px border doubles as the
   * mode indicator: info while plan mode is active (agent plan mode or the
   * `plan` permission level), primary while autopilot is on, else the
   * neutral hairline that strengthens on focus-within.
   */
  readonly cardClasses = computed(() => {
    const base = `chat-composer-column chat-composer-card ${COMPOSER_CARD_CLASS}`;
    if (
      this.autopilotState.agentPlanMode() ||
      this.autopilotState.permissionLevel() === 'plan'
    ) {
      return `${base} chat-composer-card--plan border-info/50 focus-within:border-info/70`;
    }
    if (this.autopilotState.enabled()) {
      return `${base} border-primary/40 focus-within:border-primary/60`;
    }
    return `${base} ${COMPOSER_CARD_BORDER_CLASS}`;
  });

  private _lastSessionId: string | null = null;
  /** The draft text; the input controller edits it, this component owns it. */
  private readonly _currentMessage = signal('');
  readonly attachments = inject(ComposerAttachmentsService);
  private readonly _selectedFiles = this.attachments.files;
  private readonly _pastedImages = this.attachments.images;
  private draftTabId: string | null = null;
  /** Drafts whose send is still pending, with the tab they were sent from. */
  private readonly sendsInFlight = new Set<{
    tabId: string | null;
    draft: ComposerDraft;
  }>();
  private lastDraft: {
    text: string;
    files: ChatFile[];
    images: ComposerImage[];
  } | null = null;
  readonly imageAttachmentError = this.attachments.error.asReadonly();
  readonly currentMessage = this._currentMessage.asReadonly();
  readonly selectedFiles = this._selectedFiles.asReadonly();
  readonly pastedImages = this._pastedImages.asReadonly();
  readonly canSend = computed(
    () =>
      this.attachments.pendingReads() === 0 && (
        this.currentMessage().trim().length > 0 ||
        this._pastedImages().length > 0 ||
        this._selectedFiles().length > 0
      ),
  );

  /**
   * Ensure auth status has been loaded once so the badge can render.
   * No-op after the first successful load — the guard lives in the service.
   */
  ngOnInit(): void {
    void this.authState.loadAuthStatus();
  }

  ngOnDestroy(): void {
    this.saveDraft();
  }

  /**
   * Value sync only: the textarea sizes itself via `field-sizing: content`,
   * and trigger detection lives in the directives.
   */
  handleInput(event: Event): void {
    this._currentMessage.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Show a transient, user-visible error near the input area.
   * Auto-clears after 4 seconds.
   */
  private showComposerError(message: string): void {
    this.attachments.showError(message);
  }

  /**
   * Open native file picker to attach workspace files.
   * Uses RPC to bypass webview sandbox limitation.
   */
  async handleAttachFiles(): Promise<void> {
    await this.attachments.pickFiles();
  }

  async handleAttachImages(): Promise<void> {
    await this.attachments.pickImages();
  }

  /** Dragover with files: show the drop zone and open a folded composer. */
  handleDragOver(event: DragEvent): void {
    if (this.composerInput.handleDragOver(event) && this.isCompact()) {
      this.compactStore.expand();
    }
  }

  /**
   * Handle effort level change from EffortSelectorComponent.
   * The EffortSelectorComponent now persists directly via EffortStateService,
   * so this handler is kept for any additional side-effects if needed.
   */
  onEffortChange(_effort: EffortLevel | undefined): void {
    console.log('ChatInputComponent.onEffortChange called');
  }

  /**
   * Send message
   * FIX #8: Delegate smart routing to ChatStore (SRP violation fixed)
   */
  async handleSend(): Promise<void> {
    // Composer is read-only while the session is attached to a messaging
    // binding — block sends; the user must "Resolve back to webview" first.
    if (this.attachedReadOnly() || this.commandCenterHeld() || this.attachments.pendingReads() > 0) return;
    const content = this.currentMessage().trim();
    const images = this._pastedImages();
    if (!content && images.length === 0) return;
    const blockReason = this.sessionStartGuard?.();
    if (blockReason) return this.showComposerError(blockReason);
    const normalizedContent = content;
    // Captured before the await: the user may switch tabs while it runs, and
    // the draft effect then shows (and stores) another tab's draft.
    const sendingTabId =
      this._sessionContext?.() ?? this.tabManager.activeTabId();
    const submitted = {
      text: this._currentMessage(),
      files: this._selectedFiles(),
      images,
    };
    // A double click, or Enter then a click, re-submits the unchanged draft
    // while its send is pending. An edited or other-tab draft still sends.
    for (const pending of this.sendsInFlight) {
      if (
        pending.tabId === sendingTabId &&
        this.isSubmittedDraft(submitted, pending.draft)
      ) {
        return;
      }
    }
    const inFlight = { tabId: sendingTabId, draft: submitted };
    this.sendsInFlight.add(inFlight);

    try {
      const sendAttachments = this.attachments.toSendOptions();
      await this.chatStore.sendOrQueueMessage(
        normalizedContent || 'What is in this image?',
        {
          ...sendAttachments,
          tabId: this._sessionContext?.() ?? undefined,
        },
      );
      // A failed send also clears: the sender keeps the prompt as the user's
      // bubble, so a kept draft would duplicate it on retry.
      // Clear only what still holds the submitted draft: the sending tab's
      // stored draft, and the composer while it shows that tab unchanged.
      if (
        sendingTabId &&
        this.isSubmittedDraft(this.draftStore.get(sendingTabId), submitted)
      ) {
        this.draftStore.clear(sendingTabId);
      }
      if (
        this.draftTabId === sendingTabId &&
        this.isSubmittedDraft(
          {
            text: this._currentMessage(),
            files: this._selectedFiles(),
            images: this._pastedImages(),
          },
          submitted,
        )
      ) {
        this._currentMessage.set('');
        this.attachments.clear();
      }
      // The emptied `[value]` binding plus `field-sizing: content` shrink the
      // textarea back to its resting height — no manual height reset.
    } catch (error) {
      console.error('[ChatInputComponent] Failed to send message:', error);
    } finally {
      this.sendsInFlight.delete(inFlight);
    }
  }

  /**
   * Stop streaming (abort current response).
   * Uses abortWithConfirmation() to warn user about running sub-agents.
   */
  async handleStop(): Promise<void> {
    const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
    if (tabId && this.sessionStopHandler?.(tabId) === 'handled') return;
    try {
      const aborted = await this.chatStore.abortWithConfirmation();
      console.log('[ChatInputComponent] Stop requested, aborted:', aborted);
    } catch (error) {
      console.error('[ChatInputComponent] Failed to stop streaming:', error);
    }
  }

  /**
   * Restore content to input textarea (called by effect when signal changes)
   * FIX #2: Check if input is empty before restoring to prevent overwriting user input
   * @param content - Content to restore to input
   * @param options - `replace: true` overwrites a non-empty input. Used for
   *   explicit user selections (a prompt picked from the `/` dropdown, which
   *   replaces the trigger and the input); the queued-restore effect keeps
   *   the default so it never clobbers typed text.
   */
  restoreContentToInput(
    content: string,
    options?: { replace?: boolean },
  ): void {
    if (!options?.replace && this._currentMessage().trim()) {
      return;
    }
    this.composerInput.replaceText(content);
  }

  constructor() {
    this.composerInput.connect({
      text: this._currentMessage,
      textarea: this.textareaRef,
      dropdown: this.dropdownRef,
      commands: signal(DISCOVERY_COMMANDS).asReadonly(),
      fileMode: signal<ComposerFileMode>('reference').asReadonly(),
      prompts: true,
      // Read-only while attached to messaging or held by Command Center:
      // Enter must not send (handleSend checks the same gates).
      submit: () => {
        if (this.attachedReadOnly() || this.commandCenterHeld()) return;
        void this.handleSend();
      },
    });
    this.setupCompactComposer();
    this.draftTabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
    if (this.draftTabId) this.restoreDraft(this.draftTabId);
    effect(() => {
      const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
      if (tabId !== this.draftTabId) {
        untracked(() => {
          this.saveDraft();
          this.draftTabId = tabId;
          if (tabId) {
            this.restoreDraft(tabId);
            this.applyComposerRestore(tabId);
          } else this.clearLocalDraft();
        });
      }
      this._currentMessage();
      this._selectedFiles();
      this._pastedImages();
      untracked(() => this.saveDraft());
    });
    // Follow-ups a Stop withdrew, a withdrawn queued item, a failed one
    // (TASK_2026_884): waiting per tab until this composer shows that tab.
    effect(() => {
      const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
      if (!tabId || this.composerRestore.pendingFor(tabId) === null) return;
      untracked(() => {
        if (tabId === this.draftTabId) this.applyComposerRestore(tabId);
      });
    });
    effect(() => {
      const tabId = this._sessionContext?.() ?? this.tabManager.activeTabId();
      if (!tabId || this.composerRestore.pendingAttachmentsFor(tabId) === null) return;
      untracked(() => {
        if (tabId !== this.draftTabId) return;
        const restored = this.composerRestore.mergeAttachments(
          tabId,
          this.attachments.files(),
          this.attachments.images(),
        );
        if (!restored) return;
        this.attachments.restore(restored.files, restored.images);
      });
    });
    effect(() => {
      const currentTabId = this.tabManager.activeTabId();
      if (currentTabId !== this._lastSessionId) {
        if (this._lastSessionId !== null && currentTabId !== null) {
          this.commandDiscovery.clearCache();
        }
        this._lastSessionId = currentTabId;
      }
    });
  }

  private saveDraft(): void {
    if (!this.draftTabId) return;
    if (!this.tabManager.findTabByIdAcrossWorkspaces(this.draftTabId)) return;
    const text = this._currentMessage();
    const files = this._selectedFiles();
    const images = this._pastedImages();
    if (
      this.lastDraft?.text === text &&
      this.lastDraft.files === files &&
      this.lastDraft.images === images
    )
      return;
    this.lastDraft = { text, files, images };
    if (!text && files.length === 0 && images.length === 0) {
      this.draftStore.clear(this.draftTabId);
      return;
    }
    this.draftStore.save(this.draftTabId, {
      text,
      files,
      images,
    });
  }

  /**
   * Put the tab's restored follow-up text in front of what the composer holds
   * (it was typed earlier), so neither is lost.
   */
  private applyComposerRestore(tabId: string): void {
    const restored = this.composerRestore.consume(tabId);
    if (restored === null) return;
    const current = this._currentMessage();
    this.restoreContentToInput(
      current.trim() ? `${restored}
${current}` : restored,
      { replace: true },
    );
  }

  private restoreDraft(tabId: string): void {
    const draft = this.draftStore.get(tabId);
    this._currentMessage.set(draft?.text ?? '');
    this.attachments.restore(draft?.files ?? [], draft?.images ?? []);
    this.lastDraft = {
      text: this._currentMessage(),
      files: this._selectedFiles(),
      images: this._pastedImages(),
    };
  }

  /** The same text and the same file and image lists (by reference). */
  private isSubmittedDraft(
    draft: ComposerDraft | undefined,
    submitted: ComposerDraft,
  ): boolean {
    return (
      draft !== undefined &&
      draft.text === submitted.text &&
      draft.files === submitted.files &&
      draft.images === submitted.images
    );
  }

  private clearLocalDraft(): void {
    this._currentMessage.set('');
    this.attachments.clear();
    this.lastDraft = null;
  }
}
