import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  ArrowUp,
  ImageIcon,
  LucideAngularModule,
  Play,
  Sparkles,
  Square,
  SquareTerminal,
  TriangleAlert,
} from 'lucide-angular';
import {
  AgentDeliveryStore,
  AgentMonitorStore,
  type MonitoredAgent,
  LANE_OPTIONS_CHECKING_TEXT,
  LANE_OPTIONS_ERROR_TEXT,
  LANE_OPTIONS_STALE_TEXT,
  LaneTurnSettingsStore,
} from '@ptah-extension/chat-streaming';
import type { CommandSuggestion } from '@ptah-extension/core';
import {
  LANE_TURN_MAX_FILES,
  LANE_TURN_MAX_IMAGES,
  type EffectiveLaneCapabilities,
  type EffortLevel,
  type LaneComposerCommandOption,
  type LanePermissionMode,
} from '@ptah-extension/shared';
import {
  COMPOSER_CARD_BORDER_CLASS,
  COMPOSER_CARD_CLASS,
  COMPOSER_SEND_BUTTON_CLASS,
  COMPOSER_STOP_BUTTON_CLASS,
  COMPOSER_TEXTAREA_CLASS,
  ComposerCompactBarComponent,
} from '@ptah-extension/chat-ui';
import { PtahButtonDirective, PtahTooltipDirective } from '@ptah-extension/ui';
import { ComposerAttachmentsService } from '../../../services/composer-attachments.service';
import { ComposerCompactStore } from '../../../services/composer-compact.store';
import {
  ComposerInputController,
  type ComposerCommandGroup,
  type ComposerCommandSource,
  type ComposerFileMode,
} from '../../../services/composer-input.controller';
import { VoiceInputService } from '../../../services/voice-input.service';
import { ComposerActivityDirective } from '../../../directives/composer-activity.directive';
import { AtTriggerDirective } from '../../../directives/at-trigger.directive';
import { SlashTriggerDirective } from '../../../directives/slash-trigger.directive';
import {
  UnifiedSuggestionsDropdownComponent,
  type SuggestionItem,
} from '../../file-suggestions/unified-suggestions-dropdown.component';
import { AttachmentTrayComponent } from '../attachment-tray/attachment-tray.component';
import { isTypeToExpandKey } from '../chat-input/composer-type-to-expand';
import { ComposerAttachMenuComponent } from '../composer-controls/composer-attach-menu.component';
import { ComposerVoiceButtonComponent } from '../composer-controls/composer-voice-button.component';
import {
  COMPOSER_EFFORT_OPTIONS,
  ComposerEffortPickerComponent,
  type ComposerEffortOption,
} from '../composer-controls/composer-effort-picker.component';
import {
  ComposerModelPickerComponent,
  type ComposerModelOption,
} from '../composer-controls/composer-model-picker.component';
import { LaneApprovalChipComponent } from '../composer-controls/lane-approval-chip.component';
import {
  QueuedMessageListComponent,
  type QueuedMessageView,
  type QueuedSendNowAction,
} from '../queued-follow-ups/queued-message-list.component';
import { LaneDeliveryController } from './lane-delivery.controller';
import {
  RESUME_BUTTON_CLASS,
  laneEffortOption,
  laneLimitations,
  lanePlaceholder,
  laneSendLabel,
  limitedLabel,
  limitedTooltip,
  type LaneLimitation,
  type LaneStateChip,
} from './lane-composer-labels';

/** Per-instance suffix for element ids (several lane composers can mount). */
let nextLaneComposerId = 0;

const NEXT_TURN_FOOTER = 'Applies from your next message. The lane keeps running.';
const STOPPED_FOOTER = 'Applies from your next message, which resumes the lane.';
const MODELS_LOADING_LABEL = 'Loading models…';
/** The lane state chip's label while a stop waits for the process exit (see `laneStateChip`). */
const STOPPING_LABEL = 'Stopping…';
/**
 * The id the host reports when one turn used several models
 * (`ptah-cli-stream-loop.service.ts` MULTI_MODEL_ID). It names no model, so
 * the composer never shows or selects it.
 */
const MULTI_MODEL_ID = 'mixed-model';
const ATTACHMENT_READING_TEXT = 'An attachment is still loading. Send when it appears in the tray.';
const STEER_HINT ='Send this message into the running turn now';
const INTERRUPT_HINT = 'Stop the current turn and send this message now';

const APPROVAL_LABELS: Readonly<Record<LanePermissionMode, string>> = {
  ask: 'Ask',
  plan: 'Plan',
  'auto-edit': 'Auto edit',
  yolo: 'Auto',
};

/** What the loss dialog sends once confirmed. */
type LossTarget = { readonly kind: 'draft' } | { readonly kind: 'queued'; readonly id: string };

/** A provider date suffix: `-20261001` or `-2026-10-01`. */
const DATE_SUFFIX = /^-(?:\d{8}|\d{4}-\d{2}-\d{2})$/;

