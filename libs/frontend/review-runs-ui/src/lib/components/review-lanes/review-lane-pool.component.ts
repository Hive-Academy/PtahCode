import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  input,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { ReviewLaneEntry, ReviewLaneListing } from '@ptah-extension/review-contracts';
import {
  PtahBadgeDirective,
  PtahIconButtonDirective,
  PtahRichSelectComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import { ArrowDown, ArrowUp, LucideAngularModule, X } from 'lucide-angular';
import {
  LANE_HINTS,
  announce,
  duplicateEntryIndexes,
  entryState,
  findLane,
  laneLabel,
  laneOptions,
  modelOptions,
  NO_CHOICE,
  poolFull,
  toModel,
} from './review-lane-options';

/**
 * Ordered lane pool: one row per entry with its model, status and move/remove buttons, then the
 * Add control. Presentational: it emits the whole next pool and never mutates its input.
 */
@Component({
  selector: 'ptah-review-lane-pool',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective, PtahIconButtonDirective, PtahRichSelectComponent, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h4 #poolHeading id="review-lane-pool-h" class="mt-3 text-xs font-semibold" tabindex="-1">Lane pool</h4>
    <p class="text-xs text-base-content-muted">Used in order. Add lanes to limit reviews to them.</p>
    @if (rows().length) {
      <ol class="mt-1.5 rounded-box border border-base-300 bg-base-200" aria-label="Review lane pool, in order of use">
        @for (row of rows(); track $index) {
          <li
            class="grid grid-cols-[24px_1fr_auto] items-start gap-x-2 px-2 py-2"
            [class.border-t]="!$first"
            [class.border-base-300]="!$first"
            [class.bg-warning/10]="row.state.unavailable"
          >
            <span class="pt-1 text-xs text-base-content-muted" aria-hidden="true">{{ $index + 1 }}</span>
            <span class="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
              <span class="truncate text-sm font-semibold">{{ row.label }}</span>
              @if (row.family) {
                <span ptahBadge appearance="outline" size="xs" tone="neutral">{{ row.family }}</span>
              }
              @for (mark of row.state.marks; track mark.label) {
                <ptah-status [status]="mark.status" [label]="mark.label" size="xs" />
              }
            </span>
            <span class="flex items-center gap-0.5">
              <button
                #upButton
                type="button"
                ptahIconButton
                variant="ghost"
                size="xs"
                [label]="'Move ' + row.label + ' up, position ' + ($index + 1) + ' of ' + rows().length"
                [disabled]="$first"
                (click)="move($index, -1)"
              >
                <lucide-angular [img]="ArrowUpIcon" class="size-3.5" aria-hidden="true" />
              </button>
              <button
                #downButton
                type="button"
                ptahIconButton
                variant="ghost"
                size="xs"
                [label]="'Move ' + row.label + ' down, position ' + ($index + 1) + ' of ' + rows().length"
                [disabled]="$last"
                (click)="move($index, 1)"
              >
                <lucide-angular [img]="ArrowDownIcon" class="size-3.5" aria-hidden="true" />
              </button>
              <button
                #removeButton
                type="button"
                ptahIconButton
                variant="ghost"
                size="xs"
                [label]="'Remove ' + row.label + ', position ' + ($index + 1) + ' of ' + rows().length"
                (click)="remove($index)"
              >
                <lucide-angular [img]="XIcon" class="size-3.5" aria-hidden="true" />
              </button>
            </span>
            <div class="col-span-2 col-start-2 mt-1.5 min-w-0">
              <ptah-select
                class="max-w-[260px]"
                size="xs"
                [label]="'Model for ' + row.label + ', position ' + ($index + 1)"
                [options]="row.modelOptions"
                [value]="row.modelValue"
                (valueChange)="setModel($index, $event)"
              />
              @for (hint of row.state.hints; track hint) {
                <p class="mt-1 text-xs text-base-content-muted">{{ hint }}</p>
              }
              @if (row.state.reason) {
                <p class="mt-1 text-xs text-base-content-muted">{{ row.state.reason }}</p>
              }
              @if (row.duplicate) {
                <p class="mt-1 flex items-center gap-1.5 text-xs text-base-content" role="alert">
                  <span class="inline-block size-2 shrink-0 bg-state-err" aria-hidden="true"></span>{{ duplicateText }}
                </p>
              }
            </div>
          </li>
        }
      </ol>
    }
    <div class="mt-2 max-w-[260px]">
      <ptah-select
        #addControl
        size="xs"
        label="Add lane to pool"
        [placeholder]="full() ? 'Pool is full' : 'Add a lane…'"
        [options]="addOptions()"
        [disabled]="addDisabled()"
        (valueChange)="add($event)"
      />
    </div>
    @if (full()) {
      <p class="mt-1 text-xs text-base-content-muted">{{ poolFullText }}</p>
    }
  `,
})
export class ReviewLanePoolComponent {
  readonly pool = input.required<readonly ReviewLaneEntry[]>();
  /** The listing to check entries against; `null` when it is missing or failed. */
  readonly listing = input<ReviewLaneListing | null>(null);
  /** Marks repeated entries with the duplicate error line. */
  readonly showDuplicates = input(false, { transform: booleanAttribute });
  readonly poolChanged = output<ReviewLaneEntry[]>();
  readonly announced = output<string>();

  protected readonly ArrowUpIcon = ArrowUp;
  protected readonly ArrowDownIcon = ArrowDown;
  protected readonly XIcon = X;
  protected readonly duplicateText = LANE_HINTS.duplicate;
  protected readonly poolFullText = LANE_HINTS.poolFull;

  private readonly upButtons = viewChildren<ElementRef<HTMLButtonElement>>('upButton');
  private readonly downButtons = viewChildren<ElementRef<HTMLButtonElement>>('downButton');
  private readonly removeButtons = viewChildren<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly addSelect = viewChild.required('addControl', {
    read: PtahRichSelectComponent,
  });
  private readonly poolHeading = viewChild.required<ElementRef<HTMLElement>>('poolHeading');

  protected readonly full = computed(() => poolFull(this.pool()));
  protected readonly addOptions = computed(() => laneOptions(this.listing()));
  protected readonly addDisabled = computed(() => this.full() || this.listing() === null);
  protected readonly rows = computed(() => {
    const listing = this.listing();
    const duplicates = this.showDuplicates() ? duplicateEntryIndexes(this.pool()) : new Set<number>();
    return this.pool().map((entry, index) => ({
      label: laneLabel(listing, entry.lane),
      family: findLane(listing, entry.lane)?.family ?? null,
      state: entryState(listing, entry, 'pool'),
      modelOptions: modelOptions(listing, entry.lane, entry.model),
      modelValue: entry.model ?? NO_CHOICE,
      duplicate: duplicates.has(index),
    }));
  });

  move(index: number, step: -1 | 1): void {
    const pool = this.pool();
    const target = index + step;
    if (target < 0 || target >= pool.length) return;
    // Focus first: the row reaching an edge disables the button that was pressed.
    const atEdge = step < 0 ? target === 0 : target === pool.length - 1;
    const sameDirection = step < 0 ? this.upButtons() : this.downButtons();
    const otherDirection = step < 0 ? this.downButtons() : this.upButtons();
    (atEdge ? otherDirection : sameDirection)[target]?.nativeElement.focus();
    const next = [...pool];
    [next[index], next[target]] = [next[target], next[index]];
    this.poolChanged.emit(next);
    this.announced.emit(
      announce.moved(laneLabel(this.listing(), pool[index].lane), step < 0 ? 'up' : 'down', target + 1, pool.length),
    );
  }

  remove(index: number): void {
    const pool = this.pool();
    const entry = pool[index];
    if (!entry) return;
    const next = pool.filter((_, i) => i !== index);
    // Rows are tracked by position, so the row now at this position keeps its buttons.
    if (next.length === 0) this.focusAddControl();
    else if (index >= next.length) this.removeButtons()[index - 1]?.nativeElement.focus();
    this.poolChanged.emit(next);
    this.announced.emit(announce.removed(laneLabel(this.listing(), entry.lane), next.length));
  }

  add(value: string | null): void {
    if (value === null || value === NO_CHOICE) return;
    this.addSelect().value.set(null);
    if (this.full() || !findLane(this.listing(), value)) return;
    const next = [...this.pool(), { lane: value, model: null }];
    this.poolChanged.emit(next);
    this.announced.emit(announce.added(laneLabel(this.listing(), value), next.length));
  }

  setModel(index: number, value: string | null): void {
    const pool = this.pool();
    const entry = pool[index];
    const model = toModel(value);
    if (!entry || entry.model === model) return;
    this.poolChanged.emit(pool.map((current, i) => (i === index ? { lane: current.lane, model } : current)));
  }

  private focusAddControl(): void {
    const trigger = this.addSelect().element.nativeElement as HTMLButtonElement;
    if (!this.addDisabled() && !trigger.disabled) trigger.focus();
    else this.poolHeading().nativeElement.focus();
  }
}
