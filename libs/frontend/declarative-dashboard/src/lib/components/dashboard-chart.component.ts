import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, viewChild } from '@angular/core';
import type { SurfaceSelection } from '@ptah-extension/shared/mcp-apps-contracts/surface';
import { chartGeometry, compactNumber, type ChartCategory, type ChartPoint } from '../charts/chart-geometry';
import type { SurfaceComponentViewState } from '../surface-view-state';
import { pageSlice } from '../table/table-rows';
import type { DisplayNode } from '../view-model/view-model.types';
import { PtahButtonDirective, PtahIconButtonDirective, PtahSurfaceDirective } from '@ptah-extension/ui';

export type ChartNode = Extract<DisplayNode, { kind: 'line-chart' | 'bar-chart' }>;

let nextChartInstance = 0;
const SERIES_STROKES = ['stroke-primary', 'stroke-secondary', 'stroke-accent', 'stroke-info'] as const;
/** Above this many categories the x axis shows only its first and last label. */
const MAX_CATEGORY_LABELS = 24;
/** Value labels sit on bars only while each bar is wide enough to hold one. */
const MIN_VALUE_LABEL_BAR_WIDTH = 28;
const SERIES_FILLS = ['fill-primary', 'fill-secondary', 'fill-accent', 'fill-info'] as const;

