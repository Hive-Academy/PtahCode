import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import { PtahButtonDirective } from '../../button/button.directive';

/** A short confirmation step shown next to the action that opened it. */
@Component({
  selector: 'ptah-inline-confirm',
  standalone: true,
  imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'inline-confirm',
    class: 'inline-flex',
    role: 'group',
    '[attr.aria-label]': 'ariaLabel() || message()',
    '(keydown.escape)': 'onEscape($event)',
  },
  template: `
    <span
      class="inline-flex flex-wrap items-center gap-ptah-controls rounded-ptah-control border border-surface-border bg-surface-2 px-ptah-controls py-ptah-label text-sm"
      [class.border-state-err]="tone() === 'danger'"
      data-testid="inline-confirm"
    >
      <span [class.text-state-err]="tone() === 'danger'">{{ message() }}</span>
      @if (detail(); as detailText) {
        <span class="text-base-content-muted">{{ detailText }}</span>
      }
      <button ptahButton type="button" size="xs" [variant]="tone() === 'danger' ? 'danger' : 'secondary'" [busy]="busy()" [attr.data-testid]="confirmTestId()" (click)="onConfirm()">{{ confirmLabel() }}</button>
      <button #cancelButton ptahButton type="button" size="xs" variant="ghost" [attr.data-testid]="cancelTestId()" (click)="onCancel()">{{ cancelLabel() }}</button>
    </span>
  `,
})
export class PtahInlineConfirmComponent implements OnDestroy {
  readonly message = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly tone = input<'default' | 'danger'>('default');
  readonly busy = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);
  readonly confirmTestId = input<string | null>(null);
  readonly cancelTestId = input<string | null>(null);
  readonly confirm = output<void>();
  readonly cancelled = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly previousFocus = this.document.activeElement;
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    afterNextRender({ write: () => this.cancelButton().nativeElement.focus() });
  }

  onEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.onCancel();
  }

  onConfirm(): void {
    if (this.busy()) return;
    // Focus stays in the group: a consumer can keep it open with `busy` for an async action.
    // ngOnDestroy returns focus to the opener when the consumer closes the group.
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
    this.restoreFocus();
  }

  ngOnDestroy(): void {
    // Return focus only when it is still in the group or was lost to the body. Do not
    // take focus away from an element that the user moved to.
    const active = this.document.activeElement;
    if (!active || active === this.document.body || this.host.contains(active)) {
      this.restoreFocus();
    }
  }

  private restoreFocus(): void {
    const view = this.document.defaultView;
    if (view && this.previousFocus instanceof view.HTMLElement && this.previousFocus.isConnected) {
      this.previousFocus.focus();
    }
  }
}
