/**
 * ProviderModelsNoticeComponent — the saved-list status row: a polite
 * `role="status"` sentence and a Retry that asks the host to load the list
 * again. Presentational only; the host computes the text with
 * {@link savedModelListNotice} and owns the reload.
 *
 * @module native/provider-model-picker
 */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'ptah-provider-models-notice',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <p
        class="text-xs text-warning"
        role="status"
        [attr.data-testid]="testId()"
      >
        {{ notice() }}
      </p>
      <button
        type="button"
        class="btn btn-ghost btn-sm min-h-9 text-base-content"
        [attr.data-testid]="testId() + '-retry'"
        [disabled]="disabled()"
        (click)="retry.emit()"
      >
        Retry
      </button>
    </div>
  `,
})
export class ProviderModelsNoticeComponent {
  /** The sentence to show (from {@link savedModelListNotice}). */
  readonly notice = input.required<string>();
  /** `data-testid` of the sentence; the Retry gets the same id with `-retry`. */
  readonly testId = input.required<string>();
  readonly disabled = input(false);
  /** The user asked to load the list again. */
  readonly retry = output<void>();
}