@Component({
  selector: 'ptah-dashboard-chart',
  standalone: true,
  imports: [PtahButtonDirective, PtahIconButtonDirective, PtahSurfaceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section ptahSurface variant="inset" padding="md" class="group flex h-full min-w-0 flex-col gap-2 text-base-content" (keydown.escape)="collapse($event)">
      <div class="flex min-w-0 items-start gap-2">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 class="break-words text-sm font-semibold">{{ node().title?.text ?? 'Chart' }}</h3>
          @if (node().description; as description) { <p class="text-xs text-base-content-muted">{{ description.text }}</p> }
        </div>
        @if (!node().data) {
          <!-- Quiet icon controls: dimmed until the chart is hovered or a control has focus; both stay in the tab order. -->
          <div class="flex shrink-0 items-center gap-0.5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            [class.opacity-60]="!viewState().chartAsTable && !viewState().expanded">
            <!-- A pressed toggle keeps one name; aria-pressed carries the state. -->
            <button type="button" ptahIconButton size="xs" label="Show as table"
              [selected]="!!viewState().chartAsTable" [attr.data-apps-focus-key]="focusKey('table')" (click)="toggleTable()">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                @if (viewState().chartAsTable) { <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> }
                @else { <path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14" /> }
              </svg>
            </button>
            <!-- Client-only presentation toggle: it writes view state and never reaches the host. -->
            <button #expandButton type="button" ptahIconButton size="xs"
              [label]="(viewState().expanded ? 'Collapse ' : 'Expand ') + (node().title?.text ?? 'Chart')"
              [attr.aria-expanded]="!!viewState().expanded" [attr.aria-controls]="contentId"
              [attr.data-apps-focus-key]="focusKey('expand')" (click)="toggleExpanded()">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path [attr.d]="viewState().expanded ? 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' : 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'" />
              </svg>
            </button>
          </div>
        }
      </div>
      @if (node().data; as data) {
        <p role="status" class="text-sm text-base-content-muted">Data is not available in this view.@if (data.rowCount !== undefined) { {{ data.rowCount }} rows. }</p>
      } @else {
        <div [id]="contentId" class="flex flex-col gap-2">
        @if (viewState().chartAsTable) {
          <div class="overflow-auto" [class.max-h-96]="!viewState().expanded">
            <table class="table table-sm">
              <caption>{{ node().title?.text ?? 'Chart data' }}</caption>
              <thead><tr><th scope="col">Series</th><th scope="col">{{ node().xLabel?.text ?? 'X' }}</th>
                <th scope="col">{{ node().yLabel?.text ?? 'Y' }}</th>
                @if (node().selectable) { <th scope="col">Selection</th> }
              </tr></thead>
              <tbody>
                @for (point of page().items; track point.seriesIndex + ':' + point.pointIndex) {
                  <tr><th scope="row">{{ point.name }}</th><td>{{ point.x }}</td><td>{{ point.y }}</td>
                    @if (node().selectable) {
                      <td><button type="button" ptahButton variant="ghost" size="xs"
                        [attr.aria-label]="'Select ' + point.name + ', ' + point.x + ', ' + point.y"
                        [attr.aria-pressed]="isSelected(point)"
                        [attr.data-apps-focus-key]="focusKey('point-' + point.seriesIndex + '-' + point.pointIndex)"
                        (click)="selectPoint(point)">Select</button></td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p role="status">{{ page().total }} points. Page {{ page().page + 1 }} of {{ page().pageCount }}</p>
          @if (page().pageCount > 1) {
            <div class="flex gap-2">
              <button type="button" ptahButton [disabled]="page().page === 0"
                [attr.data-apps-focus-key]="focusKey('previous')" (click)="setPage(page().page - 1)">Previous</button>
              <button type="button" ptahButton [disabled]="page().page + 1 === page().pageCount"
                [attr.data-apps-focus-key]="focusKey('next')" (click)="setPage(page().page + 1)">Next</button>
            </div>
          }
        } @else {
          <svg viewBox="0 0 600 280" role="img" [attr.aria-label]="node().title?.text ?? 'Chart'" class="w-full"
            [class.max-h-64]="!viewState().expanded">
            <svg:title>{{ node().title?.text ?? 'Chart' }}</svg:title>
            <svg:desc>Use Show as table to read every point{{ node().selectable ? ' and select a point' : '' }}.</svg:desc>
            @if (node().kind === 'bar-chart') {
              <defs>
                @for (series of geometry().series; track $index) {
                  @if ($index > 0) {
                    <pattern [attr.id]="patternId($index)" width="6" height="6"
                      patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="6" stroke-width="2" [attr.class]="seriesStroke($index)" />
                    </pattern>
                  }
                }
              </defs>
            }
            <!-- Subtle horizontal gridlines with compact tick labels; the zero baseline is drawn stronger. -->
            @for (tick of geometry().ticks; track $index) {
              <text x="52" [attr.y]="tick.y + 5" text-anchor="end" font-size="14" fill="currentColor" class="text-base-content-muted">{{ tick.label }}</text>
              <line x1="60" x2="540" [attr.y1]="tick.y" [attr.y2]="tick.y" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="3 4" />
            }
            <line x1="60" x2="540" [attr.y1]="geometry().baseline" [attr.y2]="geometry().baseline" stroke="currentColor" stroke-opacity="0.35" />
            @if (categoryLabels(); as categories) {
              @for (category of categories; track $index) {
                <text [attr.x]="category.x" y="242" text-anchor="middle" font-size="15" fill="currentColor" aria-hidden="true"
                  class="text-base-content-muted" data-testid="chart-category">{{ category.shortLabel }}<svg:title>{{ category.label }}</svg:title></text>
              }
            } @else {
              <text x="60" y="242" font-size="14" fill="currentColor" class="text-base-content-muted">{{ geometry().firstX }}</text>
              <text x="540" y="242" text-anchor="end" font-size="14" fill="currentColor" class="text-base-content-muted">{{ geometry().lastX }}</text>
            }
            <text x="300" y="270" text-anchor="middle" font-size="14" fill="currentColor" class="text-base-content-muted">{{ node().xLabel?.text }}</text>
            <text x="60" y="20" font-size="14" fill="currentColor" class="text-base-content-muted">{{ node().yLabel?.text }}</text>
            @for (series of geometry().series; track $index) {
              @if (node().kind === 'line-chart') {
                <polyline [attr.points]="series.polyline" fill="none" [attr.class]="seriesStroke($index)" stroke-width="2.5"
                  stroke-linejoin="round" stroke-linecap="round"
                  [attr.stroke-dasharray]="series.dash"><svg:title>{{ series.name }}</svg:title></polyline>
              } @else {
                @let seriesIndex = $index;
                @for (point of series.points; track point.pointIndex) {
                  <rect [attr.x]="point.barX + barInset(point)" [attr.y]="point.barY" [attr.width]="point.barWidth - 2 * barInset(point)"
                    [attr.height]="point.barHeight" [attr.class]="barClass(seriesIndex)" [attr.rx]="barRadius(point)"
                    [attr.fill]="barFill(seriesIndex)" fill-opacity="0.9" stroke-width="1.5"
                    [attr.stroke-dasharray]="series.dash"><svg:title>{{ series.name }}: {{ point.x }}, {{ point.y }}</svg:title></rect>
                }
              }
            }
            @if (showValueLabels()) {
              @for (point of geometry().rows; track point.seriesIndex + ':' + point.pointIndex) {
                <text [attr.x]="point.barX + point.barWidth / 2" [attr.y]="point.y < 0 ? point.barY + point.barHeight + 17 : point.barY - 6"
                  text-anchor="middle" font-size="15" font-weight="600" fill="currentColor" class="text-base-content" aria-hidden="true"
                  data-testid="chart-value">{{ formatValue(point.y) }}</text>
              }
            }
          </svg>
          <!-- One series needs no key: the title already names it. -->
          @if (geometry().series.length > 1) {
          <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content-muted" aria-label="Series">
            @for (series of geometry().series; track $index) {
              <li class="flex items-center gap-2">
                <svg width="36" height="12" aria-hidden="true">
                  @if (node().kind === 'line-chart') {
                    <line x1="0" y1="6" x2="36" y2="6" [attr.class]="seriesStroke($index)"
                      stroke-width="2" [attr.stroke-dasharray]="series.dash" />
                  } @else {
                    <rect x="1" y="1" width="34" height="10" [attr.class]="barClass($index)"
                      [attr.fill]="barFill($index)" stroke-width="2" [attr.stroke-dasharray]="series.dash" />
                  }
                </svg>
                {{ series.name }}
              </li>
            }
          </ul>
          }
        }
        </div>
      }
    </section>
  `,
})
export class DashboardChartComponent {
  private readonly instanceId = nextChartInstance++;
  public readonly node = input.required<ChartNode>();
  public readonly surfaceId = input('');
  public readonly viewState = input<SurfaceComponentViewState>({});
  public readonly selection = input<SurfaceSelection | null>(null);
  public readonly viewStateChange = output<SurfaceComponentViewState>();
  public readonly selectionChange = output<SurfaceSelection>();
  public readonly geometry = computed(() => chartGeometry(this.node().series ?? [], this.node().kind));
  public readonly page = computed(() => pageSlice(this.geometry().rows, this.viewState().page));
  public readonly contentId = `ptah-chart-${this.instanceId}-content`;
  private readonly expandButton = viewChild<ElementRef<HTMLButtonElement>>('expandButton');

  /** Every category label for bar charts and short categorical line charts; null keeps first/last only. */
  public readonly categoryLabels = computed((): readonly ChartCategory[] | null => {
    const geometry = this.geometry();
    const categorical = this.node().kind === 'bar-chart' || geometry.rows.some(point => typeof point.x !== 'number');
    return categorical && geometry.categories.length > 0 && geometry.categories.length <= MAX_CATEGORY_LABELS
      ? geometry.categories : null;
  });
  /** Bar charts label each bar with its value while the bars are wide enough to read. */
  public readonly showValueLabels = computed(() => {
    const rows = this.geometry().rows;
    return this.node().kind === 'bar-chart' && rows.length > 0 && rows.length <= MAX_CATEGORY_LABELS
      && rows[0].barWidth >= MIN_VALUE_LABEL_BAR_WIDTH;
  });

  public seriesStroke(index: number): string { return SERIES_STROKES[index % SERIES_STROKES.length]; }
  public patternId(index: number): string { return `ptah-chart-${this.instanceId}-hatch-${index}`; }
  public barClass(index: number): string {
    return this.seriesStroke(index) + (index === 0 ? ` ${SERIES_FILLS[index % SERIES_FILLS.length]}` : '');
  }
  public barFill(index: number): string | null { return index === 0 ? null : `url(#${this.patternId(index)})`; }
  /** A small gap between neighbouring bars, never more than a sixth of the bar. */
  public barInset(point: ChartPoint): number { return Math.min(4, point.barWidth / 6); }
  /** Rounded bar ends, capped so short bars stay rectangles rather than pills. */
  public barRadius(point: ChartPoint): number { return Math.min(6, point.barWidth / 4, point.barHeight / 2); }
  public formatValue(value: number): string { return compactNumber(value); }

  public focusKey(control: string): string { return `${this.surfaceId()}:${this.node().id}:${control}`; }
  public toggleTable(): void {
    this.viewStateChange.emit({ ...this.viewState(), chartAsTable: !this.viewState().chartAsTable });
  }
  public setPage(page: number): void { this.viewStateChange.emit({ ...this.viewState(), page }); }
  public toggleExpanded(): void { this.viewStateChange.emit({ ...this.viewState(), expanded: !this.viewState().expanded }); }
  /** Escape closes an expanded chart and returns focus to the control that opened it. */
  public collapse(event: Event): void {
    if (!this.viewState().expanded) return;
    event.stopPropagation();
    this.viewStateChange.emit({ ...this.viewState(), expanded: false });
    this.expandButton()?.nativeElement.focus();
  }
  public isSelected(point: ChartPoint): boolean {
    const selection = this.selection();
    return selection?.componentId === this.node().id && selection.target.kind === 'chart-point'
      && selection.target.seriesIndex === point.seriesIndex && selection.target.pointIndex === point.pointIndex;
  }
  public selectPoint(point: ChartPoint): void {
    if (this.node().selectable) this.selectionChange.emit({ componentId: this.node().id,
      target: { kind: 'chart-point', seriesIndex: point.seriesIndex, pointIndex: point.pointIndex } });
  }
}
