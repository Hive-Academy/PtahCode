import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahRingComponent,
} from '@ptah-extension/ui';

@Component({
  selector: 'ptah-lanes-section-header',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective, PtahRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="lanes-header" section-header>
      <div class="min-w-0">
        <h2
          id="cli-matrix-heading"
          class="flex items-center gap-[var(--ptah-space-2)] text-base font-semibold text-base-content"
        >
          Lanes <span ptahBadge count>{{ total() }}</span>
        </h2>
        <p class="mt-[var(--ptah-gap-label)] text-xs text-base-content-muted">
          Ptah tries enabled lanes from the top when a task does not name one.
        </p>
      </div>
      <div
        class="lanes-actions flex flex-wrap items-center gap-[var(--ptah-space-2)]"
      >
        <ptah-ring
          data-testid="lanes-enabled-count"
          aria-label="Enabled installed lanes"
          label="Enabled installed lanes"
          [value]="enabled()"
          [max]="total()"
          [centerText]="enabled() + '/' + total()"
          [centerOnly]="true"
          tone="gold"
          size="sm"
        />
        <button
          type="button"
          ptahButton
          variant="outline"
          size="sm"
          data-testid="lanes-order-edit"
          [attr.aria-pressed]="editing()"
          (click)="editRequested.emit()"
        >
          {{ editing() ? 'Done editing order' : 'Edit order' }}
        </button>
        <button
          type="button"
          ptahButton
          variant="outline"
          size="sm"
          data-testid="lanes-header-add-instance"
          [disabled]="disabled()"
          (click)="addRequested.emit()"
        >
          New Ptah CLI instance
        </button>
      </div>
    </header>
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
      gap: 1rem;
    }
    .lanes-actions {
      flex-shrink: 0;
    }
    @container (max-width: 699px) {
      .lanes-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }
      .lanes-actions {
        flex-shrink: 1;
      }
    }
  `,
})
export class LanesSectionHeaderComponent {
  readonly total = input.required<number>();
  readonly enabled = input.required<number>();
  readonly editing = input(false);
  readonly disabled = input(false);
  readonly editRequested = output<void>();
  readonly addRequested = output<void>();
}