/**
 * The catalog row for a model id the lane recorded. Lanes report the same
 * model as a catalog id, a display name or a dated provider id
 * (`claude-haiku-5-5` for `claude-haiku-5-5-20261001`), so the match is exact
 * first, then case-insensitive on id or name, then on a date suffix alone.
 */
export function findLaneModelOption(
  options: readonly ComposerModelOption[],
  id: string,
): ComposerModelOption | undefined {
  const exact = options.find((option) => option.id === id);
  if (exact) return exact;
  const wanted = id.toLowerCase();
  const named = options.find((option) => option.id.toLowerCase() === wanted || option.name.toLowerCase() === wanted);
  if (named) return named;
  // A dated recorded id: the catalog id plus a date suffix only, so
  // `gpt-5.5-mini` never matches `gpt-5.5`.
  const dated = (longer: string, base: string): boolean =>
    longer.startsWith(base) && DATE_SUFFIX.test(longer.slice(base.length));
  const base = options.find((option) => dated(wanted, option.id.toLowerCase()));
  if (base) return base;
  // A dated catalog id: only when exactly one row is the recorded id plus a date.
  const rows = options.filter((option) => dated(option.id.toLowerCase(), wanted));
  return rows.length === 1 ? rows[0] : undefined;
}

/**
 * The model the lane's last run used, as the frontend saw it: the provider's
 * reported model, else the model of its folded usage, else the newest usage
 * segment's model. A lane restored after a host restart has no stored model,
 * but its output can still name the model it ran (round 6: an orphan whose
 * last turn ran Opus read "claude default"). The multi-model id names none.
 */
export function laneLastRunModel(
  record: Pick<MonitoredAgent, 'observedModel' | 'usageTotals' | 'segments'> | undefined,
): string | undefined {
  if (!record) return undefined;
  const usable = (model: string | undefined) => (model && model !== MULTI_MODEL_ID ? model : undefined);
  const known = usable(record.observedModel) ?? usable(record.usageTotals?.model ?? undefined);
  if (known) return known;
  const segments = record.segments ?? [];
  for (let i = segments.length - 1; i >= 0; i--) {
    const model = usable(segments[i].usage?.model);
    if (model) return model;
  }
  return undefined;
}

function commandSuggestion(option: LaneComposerCommandOption): CommandSuggestion {
  return {
    name: option.name,
    description: option.description ?? '',
    scope: 'builtin',
    icon: option.group === 'skill' ? Sparkles : SquareTerminal,
  };
}

/**
 * The CLI lane composer: main chat's composer with a lane as its data source
 * (design-spec 1-6). Same card, toolbar order, compact bar, queued cards and
 * classes; the differences are lane capability: gated controls with their
 * backend reasons, a lane-scoped model and effort pick, the per-mode status
 * line, Send now through Ctrl/Cmd+Enter or the queued card (with the turn-loss
 * confirmation), and Stop or Resume session in the toolbar.
 *
 * Delivery lives in `LaneDeliveryController`, textarea behaviour in
 * `ComposerInputController`, the fold in `ComposerCompactStore`; all are
 * provided per composer. `VoiceInputService` is per composer too, so the mic
 * uses this instance.
 */
