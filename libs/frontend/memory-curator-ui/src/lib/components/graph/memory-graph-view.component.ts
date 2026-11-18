import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import type { MemoryWire } from '@ptah-extension/shared';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { MemoryGraphStateService } from '../../services/memory-graph-state.service';
import { MemoryRpcService } from '../../services/memory-rpc.service';
import { MemoryStateService } from '../../services/memory-state.service';
import { GraphFilterRailComponent } from './graph-filter-rail.component';
import { GraphSelectionBarComponent } from './graph-selection-bar.component';
import { GraphToolbarComponent } from './graph-toolbar.component';
import {
  connectedMemories,
  GRAPH_VIEW_STYLES,
  observeGraphPane,
} from './memory-graph-view.helpers';
import { FALLBACK_GRAPH_PALETTE, readGraphPalette } from './graph-palette';
import { buildGraphModel } from './model/build-graph-model';
import type { GraphPalette } from './model/graph.types';
import { MemoryGraphCanvasComponent } from './memory-graph-canvas.component';
import { MemoryInspectorComponent } from './memory-inspector.component';
import {
  TimeBrushComponent,
  type TimeBrushRange,
} from './time-brush.component';

@Component({
  selector: 'ptah-memory-graph-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahButtonDirective,
    GraphToolbarComponent,
    GraphFilterRailComponent,
    MemoryGraphCanvasComponent,
    MemoryInspectorComponent,
    TimeBrushComponent,
    GraphSelectionBarComponent,
  ],
  host: { class: 'block min-w-0' },
  styles: [GRAPH_VIEW_STYLES],
  template: `
    <section
      #pane
      class="graph-pane"
      data-testid="memory-graph-view"
      aria-label="Memory graph"
    >
      <div class="space-y-2 p-3">
        <ptah-memory-graph-toolbar
          [searchQuery]="state.searchQuery()"
          [matchCount]="state.matchIds().size"
          [mode]="state.view().mode"
          [colorBy]="state.view().colorBy"
          [sizeBy]="state.view().sizeBy"
          [frozen]="state.view().frozen"
          [layoutRunning]="false"
          [showFiltersButton]="layout() === 'narrow'"
          [filtersOpen]="filtersOpen()"
          (searchQueryChange)="state.setSearchQuery($event)"
          (modeChange)="state.patchView({ mode: $event })"
          (colorByChange)="state.patchView({ colorBy: $event })"
          (sizeByChange)="state.patchView({ sizeBy: $event })"
          (frozenChange)="state.patchView({ frozen: $event })"
          (relayout)="canvas()?.relayout()"
          (filtersToggle)="filtersOpen.set(!filtersOpen())"
        />
        <p
          data-testid="memory-graph-count"
          class="text-sm text-base-content-muted"
        >
          {{ state.nodes().length }} memories · {{ state.edges().length }} links
        </p>
        @if (state.capped()) {
          <div
            data-testid="memory-graph-capped"
            role="status"
            class="flex flex-wrap items-center gap-2 text-sm"
          >
            <span
              >Showing {{ state.nodes().length }} of
              {{ state.totalMatching() }} memories</span
            >
            <button
              ptahButton
              type="button"
              size="xs"
              variant="outline"
              (click)="state.showUpToMax()"
            >
              Show up to 1,500
            </button>
          </div>
        }
        @if (!state.semanticAvailable()) {
          <div
            data-testid="memory-graph-vec-off"
            role="alert"
            class="flex flex-wrap items-center gap-2 text-sm"
          >
            <span>Semantic links are unavailable.</span>
            <button
              ptahButton
              type="button"
              size="xs"
              variant="outline"
              (click)="openHealth.emit()"
            >
              Open Health
            </button>
          </div>
        }
        @if (state.error()) {
          <div
            data-testid="memory-graph-error"
            role="alert"
            class="flex flex-wrap items-center gap-2 text-sm"
          >
            <span>{{ state.error() }}</span>
            <button
              ptahButton
              type="button"
              size="xs"
              variant="outline"
              (click)="state.refresh()"
            >
              Retry
            </button>
          </div>
        }
        @if (rendererError()) {
          <div data-testid="memory-graph-renderer-error" role="alert">
            {{ rendererError() }}
          </div>
        }
        @if (actionError()) {
          <div data-testid="memory-graph-action-error" role="alert">
            {{ actionError() }}
          </div>
        }
      </div>
      <div class="graph-grid">
        @if (layout() !== 'narrow' || filtersOpen()) {
          <div class="graph-rail"><ptah-memory-graph-filter-rail /></div>
        }
        <div class="graph-main">
          <div class="graph-canvas">
            @if (state.loading() && !state.result()) {
              <div data-testid="memory-graph-loading" role="status" class="p-6">
                Loading memory graph
              </div>
            } @else if (state.result() && state.nodes().length === 0) {
              @if (state.isDefaultFilters()) {
                <div data-testid="memory-graph-empty" class="p-6">
                  <h3>No memories yet</h3>
                  <p>
                    Thoth captures facts and decisions as you chat. Keep working
                    and they will appear here as a graph.
                  </p>
                </div>
              } @else {
                <div data-testid="memory-graph-filtered-empty" class="p-6">
                  <p>No memories match these filters.</p>
                  <button
                    ptahButton
                    type="button"
                    size="sm"
                    variant="outline"
                    (click)="state.resetFilters()"
                  >
                    Reset filters
                  </button>
                </div>
              }
            } @else if (state.result()) {
              <ptah-memory-graph-canvas
                #graphCanvas
                [model]="model()"
                [selectedIds]="state.selectedIds()"
                [highlightIds]="highlightIds()"
                [frozen]="state.view().frozen"
                [showLabels]="state.view().showLabels"
                [edges]="state.edges()"
                [showMinimap]="layout() !== 'narrow'"
                [colorBy]="state.view().colorBy"
                (nodeSelect)="state.select($event.id, $event.additive)"
                (selectionClear)="state.clearSelection()"
                (rendererError)="rendererError.set($event)"
              />
            }
          </div>
          <ptah-memory-time-brush
            [timestamps]="timestamps()"
            [from]="state.filters().createdFrom"
            [to]="state.filters().createdTo"
            (rangeChange)="onRange($event)"
          />
        </div>
        @if (state.selectedNodes().length) {
          <div class="graph-inspector">
            <ptah-memory-inspector
              [nodes]="state.selectedNodes()"
              [connected]="connected()"
              [detail]="detail()"
              [detailLoading]="detailLoading()"
              [busy]="busy()"
              (pin)="runAction('pin', [$event])"
              (unpin)="runAction('unpin', [$event])"
              (forget)="runAction('forget', [$event])"
              (selectNode)="state.select($event, false)"
              (closed)="state.clearSelection()"
            />
          </div>
        }
      </div>
      @if (state.selectedNodes().length >= 2) {
        <ptah-memory-graph-selection-bar
          [count]="state.selectedNodes().length"
          [ids]="selectedNodeIds()"
          [busy]="busy()"
          (pinAll)="runAction('pin', selectedNodeIds())"
          (unpinAll)="runAction('unpin', selectedNodeIds())"
          (forgetAll)="runAction('forget', selectedNodeIds())"
          (clear)="state.clearSelection()"
        />
      }
    </section>
  `,
})
export class MemoryGraphViewComponent {
  public readonly openHealth = output<void>();
  protected readonly state = inject(MemoryGraphStateService);
  private readonly memory = inject(MemoryStateService);
  private readonly rpc = inject(MemoryRpcService);
  private readonly appState = inject(AppStateManager);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  protected readonly canvas =
    viewChild<MemoryGraphCanvasComponent>('graphCanvas');
  protected readonly palette = signal<GraphPalette>(FALLBACK_GRAPH_PALETTE);
  protected readonly layout = signal<'wide' | 'medium' | 'narrow'>('wide');
  protected readonly filtersOpen = signal(false);
  protected readonly rendererError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly detail = signal<MemoryWire | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly busy = signal(false);
  private readonly singleSelectedId = computed(
    () =>
      this.state.selectedNodes().length === 1
        ? this.state.selectedNodes()[0].id
        : null,
    { equal: Object.is },
  );
  protected readonly model = computed(() =>
    buildGraphModel(
      this.state.nodes(),
      this.state.edges(),
      this.state.view(),
      this.palette(),
    ),
  );
  protected readonly highlightIds = computed(() =>
    this.state.searchQuery().trim() ? this.state.matchIds() : null,
  );
  /** Bulk actions use only the selected memories that are on the screen. */
  protected readonly selectedNodeIds = computed(() =>
    this.state.selectedNodes().map((node) => node.id),
  );
  protected readonly timestamps = computed(() =>
    this.state.nodes().map((node) => node.createdAt),
  );
  protected readonly connected = computed(() =>
    connectedMemories(
      this.state.selectedNodes(),
      this.state.nodes(),
      this.state.edges(),
    ),
  );
  private detailSeq = 0;

