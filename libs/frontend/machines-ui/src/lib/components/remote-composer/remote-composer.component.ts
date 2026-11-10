import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import {
  MachinesStore,
  type RemoteSessionView,
} from '../../services/machines-store';
import { outcomeSentence } from '../../utils/remote-session-copy';

/** `aria-describedby` target of the reason line; pinned by the session view spec. */
const COMPOSER_REASON_ID = 'ptah-remote-session-reason-composer';

/**
 * The composer of one opened remote session (design 4.6, 4.9): the draft,
 * Send, the line that says why sending is unavailable, and the last action
 * error.
 *
 * It sends through {@link MachinesStore.sendPrompt}. A failed send keeps the
 * draft; nothing is queued or retried (4.9 9d). `error` is shared with the
 * page (`[(error)]`), so a failed Stop shows here as well; a new send clears
 * it. The draft starts empty for each session.
 */
@Component({
  selector: 'ptah-remote-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="flex flex-col gap-2 border-t border-surface-border py-3"
      aria-label="Message"
      data-testid="remote-composer"
      (submit)="onSubmit($event)"
    >
      <div class="flex items-end gap-2">
        <textarea
          class="textarea textarea-bordered textarea-sm min-h-[2.5rem] flex-1 rounded-md text-sm text-base-content placeholder:text-base-content-muted disabled:cursor-not-allowed"
          rows="2"
          name="prompt"
          aria-label="Message"
          data-testid="remote-composer-input"
          [value]="draft()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [attr.aria-describedby]="reason() ? reasonId : null"
          (input)="onDraftInput($event)"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button
          type="submit"
          class="btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content disabled:cursor-not-allowed disabled:border-dashed disabled:border-surface-border disabled:bg-transparent disabled:text-base-content-muted"
          data-testid="remote-send"
          [disabled]="!canSend()"
          [attr.aria-describedby]="reason() ? reasonId : null"
        >
          Send
        </button>
      </div>
      @if (reason(); as text) {
        <p
          [id]="reasonId"
          class="text-xs text-base-content-muted"
          data-testid="remote-composer-reason"
        >
          {{ text }}
        </p>
      }
      @if (error(); as text) {
        <p
          class="text-sm text-base-content"
          role="alert"
          data-testid="remote-send-error"
        >
          {{ text }}
        </p>
      }
    </form>
  `,
})
export class RemoteComposerComponent {
  private readonly store = inject(MachinesStore);

  public readonly machineId = input.required<string>();
  public readonly sessionId = input.required<string>();
  /** The session as the store shows it; `null` before the first attach. */
  public readonly view = input.required<RemoteSessionView | null>();
  /** Display-safe machine name. */
  public readonly machineName = input.required<string>();
  public readonly connected = input.required<boolean>();
  /** The last send or stop failure, as a sentence; shared with the page. */
  public readonly error = model<string | null>(null);

  protected readonly reasonId = COMPOSER_REASON_ID;
  protected readonly draft = signal('');
  private readonly sending = signal(false);

  private readonly turnInFlight = computed(
    () => (this.view()?.turnId ?? null) !== null,
  );

  protected readonly disabled = computed(() => this.view()?.watchOnly ?? false);

  protected readonly placeholder = computed(() => {
    const view = this.view();
    const machine = this.machineName();
    if (view?.lockUnavailable) return 'Sending is unavailable';
    if (view?.watchOnly) {
      return view.drivenBy
        ? `Sending is unavailable: driven from ${machine}`
        : 'Sending is unavailable';
    }
    if (this.turnInFlight()) {
      return `Message Claude on ${machine} (a turn is in progress)`;
    }
    return `Message Claude on ${machine}`;
  });

  protected readonly reason = computed(() => {
    const view = this.view();
    const machine = this.machineName();
    if (view?.lockUnavailable) {
      return 'This app could not check who has this session. Sending is unavailable.';
    }
    if (view?.watchOnly) {
      return view.drivenBy
        ? `Someone at ${machine} is driving this session. Sending is unavailable until they are done.`
        : `This session has no live log on ${machine}; this is its last saved state. Sending is unavailable.`;
    }
    if (!this.connected()) return `${machine} is not connected.`;
    return null;
  });

  protected readonly canSend = computed(() => {
    const view = this.view();
    return (
      view !== null &&
      view.mode === 'log' &&
      !view.watchOnly &&
      this.connected() &&
      !this.turnInFlight() &&
      !this.sending() &&
      this.draft().trim() !== ''
    );
  });

  public constructor() {
    // A new session starts with an empty draft.
    effect(() => {
      this.machineId();
      this.sessionId();
      untracked(() => this.draft.set(''));
    });
  }

  protected onDraftInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.draft.set(target.value);
  }

  protected onEnter(event: Event): void {
    if (
      event instanceof KeyboardEvent &&
      (event.shiftKey || event.isComposing)
    ) {
      return;
    }
    event.preventDefault();
    void this.send();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  private async send(): Promise<void> {
    if (!this.canSend()) return;
    const prompt = this.draft().trim();
    this.sending.set(true);
    this.error.set(null);
    try {
      const outcome = await this.store.sendPrompt(
        this.machineId(),
        this.sessionId(),
        prompt,
      );
      if (outcome.ok) {
        this.draft.set('');
        return;
      }
      // The draft stays; nothing is queued or retried (4.9 9d).
      this.error.set(outcomeSentence(outcome, this.machineName()));
    } finally {
      this.sending.set(false);
    }
  }
}