@Component({
  selector: 'ptah-lane-composer',
  standalone: true,
  imports: [
    LucideAngularModule,
    PtahButtonDirective,
    ComposerCompactBarComponent,
    ComposerActivityDirective,
    AttachmentTrayComponent,
    UnifiedSuggestionsDropdownComponent,
    AtTriggerDirective,
    SlashTriggerDirective,
    ComposerAttachMenuComponent,
    ComposerVoiceButtonComponent,
    ComposerModelPickerComponent,
    ComposerEffortPickerComponent,
    LaneApprovalChipComponent,
    QueuedMessageListComponent,
    PtahTooltipDirective,
  ],
  providers: [
    VoiceInputService,
    ComposerCompactStore,
    ComposerAttachmentsService,
    ComposerInputController,
    LaneDeliveryController,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  // Main chat's sheet: container queries and the streaming fold.
  styleUrl: '../chat-input/chat-input.component.css',
  styles: [
    `
      @container ptah-composer (max-width: 639px) {
        :host ::ng-deep ptah-composer-effort-picker .ptah-composer-label {
          display: none;
        }
      }
      @container ptah-composer (max-width: 400px) {
        .ptah-lane-limited-badge {
          display: none;
        }
      }
    `,
  ],
  templateUrl: './lane-composer.component.html',
})
export class LaneComposerComponent {
  readonly agentId = input.required<string>();
  readonly laneLabel = input('lane');
  readonly cli = input('CLI');
  readonly stopped = input(false);
  /** Stop (running) or Resume session (stopped) in the toolbar and on the compact bar. */
  readonly showLaneControls = input(false);
  /** A stopped lane has a saved session to resume. */
  readonly resumable = input(false);
  readonly stopPending = input(false);
  readonly resumePending = input(false);
  /**
   * The lane's state as a toolbar chip (Stopped, Interrupted, Stop failed …),
   * the detail in its tooltip. The host derives it from the lane record.
   */
  readonly laneState = input<LaneStateChip | null>(null);

  /** One message the lane accepted. */
  readonly accepted = output<void>();
  readonly stopRequested = output<Event>();
  readonly resumeRequested = output<Event>();

  protected readonly delivery = inject(LaneDeliveryController);
  protected readonly composerInput = inject(ComposerInputController);
  protected readonly compactStore = inject(ComposerCompactStore);
  protected readonly attachments = inject(ComposerAttachmentsService);
  private readonly settings = inject(LaneTurnSettingsStore);
  private readonly monitor = inject(AgentMonitorStore);
  private readonly deliveryStore = inject(AgentDeliveryStore);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  private readonly instance = ++nextLaneComposerId;
  protected readonly fieldId = `lane-message-${this.instance}`;
  protected readonly fullId = `lane-composer-full-${this.instance}`;
  protected readonly lossTitleId = `lane-loss-title-${this.instance}`;
  protected readonly lossTextId = `lane-loss-text-${this.instance}`;
  protected readonly sendHintId = `lane-send-hint-${this.instance}`;

  // `chat-composer-card` / `chat-composer-column`: main chat's focus frame on
  // the card (the textarea draws no ring) and its denser glass fill (S2).
  protected readonly cardClass = `chat-composer-column chat-composer-card ${COMPOSER_CARD_CLASS} ${COMPOSER_CARD_BORDER_CLASS}`;
  protected readonly textareaClass = `ptah-fold-fade ${COMPOSER_TEXTAREA_CLASS}`;
  protected readonly sendButtonClass = COMPOSER_SEND_BUTTON_CLASS;
  protected readonly stopButtonClass = COMPOSER_STOP_BUTTON_CLASS;
  /** Resume session keeps the error tint only on a lane that failed (a user stop is no failure). */
  protected readonly resumeButtonClass = computed(() => {
    const record = this.record();
    const failed = (record?.status === 'failed' && record.stoppedByUser !== true) || record?.status === 'timeout';
    return failed ? COMPOSER_STOP_BUTTON_CLASS : RESUME_BUTTON_CLASS;
  });

  protected readonly ArrowUpIcon = ArrowUp;
  protected readonly SquareIcon = Square;
  protected readonly PlayIcon = Play;
  protected readonly WarnIcon = TriangleAlert;
  protected readonly ImageIconRef = ImageIcon;

  /** The draft text; the input controller edits it on insertions. */
  protected readonly draft = signal('');
  protected readonly confirmLoss = signal(false);
  private lossTarget: LossTarget = { kind: 'draft' };
  /** The last action's note (a pick, a chosen file, a sent message). */
  private readonly actionNote = signal<string | null>(null);
  protected readonly foldAnnouncement = signal('');

  private readonly composerRoot = viewChild.required<ElementRef<HTMLElement>>('composerRoot');
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('inputElement');
  private readonly dropdownRef = viewChild<UnifiedSuggestionsDropdownComponent>('suggestionsDropdown');
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly activity = viewChild(ComposerActivityDirective);
  private readonly attachMenu = viewChild(ComposerAttachMenuComponent);
  private readonly modelPicker = viewChild(ComposerModelPickerComponent);
  private readonly effortPicker = viewChild(ComposerEffortPickerComponent);

  protected readonly textareaOrigin = computed(() => {
    const ref = this.textareaRef();
    return ref ? { elementRef: ref } : null;
  });

  // ---- Lane state ----
  private readonly record = computed(() => this.monitor.agentsById().get(this.agentId()));
  /** The lane runs a turn (the host's `stopped` is false): the composer may fold and Stop shows. */
  protected readonly laneActive = computed(() => !this.stopped());
  protected readonly catalog = computed(() => this.settings.catalog(this.agentId()));
  protected readonly pending = computed(() => this.settings.pending(this.agentId()));
  private readonly turnInput = computed(() => this.settings.turnInput(this.agentId()));
  private readonly capabilities = computed((): EffectiveLaneCapabilities | undefined => {
    const { queue, now } = this.delivery.state();
    return queue?.effectiveCapabilities ?? now?.effectiveCapabilities ?? this.record()?.effectiveCapabilities;
  });
  /** The previews or the catalog failed: "Could not load lane options." with Retry. */
  protected readonly optionsFailed = computed(
    () => this.catalog().status === 'error' || (!this.delivery.previewsReady() && !!this.delivery.error()),
  );
  /** The lists shown are the last known ones: the host answered with an error beside them (M5). */
  protected readonly optionsStale = computed(
    () => !this.optionsFailed() && this.catalog().status === 'ready' && !!this.catalog().errorDetail,
  );
  /** First catalog load or no preview yet: gated controls wait (design-spec 4.8). */
  protected readonly checking = computed(
    () => !this.optionsFailed() && this.settings.isChecking(this.agentId()),
  );

  // ---- Model and effort ----
  protected readonly modelOptions = computed((): readonly ComposerModelOption[] =>
    (this.catalog().options?.models ?? []).map((model) => ({ id: model.id, name: model.name })),
  );
  /**
   * The model the next turn uses, as a catalog id when the catalog lists it,
   * so the pill keeps one label and the menu marks the row (M1). The record's
   * `model` comes before `observedModel`, which can lag a turn behind a change
   * (`LaneTurnSettingsStore`), and the multi-model id is never a selection.
   */
  protected readonly selectedModel = computed(() => {
    const record = this.record();
    const id = [this.pending().model, record?.model, this.catalog().options?.currentModel, laneLastRunModel(record)]
      .find((candidate): candidate is string => !!candidate && candidate !== MULTI_MODEL_ID);
    if (!id) return null;
    return findLaneModelOption(this.modelOptions(), id)?.id ?? id;
  });
  /** The pill text while no model is known: never a blank pill (M2). */
  protected readonly modelEmptyLabel = computed(() => {
    const status = this.catalog().status;
    if (status === 'idle' || status === 'loading' || this.checking()) return MODELS_LOADING_LABEL;
    return `${this.cli()} default`;
  });
  protected readonly effortOptions = computed((): readonly ComposerEffortOption[] => {
    const options = this.catalog().options;
    const isClaude = this.record()?.cli === 'claude';
    return [
      COMPOSER_EFFORT_OPTIONS[0],
      ...(options?.efforts ?? []).filter((id) => id !== '').map((id) => {
        const option = laneEffortOption(id, isClaude);
        return options?.unsendableEfforts?.includes(id)
          ? { ...option, description: 'Codex reports this level; this lane cannot send it' }
          : option;
      }),
    ];
  });
  protected readonly selectedEffort = computed(
    () => (this.pending().reasoningEffort ?? this.record()?.reasoningEffort ?? this.catalog().options?.currentEffort ?? '') as EffortLevel | '',
  );
  protected readonly settingFooter = computed(() => {
    const input = this.turnInput();
    return input.kind === 'reported' && input.turnInput.model.appliesAt === 'next-spawn'
      ? `${this.cli()} starts a new process each turn: applies when the next turn starts.`
      : this.stopped() ? STOPPED_FOOTER : NEXT_TURN_FOOTER;
  });
  protected readonly modelReason = computed(() => this.settingReason('model'));
  protected readonly effortReason = computed(() => this.settingReason('effort'));
  /** The model the provider confirmed (compact bar chip), never the pending pick. */
  protected readonly confirmedModelLabel = computed(() => {
    const record = this.record();
    const id = [record?.model, laneLastRunModel(record)].find(
      (candidate): candidate is string => !!candidate && candidate !== MULTI_MODEL_ID,
    );
    if (!id) return '';
    return findLaneModelOption(this.modelOptions(), id)?.name ?? id;
  });

  // ---- Approval ----
  protected readonly approvalLabel = computed(() => {
    if (this.checking()) return 'Checking';
    const approval = this.capabilities()?.effectiveApproval;
    if (this.optionsFailed() || !approval || approval.mode === 'unknown') return 'Unknown';
    return APPROVAL_LABELS[approval.mode];
  });
  protected readonly approvalReason = computed(() => {
    if (this.checking()) return LANE_OPTIONS_CHECKING_TEXT;
    if (this.optionsFailed()) return LANE_OPTIONS_ERROR_TEXT;
    return this.capabilities()?.effectiveApproval?.reason ?? null;
  });

  // ---- Attachments and `/` `@` ----
  /** The lane reported that it takes no images (Req 1.6). */
  private readonly imagesUnsupportedReason = computed(() => {
    const input = this.turnInput();
    if (input.kind !== 'reported' || input.turnInput.images.state === 'supported') return null;
    return input.turnInput.images.reason ?? `${this.cli()} lanes cannot take images.`;
  });
  protected readonly imagesBlocked = computed(
    () => this.imagesUnsupportedReason() !== null && this.attachments.images().length > 0,
  );
  /** The lane reported that it takes no files: `@` and Attach files say why instead. */
  private readonly filesUnsupportedReason = computed(() => {
    const input = this.turnInput();
    if (input.kind !== 'reported' || input.turnInput.files.state === 'supported') return null;
    return input.turnInput.files.reason ?? `${this.cli()} lanes cannot take files.`;
  });
  /** Past the host limits of one turn; the send would be refused (M2). */
  protected readonly attachmentLimitText = computed(() => {
    const images = this.attachments.images().length;
    const files = this.attachments.files().length;
    if (images > LANE_TURN_MAX_IMAGES) {
      return `A lane message takes at most ${LANE_TURN_MAX_IMAGES} images. Remove ${images - LANE_TURN_MAX_IMAGES} to send.`;
    }
    if (files > LANE_TURN_MAX_FILES) {
      return `A lane message takes at most ${LANE_TURN_MAX_FILES} files. Remove ${files - LANE_TURN_MAX_FILES} to send.`;
    }
    return null;
  });
  private readonly fileMode = computed((): ComposerFileMode => {
    const input = this.turnInput();
    return input.kind === 'reported' ? (input.turnInput.files.delivery ?? 'reference') : 'reference';
  });
  protected readonly fileFooter = computed(() =>
    this.fileMode() === 'path-text'
      ? `${this.cli()} takes files as text: the path is inserted into your message.`
      : 'Chosen files are sent as file references.',
  );
  private readonly commandSource = computed((): ComposerCommandSource => {
    const catalog = this.catalog();
    const input = this.turnInput();
    if (catalog.status === 'error') return { state: 'unsupported', reason: LANE_OPTIONS_ERROR_TEXT };
    if (input.kind === 'unreported') return { state: 'unsupported', reason: input.reason };
    if (input.kind === 'checking' || catalog.status !== 'ready') return { state: 'loading' };
    const { commands, skills } = input.turnInput;
    const cli = this.cli();
    if (commands.state !== 'supported' && skills.state !== 'supported') {
      return { state: 'unsupported', reason: `${cli} lanes take no slash commands or skills.` };
    }
    const blocked = new Set(commands.blocked ?? []);
    const entries = (catalog.options?.commands ?? []).filter((entry) => !blocked.has(entry.name));
    // A stopped lane with no cached list: the host says when the list appears (S2).
    const notLoaded = catalog.options?.unavailableReason;
    const group = (
      label: string,
      kind: LaneComposerCommandOption['group'],
      supported: boolean,
      reason: string | undefined,
      noneText: string,
    ): ComposerCommandGroup => ({
      label,
      commands: supported ? entries.filter((entry) => entry.group === kind).map(commandSuggestion) : [],
      emptyReason: supported ? (notLoaded ?? noneText) : (reason ?? noneText),
    });
    return {
      state: 'ready',
      groups: [
        group('Commands', 'command', commands.state === 'supported', commands.reason, `No slash commands in ${cli} lanes.`),
        group('Skills', 'skill', skills.state === 'supported', skills.reason, `No skills in ${cli} lanes.`),
      ],
    };
  });

  // ---- Queued cards ----
  protected readonly queuedItems = computed((): readonly QueuedMessageView[] => {
    const busy = this.delivery.sending();
    return (this.deliveryStore.receipts().get(this.agentId()) ?? [])
      .filter((receipt) => receipt.state === 'accepted' && receipt.delivery === 'queue')
      .map((receipt) => {
        const own = receipt.sender === 'user';
        return {
          id: receipt.id,
          content: receipt.preview ?? '',
          statusLabel: 'Queued for the next turn',
          withdrawable: own,
          senderNote: own ? undefined : 'Sent by the parent session',
          busy,
          sendable: own,
        };
      });
  });
  protected readonly sendNowAction = computed((): QueuedSendNowAction => {
    const { now, nowDisabledReason } = this.delivery.state();
    if (this.stopped() || !now) return { label: 'Send now', hint: STEER_HINT, state: 'hidden' };
    if (!now.supported || nowDisabledReason) {
      return { label: 'Send now', hint: STEER_HINT, state: 'unavailable', reason: nowDisabledReason };
    }
    return now.mode === 'interrupt-resume'
      ? { label: 'Interrupt & send', hint: INTERRUPT_HINT, state: 'available' }
      : { label: 'Send now', hint: STEER_HINT, state: 'available' };
  });
  protected readonly lossText = computed(
    () => this.delivery.state().now?.lossDisclosure?.text
      ?? `Work this turn has not finished will be discarded. ${this.cli()} keeps the conversation, and your message starts the next turn.`,
  );

  // ---- Send and the status line ----
  protected readonly sendDisabled = computed(
    () => this.delivery.queueDisabled() || this.imagesBlocked() || this.attachmentLimitText() !== null
      || this.attachments.pendingReads() > 0,
  );
  /** Send's tooltip and description: why it cannot send, else what a send does (resume, queue, steer). */
  protected readonly sendTitle = computed(() => {
    if (this.imagesBlocked()) return this.imagesBlockedText();
    const overLimit = this.attachmentLimitText();
    if (overLimit) return overLimit;
    if (this.stopped()) return this.delivery.hint();
    return this.delivery.state().queueDisabledReason ?? this.delivery.hint();
  });
  /** The lane's own reason (e.g. "Images need a running lane."), then what to do. */
  private readonly imagesBlockedText = computed(() => {
    const reason = this.imagesUnsupportedReason() ?? `${this.cli()} lanes cannot take images.`;
    return `${reason} Remove the image to send.`;
  });
  /**
   * The in-card note: what to fix before sending (the image block, the
   * attachment limit), else the last action's note. Empty most of the time;
   * the mode hint lives on Send and the lane state on its chip.
   */
  protected readonly noticeText = computed(() => {
    if (this.imagesBlocked()) return this.imagesBlockedText();
    const overLimit = this.attachmentLimitText();
    if (overLimit) return overLimit;
    return this.composerInput.statusNote() ?? this.actionNote() ?? this.recoveredNote();
  });
  /** Recovered messages still queued: they load into the draft one at a time. */
  private readonly recoveredNote = computed(() => {
    const waiting = this.deliveryStore.recovered().get(this.agentId());
    const count = Array.isArray(waiting) ? waiting.length : waiting ? 1 : 0;
    if (count === 0) return '';
    return count === 1
      ? '1 recovered message waits. It loads here when the draft is empty.'
      : `${count} recovered messages wait. Each loads here, one at a time, when the draft is empty.`;
  });
  protected readonly noticeNeedsAction = computed(
    () => this.imagesBlocked() || this.attachmentLimitText() !== null,
  );
  /** An error the user must see (announced), or stale lists with Retry. */
  protected readonly cardAlert = computed((): { text: string; tone: 'err' | 'need'; retry: boolean } | null => {
    if (this.optionsFailed()) return { text: LANE_OPTIONS_ERROR_TEXT, tone: 'err', retry: true };
    const error = this.delivery.error();
    if (error) return { text: error, tone: 'err', retry: false };
    if (this.optionsStale()) return { text: LANE_OPTIONS_STALE_TEXT, tone: 'need', retry: true };
    return null;
  });
  /** The composer controls this lane cannot use here, with reasons: the "N limited" badge. */
  protected readonly limitations = computed((): readonly LaneLimitation[] => {
    if (this.checking() || this.optionsFailed()) return [];
    const action = this.sendNowAction();
    return laneLimitations({
      model: this.modelReason(),
      effort: this.effortReason(),
      images: this.imagesUnsupportedReason(),
      approval: this.capabilities()?.effectiveApproval,
      sendNow: action.state === 'unavailable' ? (action.reason ?? 'Send now is unavailable.') : null,
    });
  });
  protected readonly limitedTooltip = computed(() => limitedTooltip(this.limitations()));
  protected readonly limitedLabel = computed(() => limitedLabel(this.limitations()));
  protected readonly placeholder = computed(() =>
    lanePlaceholder(this.laneLabel(), this.stopped(), this.delivery.restart()),
  );
  protected readonly sendLabel = computed(() => laneSendLabel(this.stopped(), this.delivery.restart()));

  /** The folded bar's line: "Stopping…" once Stop was pressed, else the lane at work. */
  protected readonly compactStatus = computed(() =>
    this.laneState()?.label === STOPPING_LABEL ? STOPPING_LABEL : `${this.cli()} is working…`,
  );

  /** The composer is folded into its one-row bar. */
  protected readonly isCompact = this.compactStore.compact;

  constructor() {
    this.delivery.connect({
      agentId: this.agentId,
      draft: this.draft,
      stopped: this.stopped,
      cli: this.cli,
      accepted: () => this.accepted.emit(),
    });
    this.composerInput.connect({
      text: this.draft,
      textarea: this.textareaRef,
      dropdown: this.dropdownRef,
      commands: this.commandSource,
      fileMode: this.fileMode,
      filesUnsupportedReason: this.filesUnsupportedReason,
      prompts: false,
      submit: () => {
        if (!this.confirmLoss()) void this.send();
      },
      submitNow: () => {
        if (!this.confirmLoss()) void this.requestNow();
      },
    });
    this.compactStore.connect({
      scope: this.agentId,
      streaming: this.laneActive,
      hasContent: computed(
        () => this.draft().length > 0 || this.attachments.files().length > 0 || this.attachments.images().length > 0,
      ),
      focused: computed(() => this.activity()?.focusWithin() ?? false),
      overlayOpen: computed(
        () =>
          this.confirmLoss() ||
          this.composerInput.showSuggestions() ||
          (this.attachMenu()?.isOpen() ?? false) ||
          (this.modelPicker()?.isOpen() ?? false) ||
          (this.effortPicker()?.isOpen() ?? false) ||
          (this.activity()?.popoverOpen() ?? false),
      ),
      dragging: this.composerInput.dragging,
    });

    effect(() => {
      // A lane switch drops this composer's overlays and notes; the
      // controller resets the draft and tray. Load the lane's options.
      const agentId = this.agentId();
      untracked(() => {
        this.confirmLoss.set(false);
        this.actionNote.set(null);
        const status = this.settings.catalog(agentId).status;
        if (status === 'idle' || status === 'error') void this.settings.loadCatalog(agentId);
      });
    });
    // The host learns a resumed lane's model from the SDK's system init, after
    // the catalog was read at mount (D8: the pill said "claude default"). A
    // turn that settles while no model is known re-reads the catalog once, so
    // the pill names the model the lane really runs.
    let previousStatus: string | undefined;
    effect(() => {
      const record = this.record();
      const status = record?.status;
      const settled = previousStatus !== undefined && previousStatus !== status &&
        (previousStatus === 'running' || previousStatus === 'starting');
      previousStatus = status;
      if (!settled || !record || record.model || laneLastRunModel(record)) return;
      untracked(() => {
        const catalog = this.settings.catalog(this.agentId());
        if (catalog.status === 'ready' && !catalog.options?.currentModel) void this.loadCatalog();
      });
    });
    let wasStopped: boolean | undefined;
    effect(() => {
      // A note about the last send describes the lane state it was made in
      // ("Sent. It joined the running turn."). When the lane starts or ends
      // a run, the note is stale and the mode hint takes over (M3).
      const stopped = this.stopped();
      if (wasStopped !== undefined && wasStopped !== stopped) untracked(() => this.actionNote.set(null));
      wasStopped = stopped;
    });
    effect(() => {
      if (this.confirmLoss()) this.confirmButton()?.nativeElement.focus();
    });
    let announced = false;
    effect(() => {
      const compact = this.isCompact();
      if (!announced && !compact) return;
      announced = true;
      untracked(() => {
        this.foldAnnouncement.set(
          compact ? `Composer minimized while ${this.cli()} works. Start typing to expand it.` : 'Composer expanded.',
        );
        if (compact || !this.focusTextareaOnExpand) return;
        this.focusTextareaOnExpand = false;
        afterNextRender(
          () => {
            const active = this.composerRoot().nativeElement.ownerDocument.activeElement;
            if (active && active !== active.ownerDocument.body) return;
            this.textareaRef()?.nativeElement.focus({ preventScroll: true });
          },
          { injector: this.injector },
        );
      });
    });
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    // The last action's note describes the previous draft; editing ends it.
    this.actionNote.set(null);
    this.delivery.draftChanged();
  }

  protected onKeydown(event: KeyboardEvent): void {
    // IME composition owns Enter until it commits (checked in handleKeyDown).
    this.composerInput.handleKeyDown(event);
  }

  protected onSuggestionSelected(suggestion: SuggestionItem): void {
    this.composerInput.handleSuggestionSelected(suggestion);
    if (suggestion.type === 'file' && this.fileMode() === 'reference') {
      this.actionNote.set('Added as a file reference.');
    }
  }

  /** Attach files, unless the lane reported that it takes none. */
  protected pickFiles(): void {
    const reason = this.filesUnsupportedReason();
    if (reason) this.actionNote.set(reason);
    else void this.attachments.pickFiles();
  }

  protected loadCatalog(): void {
    void this.settings.loadCatalog(this.agentId());
  }

  protected retryOptions(): void {
    this.delivery.refreshPreviews();
    this.loadCatalog();
  }

  protected pickModel(id: string): void {
    this.settings.pickModel(this.agentId(), id);
    const name = this.modelOptions().find((model) => model.id === id)?.name ?? id;
    this.actionNote.set(`Model set to ${name}. ${this.settingFooter()}`);
  }

  protected pickEffort(option: ComposerEffortOption): void {
    this.settings.pickEffort(this.agentId(), option.value || null);
    this.actionNote.set(`Effort set to ${option.label}. ${this.settingFooter()}`);
  }

  protected async send(): Promise<void> {
    // The loss dialog owns input until it closes (its background is inert).
    if (this.sendDisabled() || this.confirmLoss()) return;
    const queuedBehindTurn = this.laneActive();
    await this.delivery.send('queue');
    if (this.delivery.error()) return;
    if (queuedBehindTurn) {
      this.actionNote.set('Queued for the next turn. Withdraw it until the lane starts it.');
    } else if (this.stopped()) {
      // Until the record reports the resumed run, the stopped-lane hint
      // ("Resume with message: …") would still describe the old state (M3).
      const verb = this.delivery.restart() === 'warm' ? 'continues' : 'resumes';
      this.actionNote.set(`Sent. ${this.cli()} ${verb} with your message.`);
    }
  }

  /** Ctrl/Cmd+Enter: Send now for the draft, after the loss confirmation when the turn would lose work. */
  protected async requestNow(): Promise<void> {
    if (this.confirmLoss() || this.preparingNow) return;
    if (this.stopped() || this.delivery.nowDisabled() || this.imagesBlocked() || this.attachmentLimitText()) return;
    if (this.waitForReads()) return;
    // The lane can change while the refresh runs (a dock click); the draft
    // then belongs to another lane and must not be sent (PR 1512 review).
    const lane = this.agentId();
    // Steer or interrupt is the running turn's state now, not at the last refresh.
    if (!(await this.prepareNow())) return;
    if (this.agentId() !== lane) return;
    if (this.confirmLoss() || this.stopped() || this.delivery.nowDisabled()) return;
    // The tray can change during the refresh. A block shows its reason on
    // the status line (imagesBlockedText / attachmentLimitText); a read waits.
    if (this.imagesBlocked() || this.attachmentLimitText() || this.waitForReads()) return;
    this.lossTarget = { kind: 'draft' };
    if (this.delivery.nowNeedsConfirmation()) this.confirmLoss.set(true);
    else void this.sendNow(false);
  }

  /** A Send now decision waits for fresh previews; a second request meanwhile is ignored. */
  private preparingNow = false;

  /** Refresh the previews before a Send now decision. False when the refresh failed (its error shows). */
  private async prepareNow(): Promise<boolean> {
    this.preparingNow = true;
    try {
      return await this.delivery.refreshBeforeSend();
    } finally {
      this.preparingNow = false;
    }
  }

  /**
   * Send now refuses while an attachment is still being read, so the read
   * never lands in the tray after its message left. True when it refused.
   */
  private waitForReads(): boolean {
    if (this.attachments.pendingReads() === 0) return false;
    this.actionNote.set(ATTACHMENT_READING_TEXT);
    return true;
  }

  /** The queued card's Send now / Interrupt & send. */
  protected async requestQueuedNow(id: string): Promise<void> {
    // An open dialog keeps its target: confirming sends what it was opened for.
    if (this.confirmLoss() || this.preparingNow) return;
    const lane = this.agentId();
    if (!(await this.prepareNow())) return;
    // The queued card belongs to the lane it was shown for (PR 1512 review).
    if (this.agentId() !== lane) return;
    if (this.confirmLoss() || this.stopped() || !this.delivery.state().now || this.delivery.state().nowDisabledReason) return;
    this.lossTarget = { kind: 'queued', id };
    if (this.delivery.nowNeedsConfirmation()) this.confirmLoss.set(true);
    else void this.sendNow(false);
  }

  protected confirmNow(): void {
    this.confirmLoss.set(false);
    void this.sendNow(true);
  }

  protected closeLoss(): void {
    this.confirmLoss.set(false);
    // The field is inert until the dialog leaves the view; focus it after that render.
    afterNextRender(() => this.textareaRef()?.nativeElement.focus(), { injector: this.injector });
  }

  protected withdraw(id: string): void {
    void this.delivery.withdraw(id);
  }

  private async sendNow(allowPartialTurnLoss: boolean): Promise<void> {
    const target = this.lossTarget;
    // An attachment can start reading while the loss dialog is open.
    if (target.kind === 'draft' && this.waitForReads()) return;
    const interrupt = this.delivery.state().now?.mode === 'interrupt-resume';
    if (target.kind === 'draft') await this.delivery.send('now', allowPartialTurnLoss);
    else await this.delivery.sendQueuedNow(target.id, allowPartialTurnLoss);
    if (this.delivery.error()) return;
    this.actionNote.set(
      interrupt ? 'Turn ended. Same session. Your message starts the next turn.' : 'Sent. It joined the running turn.',
    );
  }

  protected trapDialog(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const first = this.confirmButton()?.nativeElement;
    const last = this.cancelButton()?.nativeElement;
    if (!first || !last) return;
    const active = this.composerRoot().nativeElement.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ---- Compact bar (rules in ComposerCompactStore) ----

  /** Open the full composer and put focus in the textarea, inside the triggering event. */
  protected expandComposer(): void {
    this.compactStore.expand();
    this.cdr.detectChanges();
    this.textareaRef()?.nativeElement.focus({ preventScroll: true });
  }

  /** A printable key on the folded bar expands it; the key lands in the textarea. */
  protected onRootKeydown(event: KeyboardEvent): void {
    if (!this.isCompact()) return;
    if (isTypeToExpandKey(event, { view: this.composerRoot().nativeElement, ownsDocumentFocus: false })) {
      this.expandComposer();
    }
  }

  /** Paste on the folded bar: expand, then take the clipboard text and images. */
  protected onRootPaste(event: ClipboardEvent): void {
    if (!this.isCompact()) return;
    // The textarea takes its own paste (its handler ran first). A paste that
    // reaches it while the composer is folded (it is inert then, so only a
    // scripted event or a fold racing the paste) must not be taken twice.
    if (event.target === this.textareaRef()?.nativeElement) {
      this.expandComposer();
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    this.expandComposer();
    if (text) this.draft.update((current) => current + text);
    this.composerInput.handlePaste(event);
  }

  protected handleDragOver(event: DragEvent): void {
    if (this.composerInput.handleDragOver(event) && this.isCompact()) this.compactStore.expand();
  }

  /**
   * Stop from the bar. The bar turns inert when the turn ends, which drops
   * its focus; the textarea takes it back on that expand.
   */
  protected stopFromCompact(): void {
    this.focusTextareaOnExpand = true;
    this.stopRequested.emit(new Event('stop'));
  }
  private focusTextareaOnExpand = false;

  private settingReason(kind: 'model' | 'effort'): string | null {
    if (this.checking()) return LANE_OPTIONS_CHECKING_TEXT;
    if (this.optionsFailed()) return LANE_OPTIONS_ERROR_TEXT;
    const input = this.turnInput();
    if (input.kind === 'unreported') return input.reason;
    if (input.kind === 'checking') return LANE_OPTIONS_CHECKING_TEXT;
    const support = input.turnInput[kind];
    if (support.state !== 'supported') {
      return support.reason ?? `${this.cli()} lanes cannot change the ${kind === 'model' ? 'model' : 'reasoning effort'} here.`;
    }
    const options = this.catalog().options;
    if (kind === 'effort' && (options?.efforts.length ?? 0) === 0) {
      return options?.unavailableReason ?? `${this.cli()} reports no reasoning effort levels.`;
    }
    return null;
  }
}
