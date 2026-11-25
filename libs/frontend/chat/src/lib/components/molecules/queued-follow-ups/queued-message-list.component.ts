import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { LucideAngularModule, Clock } from 'lucide-angular';
import { PtahButtonDirective } from '@ptah-extension/ui';

const PREVIEW_LENGTH = 100;

/** One queued message as the shared card shows it. */
export interface QueuedMessageView {
  readonly id: string;
  /** The full message text, rendered by interpolation only. */
  readonly content: string;
  /** The status after "Queued ·", e.g. "Queued for the next turn". */
  readonly statusLabel: string;
  /** A line under the text, e.g. the note a refused Send now left. */
  readonly note?: string;
  /** False for items the user cannot take back (sent by the parent session). */
  readonly withdrawable: boolean;
  /** Shown in place of Withdraw when the item is not withdrawable. */
  readonly senderNote?: string;
  /** An action is in flight or the item is being queued: both buttons are disabled. */
  readonly busy: boolean;
  /** The backend holds the item, so Send now can act on it. */
  readonly sendable: boolean;
}

/** The immediate action the surface offers for queued messages. */
export interface QueuedSendNowAction {
  readonly label: 'Send now' | 'Interrupt & send';
  /** Title of an enabled button. */
  readonly hint: string;
  /**
   * `available`: the button acts. `unavailable`: the button is shown
   * `aria-disabled` with the reason under the actions. `hidden`: no button.
   */
  readonly state: 'available' | 'unavailable' | 'hidden';
  /** Why Send now is unavailable; shown as "Send now unavailable: <reason>". */
  readonly reason?: string;
}

/**
 * The queued message cards shared by main chat and lane composers
 * (TASK_2026_2320 F3). Presentational: the host maps its own queue to
 * `QueuedMessageView`s, decides the Send now action, and handles the
 * `withdraw` and `sendNow` events (both emit the item id).
 */
@Component({
  selector: 'ptah-queued-message-list',
  standalone: true,
  imports: [LucideAngularModule, PtahButtonDirective],
  template: `
    @if (items().length > 0) {
      <section class="pb-3" aria-label="Queued messages">
        <ul class="flex flex-col gap-2">
          @for (item of items(); track item.id) {
            <li class="flex justify-end" data-testid="queued-follow-up-item">
              <!-- Opaque base-100 with a 5% primary tint: the card's text keeps
                   its theme contrast over a glass scene (S3). -->
              <article
                class="max-w-[85%] min-w-0 rounded-2xl border border-dashed border-primary/50 bg-[color-mix(in_oklch,oklch(var(--p))_5%,oklch(var(--b1)))] px-3 py-2 text-sm"
              >
                <header
                  class="flex items-center gap-1.5 text-[11px] text-base-content-muted"
                >
                  <lucide-angular
                    [img]="ClockIcon"
                    class="w-3.5 h-3.5 text-primary flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span class="font-medium text-base-content">Queued</span>
                  <span aria-hidden="true">·</span>
                  <span data-testid="queued-follow-up-status">{{
                    item.statusLabel
                  }}</span>
                </header>
                <p
                  class="mt-1 whitespace-pre-wrap break-words text-base-content"
                >{{ item.content }}</p>
                @if (item.note) {
                  <p class="mt-1 text-xs text-state-need" role="status">
                    {{ item.note }}
                  </p>
                }
                <div class="mt-2 flex items-center justify-end gap-1">
                  @if (item.withdrawable) {
                    <button
                      type="button"
                      ptahButton
                      variant="ghost"
                      size="xs"
                      data-testid="queued-withdraw"
                      title="Withdraw and put the text back in the composer"
                      [disabled]="item.busy"
                      [attr.aria-label]="'Withdraw: ' + preview(item.content)"
                      (click)="withdraw.emit(item.id)"
                    >
                      Withdraw
                    </button>
                  } @else if (item.senderNote) {
                    <span
                      class="text-[11px] text-base-content-muted"
                      data-testid="queued-sender-note"
                      >{{ item.senderNote }}</span
                    >
                  }
                  @switch (sendNowAction().state) {
                    @case ('available') {
                      <button
                        type="button"
                        ptahButton
                        variant="primary"
                        size="xs"
                        data-testid="queued-follow-up-send-now"
                        [disabled]="item.busy || !item.sendable"
                        [title]="
                          item.sendable ? sendNowAction().hint : item.statusLabel
                        "
                        [attr.aria-label]="
                          actionName() + ': ' + preview(item.content)
                        "
                        (click)="sendNow.emit(item.id)"
                      >
                        {{ sendNowAction().label }}
                      </button>
                    }
                    @case ('unavailable') {
                      <button
                        type="button"
                        ptahButton
                        variant="primary"
                        size="xs"
                        data-testid="queued-follow-up-send-now"
                        aria-disabled="true"
                        [attr.aria-label]="
                          actionName() + ': ' + preview(item.content)
                        "
                        [attr.aria-describedby]="reasonId(item.id)"
                      >
                        {{ sendNowAction().label }}
                      </button>
                    }
                  }
                </div>
                @if (sendNowAction().state === 'unavailable') {
                  <p
                    class="mt-1 text-right text-xs text-base-content-muted"
                    data-testid="queued-send-now-reason"
                    [id]="reasonId(item.id)"
                  >
                    Send now unavailable{{
                      sendNowAction().reason ? ': ' + sendNowAction().reason : '.'
                    }}
                  </p>
                }
              </article>
            </li>
          }
        </ul>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueuedMessageListComponent {
  readonly items = input.required<readonly QueuedMessageView[]>();
  readonly sendNowAction = input.required<QueuedSendNowAction>();

  /** The id of the item to withdraw. */
  readonly withdraw = output<string>();
  /** The id of the item to send now. Not emitted while the action is unavailable. */
  readonly sendNow = output<string>();

  protected readonly ClockIcon = Clock;

  /** The spoken form of the action label ("&" reads poorly). */
  protected actionName(): string {
    return this.sendNowAction().label === 'Interrupt & send'
      ? 'Interrupt and send'
      : 'Send now';
  }

  protected reasonId(id: string): string {
    return `queued-send-now-reason-${id}`;
  }

  protected preview(content: string): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    return flat.length > PREVIEW_LENGTH
      ? `${flat.slice(0, PREVIEW_LENGTH)}…`
      : flat;
  }
}
