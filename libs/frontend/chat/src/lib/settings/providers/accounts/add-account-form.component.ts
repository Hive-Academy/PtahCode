import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  PROVIDER_ACCOUNT_DUPLICATE_LABEL_SUMMARY,
  PROVIDER_ACCOUNT_LABEL_MAX_LENGTH,
  type ProviderAccountSummary,
} from '@ptah-extension/shared';
import { PtahEditableSectionComponent, PtahFieldComponent, PtahInputDirective } from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../../feedback/settings-save-feedback.service';
import { ACCOUNT_COPY, validateAccountName } from './account-presentation';

/**
 * Inline Add form of the Accounts tab (design-spec-p6 "Add (A6)", plan P6 component 8), composed from
 * `ptah-editable-section` "New account" in edit mode from the start (pattern-spec 6.1). It asks for a name only: no
 * credential, directory or sign-in, and no helper copy. Submit emits the trimmed name; the parent writes it,
 * announces the outcome and destroys the form on success or Cancel, so each open starts empty.
 *
 * An invalid or duplicate name on submit is announced as an alert toast (P6-A9: the form's own synchronous result)
 * and focus stays in the input. While the Add write is pending the pattern disables its fields (`saving`). If focus
 * fell to the body because of that, it goes back to the input when the write ends and the form stays (B-2). Cancel
 * and Escape with a typed name ask the pattern's discard confirmation first (pattern-spec 6.3).
 */
@Component({
  selector: 'ptah-add-account-form',
  standalone: true,
  imports: [PtahEditableSectionComponent, PtahFieldComponent, PtahInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-editable-section
      heading="New account"
      [level]="4"
      editing
      [dirty]="!empty()"
      [saving]="pending()"
      [saveLabel]="pending() ? 'Adding…' : 'Add'"
      (save)="submit()"
      (cancelEdit)="cancel()"
      (keydown.escape)="keepEscape($event)"
      data-testid="add-account-form"
    >
      <ptah-field edit label="Account name">
        <input
          #name
          ptahInput
          id="add-account-name"
          type="text"
          class="w-full"
          [value]="label()"
          (input)="edit($event)"
          autocomplete="off"
          [attr.maxlength]="maxLength"
          [invalid]="invalid()"
          data-testid="add-account-name"
        />
      </ptah-field>
    </ptah-editable-section>
  `,
})
export class AddAccountFormComponent {
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private destroyed = false;

  /** Named accounts of the held host snapshot, for the uniqueness rule. */
  readonly accounts = input.required<readonly ProviderAccountSummary[]>();
  /** The Add write is in flight. */
  readonly pending = input(false);

  /** The trimmed, validated name. Never a selection or a sign-in request. */
  readonly submitted = output<string>();
  /** Cancel or Escape. */
  readonly cancelled = output<void>();

  protected readonly maxLength = PROVIDER_ACCOUNT_LABEL_MAX_LENGTH;
  protected readonly label = signal('');
  protected readonly empty = computed(() => this.label().trim().length === 0);
  /** The last submit was refused by validation and the value was not edited since. */
  protected readonly invalid = signal(false);

  private readonly nameEl = viewChild.required<ElementRef<HTMLInputElement>>('name');

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    afterNextRender(() => this.nameEl().nativeElement.focus());
    // B-2: the disabled fieldset of a pending write can drop focus to the body. When the write ends and the form
    // stays (a refusal), the input takes focus back only if focus is still on the body.
    let wasPending = false;
    effect(() => {
      const pending = this.pending();
      const ended = wasPending && !pending;
      wasPending = pending;
      if (!ended) return;
      afterNextRender(
        () => {
          const active = this.document.activeElement;
          if (this.destroyed || (active !== null && active !== this.document.body)) return;
          this.nameEl().nativeElement.focus();
        },
        { injector: this.injector },
      );
    });
  }

  protected edit(event: Event): void {
    this.label.set(event.target instanceof HTMLInputElement ? event.target.value : '');
    this.invalid.set(false);
  }

  /** Re-reads the field at submit time (R4), so the emitted name is exactly what is shown. */
  protected submit(): void {
    if (this.pending()) return;
    const input = this.nameEl().nativeElement;
    const value = input.value;
    this.label.set(value);
    const check = validateAccountName(value, this.accounts());
    if (check.ok) {
      this.invalid.set(false);
      this.submitted.emit(check.label);
      return;
    }
    // Empty: Add reads as disabled; nothing to announce.
    if (check.message === null) return;
    this.invalid.set(true);
    const message =
      check.message === PROVIDER_ACCOUNT_DUPLICATE_LABEL_SUMMARY ? ACCOUNT_COPY.nameTaken : check.message;
    this.feedback.announce(message, 'alert');
    input.focus();
  }

  protected cancel(): void {
    if (!this.pending()) this.cancelled.emit();
  }

  /** Escape closes only this form, never the drawer around it. The section handles the Escape itself. */
  protected keepEscape(event: Event): void {
    event.stopPropagation();
  }
}
