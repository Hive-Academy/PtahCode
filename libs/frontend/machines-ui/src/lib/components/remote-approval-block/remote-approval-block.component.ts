import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { PermissionRequest } from '@ptah-extension/shared';
import { Check, Copy, LucideAngularModule } from 'lucide-angular';
import { CountdownClock } from '../../services/countdown-clock';
import type { MachinesError } from '../../services/machines-store';
import { displayBlockText, displayText } from '../../utils/display-text';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';
import {
  PERMISSION_TIMED_OUT_COPY,
  permissionCountdownCopy,
  permissionNotPermittedCopy,
} from '../../utils/remote-session-copy';

/**
 * - `answerable` — 4.7: Allow once / Deny.
 * - `watch-only` — 4.9 (9): pending at the machine; no buttons at all.
 * - `cached` — 4.9 (9c): from a cached view; read-only, not claimed pending.
 */
export type RemoteApprovalMode = 'answerable' | 'watch-only' | 'cached';

export type RemoteApprovalDecision = 'allow' | 'deny';

const COPIED_FEEDBACK_MS = 2000;

let nextBlockId = 0;

/**
 * One remote tool-use request in the transcript (design 4.7, 4.9), not a
 * modal. Arguments are shown whole (D8): worker-supplied, so they pass
 * through {@link displayBlockText} and are bound by interpolation in a
 * scrolling `pre`.
 *
 * The worker denies an unanswered request at its deadline (`timeoutAt`,
 * decision 27). While answerable, the block counts down to it on the shared
 * {@link CountdownClock} (one interval for all blocks); it lets go of the
 * clock at expiry and on destroy. After expiry, or once the worker's timeout
 * record arrived (`timedOut`), the buttons are disabled and the block says
 * the worker denied it.
 */
