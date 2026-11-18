import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { buildTimeBuckets } from './time-brush.buckets';

export interface TimeBrushRange { readonly from: number | null; readonly to: number | null; }

@Component({
  selector: 'ptah-memory-time-brush', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective],
  template: `
    <section aria-label="Created date range" data-testid="memory-graph-time-brush" class="flex items-center gap-3 border-t border-surface-border bg-surface-2 p-3 text-sm">
      <span>Created</span>
      <div class="min-w-0 flex-1">
        <div class="flex h-6 items-end gap-px" aria-hidden="true">
          @for (bucket of buckets(); track bucket.from) { <span class="min-w-0 flex-1 bg-primary/50" [style.height.%]="bucket.count / maxCount() * 100"></span> }
        </div>
        <div class="flex gap-2">
          <input type="range" aria-label="From date" class="range range-primary range-xs w-1/2" [min]="bounds().min" [max]="bounds().max" [value]="from() ?? bounds().min" [disabled]="!buckets().length" (input)="changeFrom($event)" (change)="changeFrom($event)" />
          <input type="range" aria-label="To date" class="range range-primary range-xs w-1/2" [min]="bounds().min" [max]="bounds().max" [value]="to() ?? bounds().max" [disabled]="!buckets().length" (input)="changeTo($event)" (change)="changeTo($event)" />
        </div>
      </div>
      <button ptahButton type="button" size="xs" variant="ghost" [disabled]="from() === null && to() === null" (click)="rangeChange.emit({ from: null, to: null })">Clear</button>
    </section>
  `,
})
export class TimeBrushComponent {
  public readonly timestamps = input.required<readonly number[]>();
  public readonly from = input<number | null>(null);
  public readonly to = input<number | null>(null);
  public readonly rangeChange = output<TimeBrushRange>();
  protected readonly buckets = computed(() => buildTimeBuckets(this.timestamps()));
  protected readonly maxCount = computed(() => Math.max(1, ...this.buckets().map(bucket => bucket.count)));
  protected readonly bounds = computed(() => ({ min: this.buckets()[0]?.from ?? 0, max: this.buckets().at(-1)?.to ?? 1 }));
  protected changeFrom(event: Event): void { this.rangeChange.emit({ from: Math.min(Number((event.target as HTMLInputElement).value), this.to() ?? this.bounds().max), to: this.to() }); }
  protected changeTo(event: Event): void { this.rangeChange.emit({ from: this.from(), to: Math.max(Number((event.target as HTMLInputElement).value), this.from() ?? this.bounds().min) }); }
}
