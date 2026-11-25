import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { SubagentRecord } from '@ptah-extension/chat-streaming';
import { ArrowUp, LucideAngularModule, Moon, Plus, Square } from 'lucide-angular';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import type { TrayAgentContext } from '../../../services/session-agents/session-agent-tray';
import { ChatAgentFeedbackSender } from '../../../services/agent-feedback/chat-agent-feedback-sender.service';
import { VoiceInputService } from '../../../services/voice-input.service';
import { subagentFollowUpPrompt } from '../../../utils/subagent-follow-up-prompt';
import { ComposerGatedControlDirective } from '../../molecules/composer-controls/composer-gated-control.directive';
import { ComposerEffortPickerComponent } from '../../molecules/composer-controls/composer-effort-picker.component';
import { ComposerModelPickerComponent } from '../../molecules/composer-controls/composer-model-picker.component';
import { ComposerVoiceButtonComponent } from '../../molecules/composer-controls/composer-voice-button.component';

/** How the composer delivers the text for the agent's current state. */
export type SubagentComposerMode = 'steer' | 'follow-up' | 'unavailable';

const STEER_FAILED = 'Could not send your message. Try again.';
const FOLLOW_UP_FAILED = 'Could not send the follow-up. Try again.';

/**
 * Why each control a sub-agent message cannot carry is gated. One place, so
 * the toolbar, the status line and the "N limited" badge say the same thing.
 * Steer wording applies to a live agent (also when it is unavailable); the
 * follow-up wording when the text goes to the main chat.
 */
export const SUBAGENT_GATED_REASONS = {
  attach: 'Messages to a sub-agent carry text only.',
  steer: {
    model: 'A sub-agent keeps the model it started with.',
    effort: 'A sub-agent keeps the effort level it started with.',
  },
  followUp: {
    model: "Follow-ups use the main chat's model.",
    effort: "Follow-ups use the main chat's effort level.",
  },
} as const;

/** Per-instance suffix for the textarea id (several lanes can mount). */
let nextSubagentComposerId = 0;

/**
 * SubagentLaneComposerComponent - the always-visible message input at the
 * bottom of a sub-agent lane, in the CLI lane composer's card, toolbar order
 * and status line (TASK_2026_2324 Item 2, design-spec sections 1-3).
 *
 * A running, steerable agent gets the text over `subagent:send-message`
 * (through the tray). Any other agent with a known owning session gets it as a
 * main-chat follow-up that asks the main agent to continue it. The draft is
 * kept on failure and reset whenever the lane shows a different agent.
 *
 * Capability map: only what the delivery path can honour works.
 *
 * | Control | Backed by | State |
 * | --- | --- | --- |
 * | Text | `subagent:send-message` `text` (steer) or main-chat send (follow-up) | working |
 * | Stop | `subagent:stop` via `stopRequested` | working when `stoppable` |
 * | Send to background | `subagent:background` via `backgroundRequested` | working when `canBackground` |
 * | Voice | local transcript into the draft | working |
 * | Attach, Model, Effort | none: `subagent:send-message` params are text only | gated with reason |
 * | Approval, `/`, `@`, Ctrl+Enter send-now, queue | none | not rendered |
 *
 * The class lists are the `@ptah-extension/chat-ui` composer constants
 * (`COMPOSER_*_CLASS`), written out statically so the template has no
 * dynamic class binding; the spec pins each element to its constant.
 */
