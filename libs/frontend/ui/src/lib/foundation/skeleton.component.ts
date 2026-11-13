import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PtahSkeletonShape = 'lines' | 'block';

@Component({
  selector: 'ptah-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div aria-hidden="true" [class.space-y-3]="shape() === 'lines'">@if (shape() === 'block') { <div class="skeleton w-full" [class.h-24]="height() === null" [style.height]="height()"></div> } @else { @for (line of lineIndexes(); track line) { <div class="skeleton" [class.h-3]="height() === null" [style.height]="height()" [class.w-5/6]="line === 1" [class.w-4/6]="line === 2" [class.w-full]="line !== 1 && line !== 2"></div> } }</div>`,
})
export class PtahSkeletonComponent {
  readonly lines = input(3);
  readonly shape = input<PtahSkeletonShape>('lines');
  readonly height = input<string | null>(null);
  readonly lineIndexes = () => Array.from({ length: Math.max(0, Math.floor(this.lines())) }, (_, index) => index);
}
