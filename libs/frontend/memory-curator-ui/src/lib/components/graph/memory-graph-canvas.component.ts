import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import type { MemoryGraphEdgeWire } from '@ptah-extension/shared';
import {
  nearestInDirection,
  nextLinked,
  type GraphDirection,
} from './model/keyboard-nav';
import type { GraphModel, GraphViewOptions } from './model/graph.types';
import type { GraphRendererPort } from './renderer/graph-renderer.port';
import { GRAPH_RENDERER_FACTORY } from './renderer/graph-renderer.token';
import {
  GraphLegendComponent,
  type GraphLegendColor,
} from './graph-legend.component';
import {
  GraphMinimapComponent,
  type MinimapPoint,
  type MinimapViewport,
} from './graph-minimap.component';

@Component({
  selector: 'ptah-memory-graph-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GraphLegendComponent, GraphMinimapComponent],
  host: {
    role: 'application',
    tabindex: '0',
    'data-testid': 'memory-graph-canvas',
    '[attr.aria-label]': 'ariaLabel()',
    'aria-describedby': 'memory-graph-keyboard-help',
    '(keydown)': 'onKeydown($event)',
  },
  template: `
    <div #rendererHost class="absolute inset-0"></div>
    <p id="memory-graph-keyboard-help" class="sr-only">
      Use arrow keys to move between memories, Enter to select, Shift Enter to
      add, brackets for linked memories, Escape to clear, plus or minus to zoom,
      and zero to fit. Tab moves out of the graph.
    </p>
    <div
      data-testid="memory-graph-live"
      aria-live="polite"
      aria-atomic="true"
      class="sr-only"
    >
      {{ announcement() }}
    </div>
    @if (error()) {
      <div role="alert" class="alert alert-error absolute left-2 top-2">
        {{ error() }}
      </div>
    }
    <div class="absolute bottom-2 left-2 flex flex-col gap-1">
      <button
        type="button"
        class="btn btn-sm"
        aria-label="Zoom in"
        (click)="zoom(1)"
      >
        +
      </button>
      <button
        type="button"
        class="btn btn-sm"
        aria-label="Zoom out"
        (click)="zoom(-1)"
      >
        −
      </button>
      <button
        type="button"
        class="btn btn-sm"
        aria-label="Fit graph"
        (click)="fit()"
      >
        Fit
      </button>
    </div>
    <div class="absolute right-2 top-2">
      <ptah-graph-legend [colorBy]="colorMode()" [colors]="legendColors()" />
    </div>
    @if (showMinimap()) {
      <div class="absolute bottom-2 right-2">
        <ptah-graph-minimap
          [positions]="minimapPositions()"
          [viewport]="minimapViewport()"
        />
      </div>
    }
  `,
  styles: [
    ':host { display: block; position: relative; min-height: 20rem; outline-offset: 2px; }',
  ],
})
export class MemoryGraphCanvasComponent {
  readonly model = input.required<GraphModel>();
  readonly selectedIds = input<readonly string[]>([]);
  readonly highlightIds = input<ReadonlySet<string> | null>(null);
  readonly frozen = input(false);
  readonly showLabels = input(false);
  readonly edges = input<readonly MemoryGraphEdgeWire[]>([]);
  readonly showMinimap = input(true);
  readonly colorBy = input<GraphViewOptions['colorBy']>('kind');
  readonly nodeSelect = output<{ id: string; additive: boolean }>();
  readonly selectionClear = output<void>();
  readonly rendererError = output<string>();
  private readonly rendererFactory = inject(GRAPH_RENDERER_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostElement =
    viewChild.required<ElementRef<HTMLDivElement>>('rendererHost');
  private readonly port = signal<GraphRendererPort | null>(null);
  private destroyed = false;
  private readonly unsubs: Array<() => void> = [];
  private readonly focusedId = signal<string | null>(null);
  private linkedIndex = 0;
  protected readonly error = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly minimapPositions = signal<readonly MinimapPoint[]>([]);
  protected readonly minimapViewport = signal<MinimapViewport | null>(null);
  protected readonly ariaLabel = computed(
    () =>
      `Memory graph, ${this.model().nodes.length} memories, ${this.model().edges.length} links`,
  );
  protected readonly colorMode = computed(() => this.colorBy());
  protected readonly legendColors = computed<readonly GraphLegendColor[]>(
    () => {
      const colors = new Map<string, string>();
      for (const node of this.model().nodes) {
        const label =
          this.colorBy() === 'kind'
            ? node.wire.kind
            : this.colorBy() === 'tier'
              ? node.wire.tier
              : this.colorBy() === 'session'
                ? (node.wire.sessionId ?? 'No session')
                : node.cluster;
        if (!colors.has(label)) colors.set(label, node.color);
      }
      return [...colors].map(([label, color]) => ({ label, color }));
    },
  );

  constructor() {
    afterNextRender(() => {
      void this.mount();
    });
    effect(() => {
      this.port()?.setModel(this.model());
    });
    effect(() => {
      const nodes = this.model().nodes;
      const focusedId = this.focusedId();
      if (focusedId && !nodes.some((node) => node.id === focusedId)) {
        this.focusedId.set(null);
        this.linkedIndex = 0;
      }
    });
    effect(() => {
      this.port()?.setSelection(this.selectedIds());
    });
    effect(() => {
      this.port()?.setHighlight(this.highlightIds());
    });
    effect(() => {
      this.port()?.setFrozen(this.frozen());
    });
    effect(() => {
      this.port()?.setLabelsVisible(this.showLabels());
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.unsubs.forEach((unsubscribe) => unsubscribe());
      this.port()?.destroy();
    });
  }

  public relayout(): void {
    this.port()?.relayout();
  }
  public fit(): void {
    this.port()?.fit();
    this.refreshMinimap();
  }
  protected zoom(delta: 1 | -1): void {
    this.port()?.zoom(delta);
    this.refreshMinimap();
  }

  private async mount(): Promise<void> {
    let renderer: GraphRendererPort;
    try {
      renderer = await this.rendererFactory();
    } catch (error) {
      // degradation-audit: reported - the canvas shows the error and emits rendererError
      if (!this.destroyed) {
        const message = 'Memory graph could not be displayed.';
        this.error.set(message);
        this.rendererError.emit(this.errorDetail(message, error));
      }
      return;
    }
    if (this.destroyed) {
      renderer.destroy();
      return;
    }
    try {
      renderer.mount(this.hostElement().nativeElement, {
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
      });
      this.unsubs.push(
        renderer.on('nodeClick', (selection) =>
          this.nodeSelect.emit(selection),
        ),
      );
      this.unsubs.push(
        renderer.on('stageClick', () => this.selectionClear.emit()),
      );
      this.unsubs.push(
        renderer.on('viewportChange', () => this.refreshMinimap()),
      );
      this.unsubs.push(renderer.on('layoutState', () => this.refreshMinimap()));
      this.port.set(renderer);
      this.announcement.set(
        `Graph loaded, ${this.model().nodes.length} memories`,
      );
      this.refreshMinimap();
    } catch (error) {
      renderer.destroy();
      const message = 'Memory graph could not be displayed.';
      this.error.set(message);
      this.rendererError.emit(this.errorDetail(message, error));
    }
  }

  private refreshMinimap(): void {
    const renderer = this.port();
    if (!renderer) return;
    this.minimapPositions.set(
      [...renderer.positions()].map(([id, point]) => ({ id, ...point })),
    );
    this.minimapViewport.set(renderer.viewport());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (
      event.target !== event.currentTarget ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const renderer = this.port();
    if (!renderer) return;
    const directions: Record<string, GraphDirection> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    if (event.key in directions) {
      const positions = [...renderer.positions()].map(([id, point]) => ({
        id,
        ...point,
      }));
      const origin = this.focusedId();
      if (!origin) {
        const first = this.model().nodes[0]?.id;
        if (first) this.focusNode(first);
      } else {
        const next = nearestInDirection(
          positions,
          origin,
          directions[event.key],
        );
        if (next) this.focusNode(next);
      }
    } else if (event.key === 'Enter') {
      const id = this.focusedId();
      if (id) this.nodeSelect.emit({ id, additive: event.shiftKey });
    } else if (event.key === '[' || event.key === ']') {
      const origin = this.focusedId() ?? this.model().nodes[0]?.id;
      if (origin) {
        const next = nextLinked(
          this.model().edges,
          origin,
          event.key === ']' ? this.linkedIndex++ : --this.linkedIndex,
        );
        if (next) this.focusNode(next, true);
      }
    } else if (event.key === 'Escape') this.selectionClear.emit();
    else if (event.key === '+' || event.key === '=') this.zoom(1);
    else if (event.key === '-') this.zoom(-1);
    else if (event.key === '0') this.fit();
    else return;
    event.preventDefault();
  }

  private focusNode(id: string, preserveLinkedIndex = false): void {
    if (!preserveLinkedIndex && id !== this.focusedId()) this.linkedIndex = 0;
    this.focusedId.set(id);
    this.port()?.focus(id);
    const node = this.model().nodes.find((item) => item.id === id);
    if (!node) return;
    const count = this.model().edges.filter(
      (edge) => edge.source === id || edge.target === id,
    ).length;
    this.announcement.set(
      `${node.wire.subject || 'Untitled'}, ${node.wire.kind}, ${node.wire.tier}, ${count} links`,
    );
  }

  private errorDetail(message: string, error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `${message} ${detail.slice(0, 160)}`;
  }
}
