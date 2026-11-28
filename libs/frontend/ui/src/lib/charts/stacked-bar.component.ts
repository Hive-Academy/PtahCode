import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PtahChartSegment } from './chart.types';
import { segmentGeometry } from './segment-geometry';

@Component({
  selector: 'ptah-stacked-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    svg {
      display: block;
      width: 100%;
      height: var(--ptah-space-3);
      border-radius: var(--ptah-radius-pill);
      overflow: hidden;
    }
  `,
  template: `
    <svg focusable="false" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" [attr.aria-label]="summary()">
      <g aria-hidden="true">
        <rect width="100" height="8" fill="var(--ptah-meter-track, var(--surface-border-strong))" />
        @for (segment of geometry().marks; track $index) {
          <rect [attr.x]="segment.start" [attr.width]="segment.length" height="8" [attr.fill]="segment.color">
            <title>{{ segment.label }}: {{ segment.value }}</title>
          </rect>
        }
      </g>
    </svg>
  `,
})
export class PtahStackedBarComponent {
  readonly segments = input.required<readonly PtahChartSegment[]>();
  readonly label = input.required<string>();

  protected readonly geometry = computed(() => segmentGeometry(this.segments()));
  protected readonly summary = computed(() => `${this.label()}: ${this.geometry().summary || 'No data'}`);
}