  public constructor() {
    afterNextRender(() => {
      const element = this.pane()?.nativeElement;
      if (!element) return;
      this.destroyRef.onDestroy(
        observeGraphPane(
          element,
          (layout) => this.layout.set(layout),
          () => this.palette.set(readGraphPalette(element)),
        ),
      );
    });
    effect(() => {
      const workspacePath = this.appState.workspaceInfo()?.path;
      queueMicrotask(() => {
        if (
          !this.destroyRef.destroyed &&
          workspacePath === this.appState.workspaceInfo()?.path
        )
          void this.state.refresh();
      });
    });
    effect(() => {
      const id = this.singleSelectedId();
      const seq = ++this.detailSeq;
      this.detail.set(null);
      if (!id) {
        this.detailLoading.set(false);
        return;
      }
      this.detailLoading.set(true);
      void this.rpc
        .get(id)
        .then((result) => {
          if (seq === this.detailSeq) this.detail.set(result.memory);
        })
        .catch(() => {
          if (seq === this.detailSeq) this.detail.set(null);
        })
        .finally(() => {
          if (seq === this.detailSeq) this.detailLoading.set(false);
        });
    });
    this.destroyRef.onDestroy(() => ++this.detailSeq);
  }
  protected onRange(range: TimeBrushRange): void {
    this.state.patchFilters({ createdFrom: range.from, createdTo: range.to });
  }
  protected async runAction(
    action: 'pin' | 'unpin' | 'forget',
    ids: readonly string[],
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      for (const id of ids) {
        const succeeded = await this.memory[action](id);
        if (!succeeded) {
          this.actionError.set(this.memory.error() ?? 'Memory action failed.');
          break;
        }
        if (action === 'forget') this.state.removeNodes([id]);
        else this.state.patchNode(id, { pinned: action === 'pin' });
      }
    } catch {
      this.actionError.set(this.memory.error() ?? 'Memory action failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
