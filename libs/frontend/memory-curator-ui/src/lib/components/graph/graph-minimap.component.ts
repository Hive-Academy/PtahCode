import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export interface MinimapPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}
export interface MinimapViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

@Component({
  selector: 'ptah-graph-minimap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      aria-hidden="true"
      class="hidden w-32 rounded-box border border-base-300 bg-base-100/90 min-[1168px]:block"
      viewBox="0 0 100 70"
    >
      @for (point of dots(); track point.id) {
        <circle
          [attr.cx]="point.x"
          [attr.cy]="point.y"
          r="1.5"
          fill="currentColor"
        />
      }
      @if (box(); as rect) {
        <rect
          [attr.x]="rect.x"
          [attr.y]="rect.y"
          [attr.width]="rect.width"
          [attr.height]="rect.height"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
      }
    </svg>
  `,
})
export class GraphMinimapComponent {
  readonly positions = input.required<readonly MinimapPoint[]>();
  readonly viewport = input<MinimapViewport | null>(null);
  protected readonly bounds = computed(() => {
    const points = this.positions();
    const viewport = this.viewport();
    const xs = [
      ...points.map((point) => point.x),
      ...(viewport ? [viewport.x, viewport.x + viewport.width] : []),
    ];
    const ys = [
      ...points.map((point) => point.y),
      ...(viewport ? [viewport.y, viewport.y + viewport.height] : []),
    ];
    const minX = Math.min(0, ...xs),
      minY = Math.min(0, ...ys);
    return {
      minX,
      minY,
      width: Math.max(1, ...xs.map((x) => x - minX)),
      height: Math.max(1, ...ys.map((y) => y - minY)),
    };
  });
  protected readonly dots = computed(() =>
    this.positions().map((point) => ({
      id: point.id,
      x: this.x(point.x),
      y: this.y(point.y),
    })),
  );
  protected readonly box = computed(() => {
    const viewport = this.viewport();
    return viewport
      ? {
          x: this.x(viewport.x),
          y: this.y(viewport.y),
          width: (viewport.width * 100) / this.bounds().width,
          height: (viewport.height * 70) / this.bounds().height,
        }
      : null;
  });
  private x(value: number): number {
    return ((value - this.bounds().minX) * 100) / this.bounds().width;
  }
  private y(value: number): number {
    return ((value - this.bounds().minY) * 70) / this.bounds().height;
  }
}
