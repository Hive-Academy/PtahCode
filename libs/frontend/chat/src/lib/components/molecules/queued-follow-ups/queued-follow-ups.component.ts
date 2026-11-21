import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { LucideAngularModule, Clock } from 'lucide-angular';
import {
  QueuedFollowUpStore,
  type QueuedFollowUpEntry,
} from '@ptah-extension/chat-state';
import { FollowUpQueueService } from '../../../services/chat-store/follow-up-queue.service';

import { PtahButtonDirective } from '@ptah-extension/ui';
const PREVIEW_LENGTH = 100;

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
 * On delivery the card is replaced by the normal user bubble.
 */
@Component({
  selector: 'ptah-queued-follow-ups',
  standalone: true,
  imports: [LucideAngularModule, PtahButtonDirective],
  template: `
    @if (items().length > 0) {
      <section class="pb-3" aria-label="Queued messages">
        <ul class="flex flex-col gap-2">
          @for (item of items(); track item.clientMessageId) {
            <li class="flex justify-end" data-testid="queued-follow-up-item">
              <article
                class="max-w-[85%] min-w-0 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm"
              >
                <header
                  class="flex items-center gap-1.5 text-[11px] text-base-content-muted"
                >
                  <lucide-angular
                    [img]="ClockIcon"
                    class="w-3.5 h-3.5 text-primary flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span class="font-medium text-primary">Queued</span>
                  <span aria-hidden="true">·</span>
                  <span data-testid="queued-follow-up-status">{{
                    statusLabel(item)
                  }}</span>
                </header>
                <p
                  class="mt-1 whitespace-pre-wrap break-words text-base-content"
                >{{ item.content }}</p>
                @if (item.note) {
                  <p class="mt-1 text-xs text-warning" role="status">
                    {{ item.note }}
                  </p>
                }
                <div class="mt-2 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="xs"
                    data-testid="queued-withdraw"
                    title="Withdraw and put the text back in the composer"
                    [disabled]="
                      item.phase === 'submitting' ||
                      pending().has(item.clientMessageId)
                    "
                    [attr.aria-label]="'Withdraw: ' + preview(item.content)"
                    (click)="withdraw(item)"
                  >
                    Withdraw
                  </button>
                  @if (sendNowAvailable()) {
                    <button
                      type="button"
                      ptahButton
                      variant="primary"
                      size="xs"
                      data-testid="queued-follow-up-send-now"
                      [disabled]="
                        item.phase !== 'queued' ||
                        pending().has(item.clientMessageId)
                      "
                      [title]="
                        item.phase === 'queued'
                          ? sendNowHint()
                          : statusLabel(item)
                      "
                      [attr.aria-label]="
                        (isClaude() ? 'Interrupt and send: ' : 'Send now: ') +
                        preview(item.content)
                      "
                      (click)="sendNow(item)"
                    >
                      {{ isClaude() ? 'Interrupt & send' : 'Send now' }}
                    </button>
                  }
                </div>
              </article>
            </li>
          }
        </ul>
      </section>
    }
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

  readonly ClockIcon = Clock;

  /** Items with an action in flight, so a double click sends nothing twice. */
  protected readonly pending = signal<ReadonlySet<string>>(new Set());

  protected readonly items = computed<readonly QueuedFollowUpEntry[]>(() => {
    const tabId = this.tabId();
    return tabId ? this.store.forView(tabId, this.sessionId()) : [];
  });

  protected readonly sendNowAvailable = computed(() => {
    const tabId = this.tabId();
    return tabId !== null && this.followUps.canSendNow(tabId);
  });
  protected readonly isClaude = computed(() => {
    const tabId = this.tabId();
    return tabId !== null && this.followUps.isClaudeSession(tabId);
  });
  protected readonly sendNowHint = computed(() =>
    this.isClaude()
      ? 'Stop the current turn and send this message now'
      : 'Send this message into the running turn now',
  );

  protected preview(content: string): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    return flat.length > PREVIEW_LENGTH
      ? `${flat.slice(0, PREVIEW_LENGTH)}…`
      : flat;
  }

  protected statusLabel(item: QueuedFollowUpEntry): string {
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

  protected async withdraw(item: QueuedFollowUpEntry): Promise<void> {
    await this.track(item, () =>
      this.followUps.withdraw(item, { restore: true }),
    );
  }

  protected async sendNow(item: QueuedFollowUpEntry): Promise<void> {
    await this.track(item, () => this.followUps.sendNow(item));
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
