import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import {
  AgentDeliveryStore,
  AgentMonitorStore,
  LaneTurnSettingsStore,
} from '@ptah-extension/chat-streaming';
import type {
  AgentDeliveryReceipt,
  AgentMessageDelivery,
  LaneTurnRequest,
  LaneTurnSettings,
} from '@ptah-extension/shared';
import {
  ComposerAttachmentsService,
  type ComposerImage,
} from '../../../services/composer-attachments.service';
import { FilePickerService, type ChatFile } from '../../../services/file-picker.service';

/** Everything a lane message carried besides its text, kept so a failure can put it back. */
export interface LaneTurnSnapshot {
  readonly files: readonly ChatFile[];
  readonly images: readonly ComposerImage[];
  readonly settings: LaneTurnSettings;
}

/** What the owning lane composer wires into the controller. */
export interface LaneDeliverySources {
  readonly agentId: Signal<string>;
  /** The draft text; the owner syncs the textarea into it. */
  readonly draft: WritableSignal<string>;
  readonly stopped: Signal<boolean>;
  readonly cli: Signal<string>;
  readonly resumePath: Signal<string | null>;
  /** Called once per message the lane accepted. */
  readonly accepted: () => void;
}

interface AcceptedMessage {
  readonly agentId: string;
  readonly text: string;
  readonly snapshot: LaneTurnSnapshot;
}

/** The last submission that did not reach the backend; a retry of the same content reuses its key. */
interface Submission {
  readonly agentId: string;
  readonly signature: string;
  readonly key: string;
}

const EMPTY_SNAPSHOT: LaneTurnSnapshot = { files: [], images: [], settings: {} };
const ACCEPTED_CAP = 32;
const ACCEPTED_PER_LANE_CAP = 8;
/** Reasons the backend gives when it refuses a turn's settings or input at flush. */
const TURN_REFUSAL_REASONS: ReadonlySet<string> = new Set(['turn-options-refused', 'turn-input-unsupported']);

/**
 * Accepted messages by receipt id, shared across composer mounts so a tab
 * switch does not discard accepted text or its attachments. Bounded: at most
 * {@link ACCEPTED_CAP} entries and {@link ACCEPTED_PER_LANE_CAP} per lane.
 */
const acceptedMessages = new Map<string, AcceptedMessage>();

function isEmptySnapshot(snapshot: LaneTurnSnapshot): boolean {
  return snapshot.files.length === 0 && snapshot.images.length === 0
    && snapshot.settings.model === undefined && snapshot.settings.reasoningEffort === undefined;
}

/** `later` attachments after `earlier`'s, without duplicates; `later` settings win. */
function mergeSnapshots(earlier: LaneTurnSnapshot, later: LaneTurnSnapshot): LaneTurnSnapshot {
  const paths = new Set(earlier.files.map((file) => file.path));
  const imageIds = new Set(earlier.images.map((image) => image.id));
  return {
    files: [...earlier.files, ...later.files.filter((file) => !paths.has(file.path))],
    images: [...earlier.images, ...later.images.filter((image) => !imageIds.has(image.id))],
    settings: {
      ...(later.settings.model ?? earlier.settings.model
        ? { model: later.settings.model ?? earlier.settings.model } : {}),
      ...(later.settings.reasoningEffort ?? earlier.settings.reasoningEffort
        ? { reasoningEffort: later.settings.reasoningEffort ?? earlier.settings.reasoningEffort } : {}),
    },
  };
}

