import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { GraphViewOptions } from './model/graph.types';

export interface GraphLegendColor {
  readonly label: string;
  readonly color: string;
}

@Component({
  selector: 'ptah-graph-legend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-testid="memory-graph-legend"
      class="rounded-box border border-base-300 bg-base-100/90 p-2 text-xs text-base-content"
      aria-label="Graph legend"
    >
      <strong>Color by {{ colorBy() }}</strong>
      <div class="flex flex-wrap gap-2">
        @for (item of colors(); track item.label) {
          <span
            ><span
              class="inline-block size-2 rounded-full"
              [style.background-color]="item.color"
              aria-hidden="true"
            ></span>
            {{ item.label }}</span
          >
        }
      </div>
      <div>Similar meaning — solid</div>
      <div>Same subject – dashed</div>
      <div>Same session · dotted</div>
    </div>
  `,
})
export class GraphLegendComponent {
  readonly colorBy = input.required<GraphViewOptions['colorBy']>();
  readonly colors = input.required<readonly GraphLegendColor[]>();
}
