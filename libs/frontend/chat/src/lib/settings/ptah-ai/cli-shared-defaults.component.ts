import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CliAdapterManifest, CliLaneDefaults } from '@ptah-extension/shared';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';

/** Shared Ptah CLI lane defaults. The matrix supplies persistence through the outputs. */
@Component({
  selector: 'ptah-cli-shared-defaults',
  standalone: true,
  imports: [CliLaneDefaultCellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="shared-card grid min-w-0 grid-cols-1 items-start gap-4 rounded-lg border border-base-content/10 p-4" data-glass-surface="tile" aria-labelledby="shared-defaults-heading">
      <div class="min-w-0">
        <h3 id="shared-defaults-heading" class="text-base font-semibold">Ptah CLI shared defaults</h3>
        <p class="mt-1 text-xs text-base-content-muted">Inherited by all Ptah CLI providers unless a provider has its own lane default.</p>
        <p class="mt-1 text-xs text-base-content-muted">{{ saved() ? 'Saved default' : 'Auto (default) · built-in' }}</p>
      </div>
      <ptah-cli-lane-default-cell class="min-w-0" cli="ptah-cli" name="Ptah CLI" layout="wide" [showCaption]="false" [manifest]="manifest()" [saved]="saved()" [disabled]="disabled()" (selected)="selected.emit($event)" (resetRequested)="resetRequested.emit()" />
    </section>
  `,
  styles: `
    :host { display: block; container-type: inline-size; }
    @container (min-width: 761px) { .shared-card { grid-template-columns: minmax(16rem, 1fr) minmax(24rem, 2fr); } }
  `,
})
export class CliSharedDefaultsComponent {
  readonly manifest = input.required<CliAdapterManifest>();
  readonly saved = input<CliLaneDefaults['ptah-cli']>();
  readonly disabled = input(false);
  readonly selected = output<NonNullable<CliLaneDefaults['ptah-cli']>>();
  readonly resetRequested = output<void>();
}
