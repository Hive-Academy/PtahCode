import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type PtahSkeletonShape = 'lines' | 'block';
export type PtahSkeletonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ptah-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div aria-hidden="true" [class.space-y-3]="shape() === 'lines'">
      @if (shape() === 'block') {
        <div
          class="skeleton w-full"
          [class.h-12]="size() === 'sm'"
          [class.h-24]="size() === 'md'"
          [class.h-40]="size() === 'lg'"
        ></div>
      } @else {
        @for (line of lineIndexes(); track line) {
          <div
            class="skeleton"
            [class.h-2]="size() === 'sm'"
            [class.h-3]="size() === 'md'"
            [class.h-4]="size() === 'lg'"
            [class.w-5/6]="line === 1"
            [class.w-4/6]="line === 2"
            [class.w-full]="line !== 1 && line !== 2"
          ></div>
        }
      }
    </div>
  `,
})
export class PtahSkeletonComponent {
  readonly lines = input(3);
  readonly shape = input<PtahSkeletonShape>('lines');
  readonly size = input<PtahSkeletonSize>('md');

  protected readonly lineIndexes = computed(() =>
    Array.from(
      { length: Math.max(0, Math.floor(this.lines())) },
      (_, index) => index,
    ),
  );
}
