import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Check, Copy, LucideAngularModule } from 'lucide-angular';

const COPIED_FEEDBACK_MS = 2000;

/**
 * A command in a mono box with a Copy button (design 4.2, 4.4). The command
 * text is bound by interpolation; callers pass display-safe text.
 */
@Component({
  selector: 'ptah-copy-command',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex min-w-0 items-center gap-2 rounded-md border border-surface-border bg-base-100 px-3 py-1.5"
    >
      <code
        class="min-w-0 flex-1 break-all font-mono text-xs text-base-content"
        data-testid="copy-command-text"
        >{{ command() }}</code
      >
      <button
        type="button"
        class="btn btn-ghost btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        [attr.aria-label]="label() + ': ' + command()"
        data-testid="copy-command-button"
        (click)="copy()"
      >
        <lucide-angular
          [img]="copied() ? CheckIcon : CopyIcon"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        />
        {{ copied() ? 'Copied' : 'Copy' }}
      </button>
    </div>
  `,
})
export class CopyCommandComponent {
  private readonly clipboard = inject(Clipboard);

  public readonly command = input.required<string>();
  /** Accessible name prefix of the button. */
  public readonly label = input('Copy command');

  protected readonly copied = signal(false);
  protected readonly CopyIcon = Copy;
  protected readonly CheckIcon = Check;

  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected copy(): void {
    if (!this.clipboard.copy(this.command())) return;
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), COPIED_FEEDBACK_MS);
  }
}
