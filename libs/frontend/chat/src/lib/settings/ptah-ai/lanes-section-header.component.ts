import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { ArrowUpDown, Check, LucideAngularModule, Route } from 'lucide-angular';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';

/**
 * Header of the Lanes card (design-spec "Card"): `Route` + title + count badge + "x of y enabled", a `[controls]`
 * slot (the matrix projects `ptah-lanes-max-concurrent`) and the Reorder toggle (M-1). The one Add control lives
 * in the Ptah CLI group header of the table (M-2), not here.
 */
@Component({
  selector: 'ptah-lanes-section-header',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="lanes-header" section-header>
      <div class="lanes-title min-w-0">
        <h2
          id="cli-matrix-heading"
          class="flex items-center gap-[var(--ptah-space-2)] text-base font-semibold text-base-content"
        >
          <lucide-angular
            [img]="RouteIcon"
            class="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          Lanes <span ptahBadge count>{{ total() }}</span>
        </h2>
        <span
          class="text-xs text-base-content-muted"
          data-testid="lanes-enabled-count"
          >{{ enabled() }} of {{ total() }} enabled</span
        >
      </div>
      <div
        class="lanes-actions flex flex-wrap items-center gap-[var(--ptah-space-2)]"
      >
        <ng-content select="[controls]" />
        <button
          type="button"
          ptahButton
          variant="outline"
          size="sm"
          data-testid="lanes-order-edit"
          [attr.aria-pressed]="editing()"
          [disabled]="disabled() && !editing()"
          (click)="editRequested.emit()"
        >
          <lucide-angular
            [img]="editing() ? CheckIcon : ArrowUpDownIcon"
            class="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{{ editing() ? 'Done' : 'Reorder' }}</span>
        </button>
      </div>
    </header>
    <p class="lanes-desc text-xs text-base-content-muted">
      Ptah tries enabled lanes from the top when a task does not name one.
    </p>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    .lanes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ptah-space-4, 1rem);
    }
    .lanes-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: var(--ptah-space-3, 0.75rem);
      row-gap: var(--ptah-gap-label);
    }
    .lanes-actions {
      flex-shrink: 0;
    }
    .lanes-desc {
      margin-top: var(--ptah-gap-label);
    }
    @container (max-width: 699px) {
      .lanes-header {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--ptah-space-3, 0.75rem);
      }
      .lanes-actions {
        flex-shrink: 1;
      }
    }
  `,
})
export class LanesSectionHeaderComponent {
  protected readonly RouteIcon = Route;
  protected readonly ArrowUpDownIcon = ArrowUpDown;
  protected readonly CheckIcon = Check;
  readonly total = input.required<number>();
  readonly enabled = input.required<number>();
  readonly editing = input(false);
  /** Turns Reorder on only while writes are possible; "Done" stays enabled so Reorder mode can always end. */
  readonly disabled = input(false);
  readonly editRequested = output<void>();
}
