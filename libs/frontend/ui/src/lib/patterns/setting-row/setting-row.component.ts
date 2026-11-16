import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let nextSettingRowId = 0;

/**
 * A setting title and hint beside one projected control.
 * When `disabled` is set, the consumer disables the projected control itself and adds
 * `reasonId()` to its aria-describedby. The row does not make the control inert, so a
 * screen reader still finds the control and reads the reason.
 */
@Component({
  selector: 'ptah-setting-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'setting-row',
    class: 'block [container-type:inline-size]',
  },
  template: `
    <div
      class="grid min-w-0 grid-cols-1 items-center gap-x-ptah-group gap-y-ptah-label border-b border-surface-border last:border-b-0 [@container(min-width:640px)]:grid-cols-[minmax(0,1fr)_auto]"
      [class.py-ptah-field]="density() === 'default'"
      [class.py-ptah-controls]="density() === 'compact'"
      [attr.data-disabled]="disabled() ? 'true' : null"
      data-testid="setting-row"
    >
      <div class="flex min-w-0 flex-col gap-ptah-label">
        <div class="flex min-w-0 flex-wrap items-center gap-ptah-controls font-medium">
          @if (controlId(); as id) {
            <label [attr.for]="id">{{ label() }}</label>
          } @else {
            <span>{{ label() }}</span>
          }
          <ng-content select="[status]" />
        </div>
        @if (hint(); as hintText) {
          <p class="text-base-content-muted" [id]="hintId()">{{ hintText }}</p>
        }
        @if (disabled() && disabledReason(); as reason) {
          <p class="text-base-content-muted" [id]="reasonId()">{{ reason }}</p>
        }
      </div>
      <div class="flex min-w-0 flex-wrap items-center gap-ptah-controls [@container(min-width:640px)]:justify-self-end" [class.opacity-50]="disabled()">
        <ng-content select="[meta]" />
        <ng-content />
      </div>
    </div>
  `,
})
export class PtahSettingRowComponent {
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly controlId = input<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly disabledReason = input<string | null>(null);
  readonly density = input<'default' | 'compact'>('default');

  private readonly fallbackId = `ptah-setting-row-${++nextSettingRowId}`;
  /** Pass this id to a projected control's aria-describedby when a hint is present. */
  readonly hintId = computed(() => `${this.controlId() || this.fallbackId}-hint`);
  /** Pass this id to a projected control's aria-describedby when disabled. */
  readonly reasonId = computed(() => `${this.controlId() || this.fallbackId}-reason`);
}