@Component({
  selector: 'ptah-subagent-lane-composer',
  standalone: true,
  imports: [
    LucideAngularModule,
    ComposerGatedControlDirective,
    ComposerModelPickerComponent,
    ComposerEffortPickerComponent,
    ComposerVoiceButtonComponent,
  ],
  // The voice button records per composer, as in the CLI lane composer.
  providers: [VoiceInputService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The lane places it below its scroller, in the chat column.
  host: { class: 'block' },
  template: `
    <div class="flex flex-col min-w-0 pt-1" data-testid="subagent-composer">
      <!-- COMPOSER_CARD_CLASS + COMPOSER_CARD_BORDER_CLASS -->
      <div
        class="relative flex flex-col w-full mx-auto rounded-xl border bg-surface-1 shadow-[inset_0_1px_0_var(--surface-highlight),var(--elev-shadow)] transition-colors border-surface-border focus-within:border-[var(--surface-border-strong)]"
        data-glass-surface="tile"
        data-testid="subagent-composer-card"
      >
        <label class="sr-only" [for]="fieldId">Message {{ name() }}</label>
        <!-- COMPOSER_TEXTAREA_CLASS -->
        <textarea
          dir="auto"
          rows="2"
          [id]="fieldId"
          style="field-sizing: content"
          class="block w-full min-h-[60px] max-h-[calc(8lh+1rem)] overflow-y-auto resize-none bg-transparent border-0 px-3.5 pt-3 pb-1 text-[13px] leading-[1.6] text-base-content placeholder:text-base-content-muted outline-none focus:outline-none focus:ring-0 disabled:opacity-60"
          [value]="draft()"
          [placeholder]="placeholder()"
          [disabled]="mode() === 'unavailable' || pending()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
        ></textarea>

        <!-- Main chat's toolbar order: + | model / effort -> mic -> background -> Stop -> Send -->
        <div class="ptah-composer-toolbar flex items-center gap-1 px-2 pr-2.5 pb-2 min-w-0">
          <div class="ptah-composer-toolbar-start flex items-center gap-1 min-w-0 flex-1">
            <!-- COMPOSER_ICON_BUTTON_CLASS -->
            <button
              type="button"
              class="inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-md text-base-content-muted hover:text-base-content hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))] disabled:opacity-50"
              aria-label="Attach files or add context"
              data-testid="subagent-composer-attach"
              [ptahComposerGated]="reasons.attach"
              (reasonRevealed)="revealedReason.set($event)"
              (reasonCleared)="revealedReason.set(null)"
            >
              <lucide-angular [img]="PlusIcon" class="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div class="ptah-composer-toolbar-end flex items-center gap-1 min-w-0 flex-shrink">
            <div
              role="group"
              aria-label="Model and effort"
              class="inline-flex items-center h-7 min-w-0 rounded-md text-xs text-base-content-muted"
            >
              <ptah-composer-model-picker
                class="min-w-0"
                [options]="[]"
                [selectedId]="modelLabel()"
                [disabledReason]="modelReason()"
                (reasonRevealed)="revealedReason.set($event)"
                (reasonCleared)="revealedReason.set(null)"
              />
              <span class="px-0.5" aria-hidden="true">·</span>
              <ptah-composer-effort-picker
                class="min-w-0 flex-shrink-0"
                [options]="[]"
                [disabledReason]="effortReason()"
                (reasonRevealed)="revealedReason.set($event)"
                (reasonCleared)="revealedReason.set(null)"
              />
            </div>

            <ptah-composer-voice-button
              (transcript)="insertTranscript($event)"
              (failed)="error.set($event)"
            />

            @if (context(); as ctx) {
              @if (ctx.entry.canBackground) {
                <!-- COMPOSER_ICON_BUTTON_CLASS -->
                <button
                  type="button"
                  class="inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-md text-base-content-muted hover:text-base-content hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))] disabled:opacity-50"
                  aria-label="Send to background"
                  title="Send to background"
                  data-testid="subagent-composer-background"
                  [disabled]="backgroundPending()"
                  (click)="backgroundRequested.emit(ctx)"
                >
                  <lucide-angular [img]="MoonIcon" class="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              }
              @if (ctx.entry.stoppable) {
                <!-- COMPOSER_STOP_BUTTON_CLASS -->
                <button
                  type="button"
                  class="inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-full bg-error/15 text-error hover:bg-error/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
                  aria-label="Stop generating"
                  title="Stop generating"
                  data-testid="subagent-composer-stop"
                  [disabled]="stopPending()"
                  (click)="stopRequested.emit(ctx)"
                >
                  @if (stopPending()) {
                    <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
                  } @else {
                    <lucide-angular [img]="SquareIcon" class="w-3.5 h-3.5" aria-hidden="true" />
                  }
                </button>
              }
            }

            <!-- COMPOSER_SEND_BUTTON_CLASS. Send keeps the native disabled (decisions.md 10). -->
            <button
              type="button"
              class="inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-full bg-base-content text-base-100 transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
              data-testid="subagent-composer-send"
              [disabled]="sendDisabled()"
              [attr.aria-label]="sendLabel()"
              [title]="sendLabel()"
              (click)="submit()"
            >
              @if (pending()) {
                <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
              } @else {
                <lucide-angular [img]="ArrowUpIcon" class="w-4 h-4" aria-hidden="true" />
              }
            </button>
          </div>
        </div>
      </div>

      @if (error(); as message) {
        <p
          role="alert"
          class="mt-1 px-1 text-xs text-state-err"
          data-testid="subagent-composer-error"
        >
          {{ message }}
        </p>
      }

      <!-- COMPOSER_STATUS_LINE_CLASS -->
      <div
        class="flex items-center gap-2 min-w-0 px-1 text-[11px] text-base-content-muted mt-1.5"
        data-testid="subagent-composer-status-line"
      >
        <span
          class="mr-auto min-w-0 truncate"
          aria-live="polite"
          [attr.data-testid]="
            mode() === 'unavailable' && !revealedReason()
              ? 'subagent-composer-unavailable'
              : 'subagent-composer-status'
          "
          [title]="statusText()"
          >{{ statusText() }}</span
        >
        <span
          class="flex-shrink-0 rounded-md border border-[var(--surface-border-strong)] px-1.5 text-[11px] text-base-content-muted"
          [title]="limitedReasons().join('\\n')"
          data-testid="subagent-composer-limited-badge"
          >{{ limitedReasons().length }} limited</span
        >
      </div>
    </div>
  `,
})
export class SubagentLaneComposerComponent {
  readonly record = input.required<SubagentRecord>();
  readonly stopPending = input(false);
  readonly backgroundPending = input(false);
  readonly stopRequested = output<TrayAgentContext>();
  readonly backgroundRequested = output<TrayAgentContext>();
  readonly context = input<TrayAgentContext | null>(null);
  /** The lane's fallback session, used when neither record nor tray knows it. */
  readonly sessionId = input<string | null>(null);

  protected readonly MoonIcon = Moon;
  protected readonly SquareIcon = Square;
  protected readonly PlusIcon = Plus;
  protected readonly ArrowUpIcon = ArrowUp;
  protected readonly reasons = SUBAGENT_GATED_REASONS;
  protected readonly fieldId = `ptah-subagent-composer-field-${nextSubagentComposerId++}`;

  private readonly tray = inject(SessionAgentTrayService);
  private readonly sender = inject(ChatAgentFeedbackSender);

  protected readonly draft = signal('');
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The last action's note, e.g. "Sent to the main chat". */
  protected readonly status = signal<string | null>(null);
  /** Reason of the hovered or focused gated control, for the status line. */
  protected readonly revealedReason = signal<string | null>(null);
  /** Bumped per agent key, so a reply for agent A never lands on agent B. */
  private generation = 0;

  private readonly key = computed(() => this.record().parentToolUseId);
  private readonly owningSession = computed(
    () =>
      this.record().parentSessionId ??
      this.context()?.sessionId ??
      this.sessionId() ??
      null,
  );
  protected readonly name = computed(() => {
    const record = this.record();
    return (
      record.teammateName || record.agentType || record.agentId || 'sub-agent'
    );
  });
  /** Still active, so the text must steer it, never go to the main chat. */
  private readonly live = computed(() => {
    const status = this.record().status;
    return (
      status === 'running' ||
      status === 'pending' ||
      status === 'paused' ||
      status === 'background'
    );
  });
  readonly mode = computed<SubagentComposerMode>(() => {
    if (this.context()?.entry.steerable) return 'steer';
    if (this.live()) return 'unavailable';
    return this.owningSession() ? 'follow-up' : 'unavailable';
  });
  protected readonly unavailableText = computed(() =>
    this.live()
      ? 'This agent cannot take messages right now'
      : "This agent's session is not open",
  );
  protected readonly placeholder = computed(() =>
    this.mode() === 'follow-up'
      ? `Ask the main agent to continue ${this.name()}…`
      : `Message ${this.name()}…`,
  );
  protected readonly sendLabel = computed(() =>
    this.mode() === 'follow-up' ? 'Send follow-up' : 'Send steer message',
  );
  protected readonly sendDisabled = computed(
    () =>
      this.mode() === 'unavailable' ||
      this.pending() ||
      this.draft().trim().length === 0,
  );

  private readonly settingReasons = computed(() =>
    this.mode() === 'follow-up'
      ? SUBAGENT_GATED_REASONS.followUp
      : SUBAGENT_GATED_REASONS.steer,
  );
  protected readonly modelReason = computed(() => this.settingReasons().model);
  protected readonly effortReason = computed(
    () => this.settingReasons().effort,
  );
  /** The gated pill's label: the agent's model when known. */
  protected readonly modelLabel = computed(() =>
    this.mode() === 'follow-up'
      ? 'Main chat model'
      : (this.context()?.model ?? 'Agent model'),
  );
  protected readonly limitedReasons = computed((): readonly string[] => [
    SUBAGENT_GATED_REASONS.attach,
    this.modelReason(),
    this.effortReason(),
  ]);

  protected readonly statusText = computed(() => {
    const revealed = this.revealedReason();
    if (revealed) return revealed;
    const note = this.status();
    if (note) return note;
    switch (this.mode()) {
      case 'steer':
        return `Enter sends to ${this.name()} · Shift+Enter adds a line`;
      case 'follow-up':
        return 'Sends to the main chat as a follow-up';
      default:
        return this.unavailableText();
    }
  });

  constructor() {
    effect(() => {
      this.key();
      untracked(() => {
        this.generation++;
        this.draft.set('');
        this.pending.set(false);
        this.error.set(null);
        this.status.set(null);
      });
    });
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.status.set(null);
  }

  /** Enter sends, Shift+Enter adds a line, an IME composition Enter is the IME's. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    this.submit();
  }

  /** A voice transcript joins the draft after a space. */
  protected insertTranscript(transcript: string): void {
    const value = transcript.trim();
    if (!value) return;
    const current = this.draft();
    const gap = current.length > 0 && !/\s$/.test(current) ? ' ' : '';
    this.draft.set(current + gap + value);
    this.status.set(null);
  }

  protected submit(): void {
    if (this.sendDisabled()) return;
    void this.onSubmit(this.draft().trim());
  }

  protected async onSubmit(text: string): Promise<void> {
    if (this.pending()) return;
    const mode = this.mode();
    if (mode === 'unavailable') return;
    const generation = this.generation;
    // The draft as sent: a voice transcript can join it while the send is
    // pending (the textarea is disabled, so nothing else changes it).
    const sentDraft = this.draft();
    this.error.set(null);
    this.status.set(null);
    this.pending.set(true);
    try {
      const failure =
        mode === 'steer' ? await this.steer(text) : await this.followUp(text);
      if (generation !== this.generation) return;
      if (failure) {
        this.error.set(failure);
        return;
      }
      // M5: clear only what was sent; text added while pending stays.
      const current = this.draft();
      this.draft.set(
        current.startsWith(sentDraft) ? current.slice(sentDraft.length).trimStart() : current,
      );
      if (mode === 'follow-up') this.status.set('Sent to the main chat');
    } finally {
      if (generation === this.generation) this.pending.set(false);
    }
  }

  /** `null` on success, else the user-facing failure line. */
  private async steer(text: string): Promise<string | null> {
    const context = this.context();
    if (!context) return STEER_FAILED;
    // The tray catches transport errors; the RPC error itself is shown by
    // the lane's command-error line.
    return (await this.tray.steer(context, text)) ? null : STEER_FAILED;
  }

  /** `null` on success, else the sender's user-facing error. */
  private async followUp(text: string): Promise<string | null> {
    const sessionId = this.owningSession();
    if (!sessionId) return FOLLOW_UP_FAILED;
    const result = await this.sender.send(
      { sessionId },
      subagentFollowUpPrompt(this.record(), text),
    );
    return result.sent ? null : (result.error ?? FOLLOW_UP_FAILED);
  }
}
