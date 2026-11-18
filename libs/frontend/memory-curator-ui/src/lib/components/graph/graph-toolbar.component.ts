import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  PtahButtonDirective,
  PtahRichSelectComponent,
  type PtahSelectOption,
} from '@ptah-extension/ui';
import type { GraphViewOptions } from './model/graph.types';

@Component({
  selector: 'ptah-memory-graph-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahRichSelectComponent],
  template: `
    <div
      class="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label="Graph tools"
    >
      <label class="sr-only" for="memory-graph-search-input"
        >Search memories</label
      >
      <input
        id="memory-graph-search-input"
        data-testid="memory-graph-search"
        type="search"
        class="input input-sm input-bordered"
        placeholder="Search memories"
        [value]="searchQuery()"
        (input)="onSearch($event)"
      />
      <span class="text-xs text-base-content-muted" role="status"
        >{{ matchCount() }} matches</span
      >
      <div
        role="radiogroup"
        aria-label="Graph mode"
        data-testid="memory-graph-mode"
        class="join"
      >
        <button
          type="button"
          ptahButton
          size="sm"
          class="join-item"
          role="radio"
          [attr.aria-checked]="mode() === 'nodes'"
          (click)="modeChange.emit('nodes')"
        >
          Nodes
        </button>
        <button
          type="button"
          ptahButton
          size="sm"
          class="join-item"
          role="radio"
          [attr.aria-checked]="mode() === 'clusters'"
          (click)="modeChange.emit('clusters')"
        >
          Clusters
        </button>
      </div>
      <ptah-select
        label="Color by"
        size="sm"
        [options]="colorOptions"
        [value]="colorBy()"
        (valueChange)="onColor($event)"
      />
      <ptah-select
        label="Size by"
        size="sm"
        [options]="sizeOptions"
        [value]="sizeBy()"
        (valueChange)="onSize($event)"
      />
      <button
        type="button"
        ptahButton
        size="sm"
        variant="ghost"
        data-testid="memory-graph-relayout"
        [disabled]="layoutRunning()"
        (click)="relayout.emit()"
      >
        Re-run layout
      </button>
      <button
        type="button"
        ptahButton
        size="sm"
        variant="ghost"
        data-testid="memory-graph-freeze"
        [attr.aria-pressed]="frozen()"
        (click)="frozenChange.emit(!frozen())"
      >
        Freeze
      </button>
      @if (showFiltersButton()) {
        <button
          type="button"
          ptahButton
          size="sm"
          variant="ghost"
          data-testid="memory-graph-filters"
          [attr.aria-expanded]="filtersOpen()"
          (click)="filtersToggle.emit()"
        >
          Filters
        </button>
      }
    </div>
  `,
})
export class GraphToolbarComponent {
  readonly searchQuery = input.required<string>();
  readonly matchCount = input.required<number>();
  readonly mode = input.required<GraphViewOptions['mode']>();
  readonly colorBy = input.required<GraphViewOptions['colorBy']>();
  readonly sizeBy = input.required<GraphViewOptions['sizeBy']>();
  readonly frozen = input.required<boolean>();
  readonly layoutRunning = input.required<boolean>();
  readonly showFiltersButton = input.required<boolean>();
  readonly filtersOpen = input.required<boolean>();
  readonly searchQueryChange = output<string>();
  readonly modeChange = output<GraphViewOptions['mode']>();
  readonly colorByChange = output<GraphViewOptions['colorBy']>();
  readonly sizeByChange = output<GraphViewOptions['sizeBy']>();
  readonly relayout = output<void>();
  readonly frozenChange = output<boolean>();
  readonly filtersToggle = output<void>();
  protected readonly colorOptions: readonly PtahSelectOption<
    GraphViewOptions['colorBy']
  >[] = ['kind', 'tier', 'session', 'cluster'].map((value) => ({
    value: value as GraphViewOptions['colorBy'],
    label: value,
  }));
  protected readonly sizeOptions: readonly PtahSelectOption<
    GraphViewOptions['sizeBy']
  >[] = ['salience', 'hits', 'uniform'].map((value) => ({
    value: value as GraphViewOptions['sizeBy'],
    label: value,
  }));
  protected onSearch(event: Event): void {
    this.searchQueryChange.emit((event.target as HTMLInputElement).value);
  }
  protected onColor(value: GraphViewOptions['colorBy'] | null): void {
    if (value) this.colorByChange.emit(value);
  }
  protected onSize(value: GraphViewOptions['sizeBy'] | null): void {
    if (value) this.sizeByChange.emit(value);
  }
}
