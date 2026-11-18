import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type {
  MemoryGraphEdgeKind,
  MemoryKindWire,
  MemoryTierWire,
} from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  PtahRichSelectComponent,
  PtahToggleDirective,
  type PtahSelectOption,
} from '@ptah-extension/ui';
import { MemoryGraphStateService } from '../../services/memory-graph-state.service';
import type { GraphViewOptions, MemoryGraphFilters } from './model/graph.types';

@Component({
  selector: 'ptah-memory-graph-filter-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahRichSelectComponent, PtahToggleDirective],
  template: `
    <aside
      aria-label="Graph filters"
      data-testid="memory-graph-rail"
      class="flex flex-col gap-4 border-r border-surface-border bg-surface-2 p-3 text-sm"
    >
      <section aria-labelledby="graph-show-heading" class="space-y-2">
        <h3 id="graph-show-heading" class="font-semibold">Show</h3>
        <div role="group" aria-label="Tier" class="flex flex-wrap gap-1">
          @for (tier of tiers; track tier) {
            <button
              ptahButton
              type="button"
              size="xs"
              [variant]="
                chipSelected(state.filters().tiers, tier) ? 'primary' : 'ghost'
              "
              [attr.aria-pressed]="chipSelected(state.filters().tiers, tier)"
              (click)="toggleTier(tier)"
            >
              {{ tier }}
            </button>
          }
        </div>
        <div role="group" aria-label="Kind" class="flex flex-wrap gap-1">
          @for (kind of kinds; track kind) {
            <button
              ptahButton
              type="button"
              size="xs"
              [variant]="
                chipSelected(state.filters().kinds, kind) ? 'primary' : 'ghost'
              "
              [attr.aria-pressed]="chipSelected(state.filters().kinds, kind)"
              (click)="toggleKind(kind)"
            >
              {{ kind }}
            </button>
          }
        </div>
        <label class="flex items-center gap-2"
          ><input
            ptahToggle
            type="checkbox"
            [checked]="state.filters().pinnedOnly"
            (change)="patchFilter({ pinnedOnly: !state.filters().pinnedOnly })"
          />Pinned only</label
        >
        <ptah-select
          label="Scope"
          [options]="scopeOptions"
          [value]="state.filters().scope"
          (valueChange)="onScope($event)"
        />
        <ptah-select
          label="Session"
          [options]="sessionOptions()"
          [value]="state.filters().sessionId"
          (valueChange)="onSession($event)"
        />
      </section>
      <section aria-labelledby="graph-connections-heading" class="space-y-2">
        <h3 id="graph-connections-heading" class="font-semibold">
          Connections
        </h3>
        @for (edge of edges; track edge.kind) {
          <label
            class="flex items-center gap-2"
            [attr.title]="
              edge.kind === 'semantic' && !state.semanticAvailable()
                ? semanticReason
                : null
            "
          >
            <input
              ptahToggle
              type="checkbox"
              [attr.data-testid]="'memory-graph-edge-' + edge.kind"
              [checked]="state.filters().edgeKinds.includes(edge.kind)"
              [disabled]="
                edge.kind === 'semantic' && !state.semanticAvailable()
              "
              [attr.aria-describedby]="
                edge.kind === 'semantic' && !state.semanticAvailable()
                  ? 'graph-semantic-reason'
                  : null
              "
              (change)="toggleEdge(edge.kind)"
            />
            {{ edge.label }}
            <span class="text-base-content-muted">{{
              edgeCount(edge.kind)
            }}</span>
          </label>
        }
        @if (!state.semanticAvailable()) {
          <p id="graph-semantic-reason" class="text-xs text-base-content-muted">
            {{ semanticReason }}
          </p>
        }
        <label for="graph-similarity" class="flex justify-between"
          >Similarity at least
          <span>{{ state.filters().minSimilarity.toFixed(2) }}</span></label
        >
        <input
          id="graph-similarity"
          data-testid="memory-graph-similarity"
          type="range"
          min="0.5"
          max="0.99"
          step="0.01"
          class="range range-primary range-xs w-full"
          [value]="state.filters().minSimilarity"
          [disabled]="!state.semanticAvailable()"
          [attr.aria-describedby]="
            !state.semanticAvailable() ? 'graph-semantic-reason' : null
          "
          (input)="onSimilarity($event)"
        />
      </section>
      <section aria-labelledby="graph-layout-heading" class="space-y-2">
        <h3 id="graph-layout-heading" class="font-semibold">Layout</h3>
        <ptah-select
          label="Color by"
          [options]="colorOptions"
          [value]="state.view().colorBy"
          (valueChange)="onColor($event)"
        />
        <ptah-select
          label="Size by"
          [options]="sizeOptions"
          [value]="state.view().sizeBy"
          (valueChange)="onSize($event)"
        />
        <ptah-select
          label="Cluster by"
          [options]="clusterOptions"
          [value]="state.view().clusterBy"
          (valueChange)="onCluster($event)"
        />
        <label class="flex items-center gap-2"
          ><input
            ptahToggle
            type="checkbox"
            [checked]="state.view().showLabels"
            (change)="state.patchView({ showLabels: !state.view().showLabels })"
          />Show labels</label
        >
      </section>
      <button
        ptahButton
        type="button"
        size="sm"
        variant="ghost"
        (click)="state.resetFilters()"
      >
        Reset filters
      </button>
    </aside>
  `,
})
export class GraphFilterRailComponent {
  protected readonly state = inject(MemoryGraphStateService);
  protected readonly semanticReason =
    'Semantic links are unavailable while vector search is off.';
  protected readonly tiers: readonly MemoryTierWire[] = [
    'core',
    'recall',
    'archival',
  ];
  protected readonly kinds: readonly MemoryKindWire[] = [
    'fact',
    'preference',
    'event',
    'entity',
  ];
  protected readonly edges: readonly {
    kind: MemoryGraphEdgeKind;
    label: string;
  }[] = [
    { kind: 'semantic', label: 'Similar meaning' },
    { kind: 'subject', label: 'Same subject' },
    { kind: 'session', label: 'Same session' },
  ];
  protected readonly scopeOptions: readonly PtahSelectOption<
    MemoryGraphFilters['scope']
  >[] = [
    { value: 'workspace', label: 'This workspace' },
    { value: 'all', label: 'All workspaces' },
  ];
  protected readonly colorOptions: readonly PtahSelectOption<
    GraphViewOptions['colorBy']
  >[] = [
    { value: 'kind', label: 'Kind' },
    { value: 'tier', label: 'Tier' },
    { value: 'session', label: 'Session' },
    { value: 'cluster', label: 'Cluster' },
  ];
  protected readonly sizeOptions: readonly PtahSelectOption<
    GraphViewOptions['sizeBy']
  >[] = [
    { value: 'salience', label: 'Salience' },
    { value: 'hits', label: 'Hits' },
    { value: 'uniform', label: 'Uniform' },
  ];
  protected readonly clusterOptions: readonly PtahSelectOption<
    GraphViewOptions['clusterBy']
  >[] = [
    { value: 'subject', label: 'Subject' },
    { value: 'session', label: 'Session' },
    { value: 'kind', label: 'Kind' },
  ];
  protected sessionOptions(): readonly PtahSelectOption<string | null>[] {
    return [
      { value: null, label: 'All sessions' },
      ...this.state.sessions().map((value) => ({ value, label: value })),
    ];
  }
  protected chipSelected<T>(selected: readonly T[], value: T): boolean {
    return selected.length === 0 || selected.includes(value);
  }
  protected toggleTier(value: MemoryTierWire): void {
    this.toggleChip('tiers', value, this.tiers);
  }
  protected toggleKind(value: MemoryKindWire): void {
    this.toggleChip('kinds', value, this.kinds);
  }
  private toggleChip(
    key: 'tiers',
    value: MemoryTierWire,
    all: readonly MemoryTierWire[],
  ): void;
  private toggleChip(
    key: 'kinds',
    value: MemoryKindWire,
    all: readonly MemoryKindWire[],
  ): void;
  private toggleChip(
    key: 'tiers' | 'kinds',
    value: MemoryTierWire | MemoryKindWire,
    all: readonly (MemoryTierWire | MemoryKindWire)[],
  ): void {
    const selected: readonly (MemoryTierWire | MemoryKindWire)[] =
      this.state.filters()[key];
    const current = selected.length ? selected : all;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    if (next.length === 0) return;
    this.state.patchFilters({ [key]: next.length === all.length ? [] : next });
  }
  protected toggleEdge(kind: MemoryGraphEdgeKind): void {
    if (kind === 'semantic' && !this.state.semanticAvailable()) return;
    const current = this.state.filters().edgeKinds;
    this.state.patchFilters({
      edgeKinds: current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind],
    });
  }
  protected edgeCount(kind: MemoryGraphEdgeKind): number {
    return this.state.edgeCounts()[kind];
  }
  protected patchFilter(patch: Partial<MemoryGraphFilters>): void {
    this.state.patchFilters(patch);
  }
  protected onScope(value: MemoryGraphFilters['scope'] | null): void {
    if (value) this.state.patchFilters({ scope: value });
  }
  protected onSession(value: string | null): void {
    this.state.patchFilters({ sessionId: value });
  }
  protected onColor(value: GraphViewOptions['colorBy'] | null): void {
    if (value) this.state.patchView({ colorBy: value });
  }
  protected onSize(value: GraphViewOptions['sizeBy'] | null): void {
    if (value) this.state.patchView({ sizeBy: value });
  }
  protected onCluster(value: GraphViewOptions['clusterBy'] | null): void {
    if (value) this.state.patchView({ clusterBy: value });
  }
  protected onSimilarity(event: Event): void {
    this.state.patchFilters({
      minSimilarity: Number((event.target as HTMLInputElement).value),
    });
  }
}
