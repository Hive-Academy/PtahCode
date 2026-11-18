import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let nextSettingRowId = 0;

/**
 * A setting title and hint beside one projected control.
 * When `disabled` is set, the consumer disables the projected control itself and adds
 * `reasonId()` to its aria-describedby. The row does not make the control inert, so a
 * screen reader still finds the control and reads the reason. The row does not dim the
 * control column: the disabled control shows its own disabled style, and opacity on the
 * column can drop the text contrast under 4.5:1.
 */
@Component({
  selector: 'ptah-setting-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'setting-row',
    // The divider is on the host: sibling rows in one parent show it, and the last row does not.
    class: 'block border-b border-surface-border last:border-b-0 [container-type:inline-size]',
  },
  template: `
    <div
      class="grid min-w-0 grid-cols-1 items-center gap-x-ptah-group gap-y-ptah-label [@container(min-width:640px)]:grid-cols-[minmax(0,1fr)_auto]"
      [class.py-ptah-field]="density() === 'default'"
      [class.py-ptah-controls]="density() === 'compact'"
      [attr.data-disabled]="disabled() ? 'true' : null"
      data-testid="setting-row"
    >
      <div class="flex min-w-0 flex-col gap-ptah-label">
        <div class="flex min-w-0 flex-wrap items-center gap-ptah-controls font-medium">
          @if (controlId(); as id) {
            <label [id]="titleId()" [attr.for]="id">{{ label() }}</label>
          } @else {
            <span [id]="titleId()">{{ label() }}</span>
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
      <div
        data-ptah-setting-control
        class="flex min-w-0 flex-wrap items-center gap-ptah-controls [@container(min-width:640px)]:justify-self-end"
      >
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
  /** Id of the row title. Pass it to a compact `ptah-select` as `labelledBy`. */
  readonly titleId = computed(() => `${this.controlId() || this.fallbackId}-title`);
  readonly hintId = computed(() => `${this.controlId() || this.fallbackId}-hint`);
  /** Pass this id to a projected control's aria-describedby when disabled. */
  readonly reasonId = computed(() => `${this.controlId() || this.fallbackId}-reason`);
}