@Component({
  selector: 'ptah-remote-approval-block',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex flex-col gap-3 rounded-box border-2 bg-base-200 px-4 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
      [class.border-state-need]="!expired() && mode() !== 'cached'"
      [class.border-surface-border]="expired() || mode() === 'cached'"
      [attr.aria-labelledby]="titleId"
      [attr.tabindex]="mode() === 'answerable' ? null : 0"
      data-testid="approval-block"
      [attr.data-mode]="mode()"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span
          ptahBadge
          [tone]="!expired() && mode() !== 'cached' ? 'warn' : 'neutral'"
          appearance="outline"
          size="sm"
          data-testid="approval-badge"
          >{{ badge() }}</span
        >
        <h3
          [id]="titleId"
          class="text-sm font-semibold text-base-content"
          data-testid="approval-title"
        >
          {{ title() }}
        </h3>
      </div>

      <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt class="text-base-content-muted">Machine</dt>
        <dd class="min-w-0 text-base-content">{{ machineName() }}</dd>
        @if (sessionTitle()) {
          <dt class="text-base-content-muted">Session</dt>
          <dd class="min-w-0 text-base-content">{{ sessionTitle() }}</dd>
        }
        <dt class="text-base-content-muted">Tool</dt>
        <dd
          class="min-w-0 font-mono text-base-content"
          data-testid="approval-tool"
        >
          {{ toolName() }}
        </dd>
        <dt class="text-base-content-muted">Arguments</dt>
        <dd class="flex min-w-0 items-start gap-2">
          <pre
            class="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md border border-surface-border bg-base-100 px-3 py-2 font-mono text-xs text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
            tabindex="0"
            aria-label="Arguments"
            data-testid="approval-args"
          ><code>{{ argsText() }}</code></pre>
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="xs"
            aria-label="Copy arguments"
            data-testid="approval-copy"
            (click)="copyArgs()"
          >
            <lucide-angular
              [img]="copied() ? CheckIcon : CopyIcon"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
            {{ copied() ? 'Copied' : 'Copy' }}
          </button>
        </dd>
        @if (mode() === 'answerable' && !expired()) {
          <dt class="text-base-content-muted">If unanswered</dt>
          <dd class="min-w-0 text-base-content" data-testid="approval-deadline">
            {{ deadlineText() }}
          </dd>
        }
      </dl>

      @switch (mode()) {
        @case ('watch-only') {
          <p class="text-base-content" data-testid="approval-readonly">
            Answer this request at {{ machineName() }}. It cannot be answered
            from this app.
          </p>
        }
        @case ('cached') {
          <p class="text-base-content" data-testid="approval-readonly">
            This request was in the session when it was last checked; it may no
            longer be pending. It cannot be answered from this app.
          </p>
        }
        @default {
          @if (expired()) {
            <p
              class="text-base-content"
              role="status"
              data-testid="approval-timed-out"
            >
              {{ timedOutCopy }}
            </p>
          }
          @if (errorText(); as text) {
            <div
              class="rounded-box border border-state-err px-3 py-2 text-base-content"
              role="alert"
              data-testid="approval-error"
            >
              {{ text }}
            </div>
          }
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              ptahButton
              variant="primary"
              data-testid="approval-allow"
              [disabled]="!canAnswer()"
              [attr.aria-describedby]="reasonId"
              (click)="answered.emit('allow')"
            >
              Allow once
            </button>
            <button
              type="button"
              ptahButton
              data-testid="approval-deny"
              [disabled]="!canAnswer()"
              [attr.aria-describedby]="reasonId"
              (click)="answered.emit('deny')"
            >
              Deny
            </button>
          </div>
          <p
            [id]="reasonId"
            class="text-xs text-base-content-muted"
            data-testid="approval-hint"
          >
            {{ hint() }}
          </p>
        }
      }
    </section>
  `,
})
export class RemoteApprovalBlockComponent {
  private readonly clipboard = inject(Clipboard);

  public readonly request = input.required<PermissionRequest>();
  /** Display-safe machine name. */
  public readonly machineName = input.required<string>();
  /** Display-safe session title, or empty. */
  public readonly sessionTitle = input('');
  public readonly mode = input<RemoteApprovalMode>('answerable');
  /** The worker recorded a timeout denial for this request. */
  public readonly timedOut = input(false);
  /** An answer is on its way. */
  public readonly busy = input(false);
  /** Why answering is unavailable now (machine offline), or `null`. */
  public readonly unavailableReason = input<string | null>(null);
  /** The last answer failed. */
  public readonly error = input<MachinesError | null>(null);

  public readonly answered = output<RemoteApprovalDecision>();

  protected readonly titleId = `ptah-approval-${nextBlockId}`;
  protected readonly reasonId = `ptah-approval-reason-${nextBlockId++}`;
  protected readonly timedOutCopy = PERMISSION_TIMED_OUT_COPY;
  protected readonly CopyIcon = Copy;
  protected readonly CheckIcon = Check;

  private readonly clock = inject(CountdownClock);
  protected readonly now = this.clock.now;
  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  /** The worker's deadline, or `null` when the request has none (`timeoutAt: 0`). */
  private readonly deadline = computed(() => {
    const at = this.request().timeoutAt;
    return Number.isFinite(at) && at > 0 ? at : null;
  });

  protected readonly expired = computed(() => {
    if (this.timedOut()) return true;
    const deadline = this.deadline();
    return (
      this.mode() === 'answerable' &&
      deadline !== null &&
      this.now() >= deadline
    );
  });

  protected readonly notPermitted = computed(
    () => this.error()?.code === 'MACHINE_NOT_FOUND_OR_FORBIDDEN',
  );

  protected readonly canAnswer = computed(
    () =>
      this.mode() === 'answerable' &&
      !this.expired() &&
      !this.busy() &&
      !this.notPermitted() &&
      this.unavailableReason() === null,
  );

  protected readonly toolName = computed(() =>
    displayText(this.request().toolName),
  );

  protected readonly argsText = computed(() => {
    const input = this.request().toolInput;
    let text: string;
    try {
      text = JSON.stringify(input, null, 2) ?? '';
    } catch {
      text = String(input);
    }
    return displayBlockText(text);
  });

  protected readonly badge = computed(() => {
    switch (this.mode()) {
      case 'watch-only':
        return `Waiting at ${this.machineName()}`;
      case 'cached':
        return 'Saved request';
      default:
        return this.expired() ? 'Denied by the worker' : 'Waiting for you';
    }
  });

  protected readonly title = computed(() => {
    const machine = this.machineName();
    switch (this.mode()) {
      case 'watch-only':
        return `${machine} is waiting for an answer`;
      case 'cached':
        return `${machine} asked to run a command`;
      default:
        return `${machine} wants to run a command`;
    }
  });

  protected readonly deadlineText = computed(() => {
    const deadline = this.deadline();
    if (deadline === null) return 'Stays pending, like a local request.';
    return permissionCountdownCopy((deadline - this.now()) / 1000);
  });

  protected readonly errorText = computed(() => {
    const error = this.error();
    if (error === null) return null;
    if (this.notPermitted())
      return permissionNotPermittedCopy(this.machineName());
    const text = displayText(error.message, 200);
    return text === '' ? 'The answer could not be sent.' : text;
  });

  protected readonly hint = computed(() => {
    if (this.expired()) return 'The session continues without this tool.';
    return (
      this.unavailableReason() ??
      'The session stays paused until someone answers.'
    );
  });

  /** The countdown runs: answerable, with a deadline, and not yet past it. */
  private readonly counting = computed(
    () =>
      this.mode() === 'answerable' &&
      !this.timedOut() &&
      this.deadline() !== null &&
      !this.expired(),
  );

  public constructor() {
    effect((onCleanup) => {
      if (!this.counting()) return;
      onCleanup(untracked(() => this.clock.acquire()));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  protected copyArgs(): void {
    if (!this.clipboard.copy(this.argsText())) return;
    this.copied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(
      () => this.copied.set(false),
      COPIED_FEEDBACK_MS,
    );
  }
}
