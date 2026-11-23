import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  QueuedFollowUpStore,
  type QueuedFollowUpEntry,
} from '@ptah-extension/chat-state';
import { FollowUpQueueService } from '../../../services/chat-store/follow-up-queue.service';
import {
  QueuedMessageListComponent,
  type QueuedMessageView,
  type QueuedSendNowAction,
} from './queued-message-list.component';

/**
 * The follow-ups waiting for this tab and session (TASK_2026_884), rendered
 * at the end of the transcript as queued user cards. Every message sent while
 * a turn may still run lands here first — one predictable flow. Each card
 * shows the full text (interpolation only), its state, Withdraw (the text
 * goes back to the composer to edit), and the immediate action:
 * "Interrupt & send" for Claude (stops the turn, then sends this as the next
 * one) or "Send now" for Codex (steers it into the running turn). The action
 * stays disabled, with the reason, until the backend holds the item.
 * The transcript mounts it only while the store holds an item for the view;
 * `ChatViewComponent` reconciles the backend list when a session view opens.
 * On delivery the card is replaced by the normal user bubble. The cards
 * themselves are the shared `QueuedMessageListComponent` (TASK_2026_2320 F3).
 */
@Component({
  selector: 'ptah-queued-follow-ups',
  standalone: true,
  imports: [QueuedMessageListComponent],
  template: `
    <ptah-queued-message-list
      [items]="views()"
      [sendNowAction]="sendNowAction()"
      (withdraw)="withdraw($event)"
      (sendNow)="sendNow($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueuedFollowUpsComponent {
  private readonly store = inject(QueuedFollowUpStore);
  private readonly followUps = inject(FollowUpQueueService);

  /** The tab this composer sends from. */
  readonly tabId = input<string | null>(null);
  /** The session the tab shows; items of an earlier session are not listed. */
  readonly sessionId = input<string | null>(null);

  /** Items with an action in flight, so a double click sends nothing twice. */
  private readonly pending = signal<ReadonlySet<string>>(new Set());

  private readonly items = computed<readonly QueuedFollowUpEntry[]>(() => {
    const tabId = this.tabId();
    return tabId ? this.store.forView(tabId, this.sessionId()) : [];
  });

  protected readonly views = computed<readonly QueuedMessageView[]>(() => {
    const pending = this.pending();
    return this.items().map((item) => ({
      id: item.clientMessageId,
      content: item.content,
      statusLabel: this.statusLabel(item),
      note: item.note,
      withdrawable: true,
      busy: item.phase === 'submitting' || pending.has(item.clientMessageId),
      sendable: item.phase === 'queued',
    }));
  });

  /** Main chat hides Send now while the backend cannot act on it. */
  protected readonly sendNowAction = computed<QueuedSendNowAction>(() => {
    const tabId = this.tabId();
    const available = tabId !== null && this.followUps.canSendNow(tabId);
    const isClaude = tabId !== null && this.followUps.isClaudeSession(tabId);
    return {
      label: isClaude ? 'Interrupt & send' : 'Send now',
      hint: isClaude
        ? 'Stop the current turn and send this message now'
        : 'Send this message into the running turn now',
      state: available ? 'available' : 'hidden',
    };
  });

  private statusLabel(item: QueuedFollowUpEntry): string {
    switch (item.phase) {
      case 'held':
        return item.isCommand
          ? 'Runs when this turn finishes'
          : 'Waiting to queue';
      case 'submitting':
        return 'Queuing…';
      case 'queued':
        return 'Queued for the next turn';
    }
  }

  protected async withdraw(id: string): Promise<void> {
    const item = this.find(id);
    if (!item) return;
    await this.track(item, () =>
      this.followUps.withdraw(item, { restore: true }),
    );
  }

  protected async sendNow(id: string): Promise<void> {
    const item = this.find(id);
    if (!item) return;
    await this.track(item, () => this.followUps.sendNow(item));
  }

  private find(id: string): QueuedFollowUpEntry | undefined {
    return this.items().find((item) => item.clientMessageId === id);
  }

  private async track(
    item: QueuedFollowUpEntry,
    action: () => Promise<unknown>,
  ): Promise<void> {
    const id = item.clientMessageId;
    if (this.pending().has(id)) return;
    this.pending.update((current) => new Set(current).add(id));
    try {
      await action();
    } finally {
      this.pending.update((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }
}
