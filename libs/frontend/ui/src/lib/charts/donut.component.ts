import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PtahChartSegment } from './chart.types';
import { segmentGeometry } from './segment-geometry';

@Component({
  selector: 'ptah-donut',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; min-width: 0; }
    svg { display: block; max-width: 100%; height: auto; }
  `,
  template: `
    <svg focusable="false" viewBox="0 0 120 120" width="132" height="132" role="img" [attr.aria-label]="summary()">
      <g aria-hidden="true">
        <g fill="none" stroke-width="14" transform="rotate(-90 60 60)">
          <circle cx="60" cy="60" r="46" stroke="var(--ptah-ring-track, var(--surface-border-strong))" />
          @for (segment of arcs(); track $index) {
            <circle cx="60" cy="60" r="46" pathLength="100" [attr.stroke]="segment.color"
              [attr.stroke-dasharray]="segment.visibleLength + ' 100'" [attr.stroke-dashoffset]="-segment.start">
              <title>{{ segment.label }}: {{ segment.value }}</title>
            </circle>
          }
        </g>
        <text x="60" y="58" text-anchor="middle" font-size="20" font-weight="650" fill="currentColor">{{ geometry().total }}</text>
        <text x="60" y="74" text-anchor="middle" font-size="9" class="text-base-content-muted" fill="currentColor">{{ centerCaption() }}</text>
      </g>
    </svg>
  `,
})
export class PtahDonutComponent {
  readonly segments = input.required<readonly PtahChartSegment[]>();
  readonly label = input.required<string>();
  readonly centerCaption = input('runs');

  protected readonly geometry = computed(() => segmentGeometry(this.segments()));
  protected readonly arcs = computed(() => this.geometry().marks.map((mark) => ({
    ...mark,
    visibleLength: mark.length === 100 ? 100 : mark.length - Math.min(0.5, mark.length / 2),
  })));
  protected readonly summary = computed(() => {
    const { total, summary } = this.geometry();
    const totalText = [total, this.centerCaption(), 'total'].filter((part) => part !== '').join(' ');
    return `${this.label()}: ${totalText}. ${summary || 'No data'}`;
  });
}
