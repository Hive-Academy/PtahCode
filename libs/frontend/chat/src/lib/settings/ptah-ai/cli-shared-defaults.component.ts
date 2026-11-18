import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import type {
  CliAdapterManifest,
  CliLaneDefaults,
} from '@ptah-extension/shared';
import { SurfaceCardComponent } from '@ptah-extension/ui';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';

/** Shared Ptah CLI lane defaults. The matrix supplies persistence through the outputs. */
@Component({
  selector: 'ptah-cli-shared-defaults',
  standalone: true,
  imports: [CliLaneDefaultCellComponent, SurfaceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-surface-card border="faint" padding="none">
      <section
        class="shared-card grid min-w-0 grid-cols-1 items-start gap-[var(--ptah-gap-field)]"
        aria-labelledby="shared-defaults-heading"
      >
        <div class="min-w-0">
          <h3 id="shared-defaults-heading" class="text-base font-semibold">
            Ptah CLI defaults
          </h3>
          <p class="mt-[var(--ptah-gap-label)] text-xs text-base-content-muted">
            Inherited by all Ptah CLI providers unless a provider has its own
            lane default.
          </p>
        </div>
        <ptah-cli-lane-default-cell
          class="min-w-0"
          cli="ptah-cli"
          name="Ptah CLI"
          layout="wide"
          [showCaption]="false"
          [manifest]="manifest()"
          [saved]="saved()"
          [disabled]="disabled()"
          (selected)="selected.emit($event)"
          (resetRequested)="resetRequested.emit()"
        />
      </section>
    </ptah-surface-card>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    /* Same 1.25rem content inset as the Ptah CLI instances card below: the padding takes in the card border. */
    .shared-card {
      padding: calc(1.25rem - var(--ptah-card-border-width));
    }
    @container (min-width: 420px) {
      .shared-card {
        grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      }
    }
  `,
})
export class CliSharedDefaultsComponent {
  readonly manifest = input.required<CliAdapterManifest>();
  readonly saved = input<CliLaneDefaults['ptah-cli']>();
  readonly disabled = input(false);
  readonly selected = output<NonNullable<CliLaneDefaults['ptah-cli']>>();
  readonly resetRequested = output<void>();
}