function toTurnRequest(snapshot: LaneTurnSnapshot): LaneTurnRequest | undefined {
  if (isEmptySnapshot(snapshot)) return undefined;
  const { model, reasoningEffort } = snapshot.settings;
  return {
    ...(model !== undefined ? { model } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(snapshot.images.length ? { images: snapshot.images.map(({ data, mediaType }) => ({ data, mediaType })) } : {}),
    ...(snapshot.files.length ? { files: snapshot.files.map((file) => file.path) } : {}),
  };
}

function receiptRefusalText(receipt: AgentDeliveryReceipt): string {
  if (receipt.reason === 'agent_stopped') return 'The lane stopped before receiving this message.';
  if (receipt.reason === 'host-restarted') return 'The host restarted before delivery.';
  if (receipt.reason && TURN_REFUSAL_REASONS.has(receipt.reason)) {
    return receipt.lastError ?? 'Change the setting or attachment and send again.';
  }
  if (receipt.state === 'expired') return 'The queued message expired before delivery.';
  if (receipt.state === 'interrupted-undelivered') return 'Resume the lane to send it again.';
  return 'Message was not sent.';
}

/**
 * Delivery behaviour of a lane composer: previews, send (queue or now),
 * coalescing a new draft with the queued message, idempotency key reuse,
 * receipt-driven restore, Recover text, the limit hold and Edit (withdraw).
 *
 * Each accepted message keeps its turn snapshot (files, images, model and
 * effort) beside its text, so a message the lane later refuses or drops puts
 * all of it back into the composer.
 *
 * Provided per composer (component providers) beside
 * `ComposerAttachmentsService`. Call `connect` once, from the owning component.
 */
@Injectable()
export class LaneDeliveryController {
  private readonly monitor = inject(AgentMonitorStore);
  private readonly store = inject(AgentDeliveryStore);
  private readonly settings = inject(LaneTurnSettingsStore);
  private readonly attachments = inject(ComposerAttachmentsService);
  private readonly filePicker = inject(FilePickerService);

  private readonly sources = signal<LaneDeliverySources | null>(null);
  private readonly cancelling = new Set<string>();
  private submission: Submission | null = null;

  private readonly _sending = signal(false);
  readonly sending = this._sending.asReadonly();
  private readonly _error = signal<string | null>(null);
  /** The last send, preview or restore problem; cleared when the user edits the draft. */
  readonly error = this._error.asReadonly();

  private readonly agentId = computed(() => this.sources()?.agentId() ?? '');
  private readonly draftText = computed(() => this.sources()?.draft().trim() ?? '');

  readonly state = computed(() => this.store.composerState(this.agentId()));
  /** False until both previews have answered. */
  readonly previewsReady = computed(() => !!this.state().queue && !!this.state().now);
  readonly queuedReceipts = computed(() =>
    (this.store.receipts().get(this.agentId()) ?? []).filter(
      (receipt) => receipt.state === 'accepted' && receipt.delivery === 'queue' && receipt.sender === 'user',
    ),
  );
  readonly lastReceiptLabel = computed(() => {
    const receipts = this.store.receipts().get(this.agentId()) ?? [];
    return receipts.length ? this.store.receiptLabel(receipts[receipts.length - 1]) : '';
  });
  readonly queueDisabled = computed(
    () => this._sending() || !this.draftText() || !this.state().queue || !!this.state().queueDisabledReason,
  );
  readonly nowDisabled = computed(
    () => this._sending() || !this.draftText() || !this.state().now || !!this.state().nowDisabledReason,
  );
  /** Send now discards partial work of the running turn; the owner confirms first. */
  readonly nowNeedsConfirmation = computed(() => !!this.state().now?.lossDisclosure?.confirmationRequired);
  readonly resumeDescription = computed(() => {
    const preview = this.state().queue;
    if (!preview) return 'Checking resume path…';
    if (!preview.usesResume) return 'Start fresh handoff';
    return this.sources()?.resumePath() ?? 'Resume saved conversation';
  });
  readonly hint = computed(() => {
    const sources = this.sources();
    if (sources?.stopped()) return `Resume with message: ${this.resumeDescription()}`;
    if (!this.previewsReady()) return 'Checking message options…';
    const { now, nowDisabledReason } = this.state();
    const nowText = now?.mode === 'steer' ? 'steers into the running turn'
      : now?.mode === 'interrupt-resume' ? 'interrupts and restarts the turn'
      : `not supported by ${sources?.cli() ?? 'CLI'}${nowDisabledReason ? `: ${nowDisabledReason}` : ''}`;
    return `Send: queued for next turn · Send now: ${nowText}`;
  });

  private readonly previewKey = computed(() => {
    const id = this.agentId();
    return `${this.sources()?.stopped() ?? false}:${this.monitor.agentsById().get(id)?.status ?? ''}:${this.state().queue?.mode ?? ''}:${this.state().now?.mode ?? ''}`;
  });

  constructor() {
    effect(() => {
      // A lane switch starts from an empty draft and fresh previews.
      const sources = this.sources();
      const agentId = this.agentId();
      if (!sources || !agentId) return;
      untracked(() => {
        sources.draft.set('');
        this.attachments.clear();
        this._error.set(null);
        this._sending.set(false);
        void this.loadPreviews(agentId);
      });
    });
    let previousPreviewKey: string | undefined;
    effect(() => {
      if (!this.sources()) return;
      const key = this.previewKey();
      const agentId = this.agentId();
      if (previousPreviewKey === undefined) { previousPreviewKey = key; return; }
      if (previousPreviewKey === key) return;
      previousPreviewKey = key;
      untracked(() => void this.loadPreviews(agentId));
    });
    effect(() => {
      if (!this.sources()) return;
      const receipts = this.store.receipts().get(this.agentId()) ?? [];
      untracked(() => {
        for (const receipt of receipts) this.processReceipt(receipt);
      });
    });
    effect(() => {
      // Text recovered from an undelivered message ("Recover text") lands in this draft.
      if (!this.sources()) return;
      const agentId = this.agentId();
      if (!this.store.recovered().has(agentId)) return;
      untracked(() => {
        const text = this.store.takeRecovered(agentId);
        if (text) this.restore(text, EMPTY_SNAPSHOT);
      });
    });
  }

  connect(sources: LaneDeliverySources): void {
    this.sources.set(sources);
  }

  /** The user edited the draft. */
  draftChanged(): void {
    this._error.set(null);
  }

  refreshPreviews(): void {
    const agentId = this.agentId();
    if (agentId) void this.loadPreviews(agentId);
  }

  /**
   * Send the draft with its attachments and the lane's pending model and
   * effort. Queue sends fold an earlier queued message of this composer into
   * one message. Send now needs `allowPartialTurnLoss` when
   * {@link nowNeedsConfirmation} is true.
   */
  async send(delivery: AgentMessageDelivery, allowPartialTurnLoss = false): Promise<void> {
    const sources = this.sources();
    if (!sources) return;
    if (delivery === 'now' ? this.nowDisabled() : this.queueDisabled()) return;
    if (delivery === 'now' && sources.stopped()) return;
    const agentId = this.agentId();
    const draftText = this.draftText();
    const sent = this.attachments.snapshotForSend();
    const draftSnapshot: LaneTurnSnapshot = {
      files: sent.attachments.files,
      images: sent.attachments.images,
      settings: this.settings.turnSettings(agentId) ?? {},
    };
    let text = draftText;
    let snapshot = draftSnapshot;
    let earlierQueuedId: string | null = null;
    this._sending.set(true);
    this._error.set(null);
    try {
      if (delivery === 'queue') {
        const queued = this.queuedReceipts()[0];
        const earlier = queued ? acceptedMessages.get(queued.id) : undefined;
        if (queued && earlier?.agentId === agentId) {
          earlierQueuedId = queued.id;
          text = `${earlier.text}\n${draftText}`;
          snapshot = mergeSnapshots(earlier.snapshot, draftSnapshot);
        }
      }
      const turn = toTurnRequest(snapshot);
      const outcome = await this.store.sendMessage(
        agentId, text, delivery, allowPartialTurnLoss, this.submissionKey(agentId, text, delivery, turn), turn,
      );
      this.submission = null;
      if (this.agentId() !== agentId) return;
      const receipt = outcome.receipt;
      const limitHeld = receipt?.state === 'blocked-retryable' && receipt.reason === 'lane-at-limit';
      if (!limitHeld && (outcome.mode === 'unsupported' || (receipt && receipt.state !== 'accepted' && receipt.state !== 'started'))) {
        // Refused at send: the draft, its attachments and the pick stay where they are.
        this._error.set(outcome.detail ?? 'Could not send your message. Try again.');
        this.refreshPreviews();
        return;
      }
      if (!receipt) { this._error.set('No message receipt was returned. Try again.'); return; }
      if (sources.draft().trim() === draftText) sources.draft.set('');
      sent.removeSent();
      if (receipt.state === 'accepted' || limitHeld) {
        this.remember(receipt.id, { agentId, text, snapshot });
        const latest = this.store.receipt(agentId, receipt.id);
        if (latest) this.processReceipt(latest);
      }
      if (earlierQueuedId) await this.withdrawCombined(agentId, earlierQueuedId);
      sources.accepted();
    } catch {
      if (this.agentId() === agentId) {
        this._error.set('Could not send your message. Try again.');
        this.refreshPreviews();
      }
    } finally {
      if (this.agentId() === agentId) this._sending.set(false);
    }
  }

  /** Edit a queued message: withdraw it and put its text and turn snapshot back into the composer. */
  async withdraw(messageId: string): Promise<void> {
    const agentId = this.agentId();
    if (!agentId) return;
    this._sending.set(true);
    this.cancelling.add(messageId);
    try {
      // After a reload the message lives only in the backend: read it before the cancel drops it.
      const local = acceptedMessages.get(messageId);
      let text: string;
      let snapshot: LaneTurnSnapshot;
      if (local?.agentId === agentId) ({ text, snapshot } = local);
      else {
        try {
          const recovered = await this.store.recoverQueuedMessage(agentId, messageId);
          text = recovered.text;
          snapshot = this.snapshotFromTurn(recovered.turn);
        } catch {
          // degradation-audit: reported - the cancel would drop the only copy of
          // the message, so Edit stops, shows the error, and the queued message
          // stays for a retry.
          this._error.set('Could not load the queued message to edit. Try again.');
          return;
        }
      }
      const receipt = await this.store.cancelMessage(agentId, messageId);
      if (receipt.reason === 'cancelled-by-user') {
        this.restore(text, snapshot);
        acceptedMessages.delete(messageId);
      } else this._error.set('Message already started and could not be cancelled.');
    } catch {
      this._error.set('Could not cancel the queued message. Try again.');
    } finally {
      this.cancelling.delete(messageId);
      if (this.agentId() === agentId) this._sending.set(false);
    }
  }

  private processReceipt(receipt: AgentDeliveryReceipt): void {
    if (this.cancelling.has(receipt.id)) return;
    const pending = acceptedMessages.get(receipt.id);
    if (!pending || pending.agentId !== this.agentId() || !pending.text) return;
    if (receipt.state === 'failed' || receipt.state === 'expired' || receipt.state === 'interrupted-undelivered') {
      this.restore(pending.text, pending.snapshot);
      this._error.set(`${this.store.receiptStatus(receipt).label}: ${receiptRefusalText(receipt)}`);
      acceptedMessages.delete(receipt.id);
    } else if (receipt.state === 'settled') acceptedMessages.delete(receipt.id);
  }

  /** Cancel the earlier queued message a combined send already carries. */
  private async withdrawCombined(agentId: string, earlierQueuedId: string): Promise<void> {
    // The combined message already carries the earlier content, so the earlier
    // receipt must never restore it, even when its cancel push arrives before
    // this RPC resolves.
    acceptedMessages.delete(earlierQueuedId);
    this.cancelling.add(earlierQueuedId);
    try {
      const cancelled = await this.store.cancelMessage(agentId, earlierQueuedId);
      if (cancelled.reason !== 'cancelled-by-user') this._error.set('Earlier message already started; both messages may be delivered.');
    } catch {
      this._error.set('Could not cancel the earlier message; both messages may be delivered.');
    } finally {
      this.cancelling.delete(earlierQueuedId);
    }
  }

  /** Put text and its snapshot back: text after the current draft, attachments beside the tray's, the pick back. */
  private restore(text: string, snapshot: LaneTurnSnapshot): void {
    const sources = this.sources();
    if (!sources) return;
    sources.draft.update((draft) => (draft.trim() ? `${draft}\n${text}` : text));
    for (const file of snapshot.files) this.attachments.addFile(file);
    if (snapshot.images.length) {
      this.attachments.images.update((images) => {
        const ids = new Set(images.map((image) => image.id));
        return [...images, ...snapshot.images.filter((image) => !ids.has(image.id))];
      });
    }
    const agentId = this.agentId();
    if (snapshot.settings.model !== undefined) this.settings.pickModel(agentId, snapshot.settings.model);
    if (snapshot.settings.reasoningEffort !== undefined) this.settings.pickEffort(agentId, snapshot.settings.reasoningEffort);
  }

  private remember(messageId: string, message: AcceptedMessage): void {
    acceptedMessages.set(messageId, message);
    let laneCount = 0;
    for (const item of acceptedMessages.values()) if (item.agentId === message.agentId) laneCount++;
    for (const [id, item] of acceptedMessages) {
      if (acceptedMessages.size <= ACCEPTED_CAP && laneCount <= ACCEPTED_PER_LANE_CAP) break;
      if (item.agentId === message.agentId || acceptedMessages.size > ACCEPTED_CAP) {
        acceptedMessages.delete(id);
        if (item.agentId === message.agentId) laneCount--;
      }
    }
  }

  /** A snapshot from the turn the backend kept for a queued message. */
  private snapshotFromTurn(turn: LaneTurnRequest | undefined): LaneTurnSnapshot {
    if (!turn) return EMPTY_SNAPSHOT;
    const files: ChatFile[] = (turn.files ?? []).map((path) => {
      const isText = this.filePicker.isFileSupported(path);
      return {
        path,
        name: path.replace(/\\/g, '/').split('/').pop() || path,
        size: 0,
        type: isText ? 'text' : 'binary',
        isLarge: false,
        tokenEstimate: 0,
      };
    });
    const images: ComposerImage[] = (turn.images ?? []).map(({ data, mediaType }, index) => ({
      id: `img_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      data,
      mediaType,
      dataUrl: `data:${mediaType};base64,${data}`,
      name: `image-${index + 1}.${mediaType.split('/')[1] ?? 'png'}`,
    }));
    return {
      files,
      images,
      settings: {
        ...(turn.model !== undefined ? { model: turn.model } : {}),
        ...(turn.reasoningEffort !== undefined ? { reasoningEffort: turn.reasoningEffort } : {}),
      },
    };
  }

  private async loadPreviews(agentId: string): Promise<void> {
    try {
      await Promise.all([this.store.previewMessage(agentId, 'queue'), this.store.previewMessage(agentId, 'now')]);
    } catch {
      if (this.agentId() === agentId) this._error.set('Message options unavailable. Try again.');
    }
  }

  /** Reuse the key of an identical submission that failed in transit, so the backend can dedupe it. */
  private submissionKey(agentId: string, text: string, delivery: AgentMessageDelivery, turn: LaneTurnRequest | undefined): string {
    const signature = JSON.stringify([text, delivery, turn?.model, turn?.reasoningEffort, turn?.files,
      turn?.images?.map((image) => `${image.mediaType}:${image.data.length}:${image.data.slice(0, 64)}`)]);
    const prior = this.submission;
    if (prior && prior.agentId === agentId && prior.signature === signature) return prior.key;
    this.submission = { agentId, signature, key: this.store.newIdempotencyKey() };
    return this.submission.key;
  }
}
