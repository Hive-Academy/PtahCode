import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { cliMatrixRows } from './cli-matrix-rows';

/** One chip of the preferred lane order: an installed system CLI or a Ptah CLI instance. */
interface LaneOrderChip {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

/** One order chip (the strip, its measuring copy and "+N"). */
const CHIP =
  'shrink-0 whitespace-nowrap rounded border border-base-300 bg-base-100 px-1.5 py-0.5 font-bold';
/** `--ptah-gap-label` (0.25rem) between the strip's items. */
const ORDER_GAP_PX = 4;
const ORDER_SUBPIXEL_SLACK_PX = 1;

/**
 * The read-only order line of the Lanes card (P-7, design-spec "Card"), under the card header (no card of its own).
 * It shows the preferred agent order as compact chips (the prototype's `1. Codex → 2. Antigravity → …`), then "+N"
 * for the chips that do not fit, and names the whole order for screen readers.
 * - Reads `state.orchestration()` and `state.cliAgents()`; the chips are the CLI matrix's installed rows
 *   (`cliMatrixRows`, same rank rule), so the line and the table always show one order.
 * - It writes nothing. Max concurrent and Re-detect live in the Lanes header and the CLI group header
 *   (`ptah-lanes-max-concurrent`, `ptah-lanes-redetect-button`); the order is edited in the table's Reorder mode (R-3).
 * Class and selector are kept (exported from the barrel).
 */
@Component({
  selector: 'ptah-agent-orchestration-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .policy-host {
      margin-bottom: var(--ptah-space-2);
    }
    .policy-bar,
    .policy-order-group {
      gap: var(--ptah-gap-inline);
    }
    .policy-order-strip {
      gap: var(--ptah-gap-label);
    }
    @container (max-width: 28rem) {
      .policy-order-label {
        display: none;
      }
    }
  `,
  templateUrl: './agent-orchestration-config.component.html',
})
export class AgentOrchestrationConfigComponent {
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly injector = inject(Injector);

  protected readonly loaded = computed(
    () => this.state.orchestration().data !== null,
  );
  /** The installed rows of the CLI matrix, in its order (system CLIs and Ptah CLI instances). */
  protected readonly chips = computed((): readonly LaneOrderChip[] =>
    cliMatrixRows({
      orchestration: this.state.orchestration().data,
      cliAgents: this.state.cliAgents().data,
      cliModels: null,
      cliTest: null,
    }).installed.map((row) => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled,
    })),
  );
  /** The whole order for screen readers and the "+N" title (the chips may clip in a narrow box). */
  protected readonly orderSummary = computed(
    () =>
      'Preferred order: ' +
      this.chips()
        .map(
          (chip, i) => `${i + 1}. ${chip.name}${chip.enabled ? '' : ' (off)'}`,
        )
        .join(', '),
  );
  /** How many whole chips fit the strip (Batch 53.4); all of them until measured (and in a layout-less test DOM). */
  private readonly fittingCount = signal<number | null>(null);
  protected readonly chipClass = CHIP;
  protected readonly shownChips = computed(() => {
    const count = this.fittingCount();
    return count === null ? this.chips() : this.chips().slice(0, count);
  });
  protected readonly hiddenCount = computed(
    () => this.chips().length - this.shownChips().length,
  );
  private readonly orderStrip =
    viewChild<ElementRef<HTMLElement>>('orderStrip');
  private readonly orderMeasure =
    viewChild<ElementRef<HTMLElement>>('orderMeasure');

  constructor() {
    // A changed list recounts the chips that fit.
    effect(() => {
      this.chips();
      this.orderStrip();
      untracked(() =>
        afterNextRender(() => this.measureChips(), { injector: this.injector }),
      );
    });
    // A resize does too. The strip lives under `@if (chips().length)`, so an order that empties and refills makes a new
    // element: the observer follows the current strip, and the previous one is disconnected (on re-run and on destroy).
    effect((onCleanup) => {
      const strip = this.orderStrip()?.nativeElement;
      if (!strip || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measureChips());
      observer.observe(strip);
      onCleanup(() => observer.disconnect());
    });
  }

  /** Whole chips that fit the strip's width; when not all fit, room is kept for "→ +N". */
  private measureChips(): void {
    const strip = this.orderStrip()?.nativeElement,
      measure = this.orderMeasure()?.nativeElement;
    if (!strip || !measure) return;
    // Fractional layout widths: offsetWidth/clientWidth round to whole pixels, and summed over the chips that rounding
    // put the last whole chip a fraction of a pixel past the strip. (A layout-less DOM reports 0 rects; it falls back
    // to the rounded values.) One pixel of slack covers what is left.
    const exact = (node: HTMLElement | null, rounded: number) =>
      node?.getBoundingClientRect().width || rounded;
    const width = exact(strip, strip.clientWidth);
    const available = width - ORDER_SUBPIXEL_SLACK_PX;
    const widths = Array.from(
      measure.querySelectorAll<HTMLElement>('[data-measure="chip"]'),
    ).map((node) => exact(node, node.offsetWidth));
    const arrowNode = measure.querySelector<HTMLElement>(
      '[data-measure="arrow"]',
    );
    const moreNode = measure.querySelector<HTMLElement>(
      '[data-measure="more"]',
    );
    const arrow = exact(arrowNode, arrowNode?.offsetWidth ?? 0);
    const more = exact(moreNode, moreNode?.offsetWidth ?? 0);
    if (!width || widths.some((width) => width === 0)) {
      this.fittingCount.set(null);
      return;
    }
    const step = (i: number) =>
      widths[i] + (i > 0 ? arrow + 2 * ORDER_GAP_PX : 0);
    const total = widths.reduce((sum, _width, i) => sum + step(i), 0);
    if (total <= available) {
      this.fittingCount.set(null);
      return;
    }
    let used = 0,
      count = 0;
    const tail = (shown: number) =>
      (shown > 0 ? arrow + 2 * ORDER_GAP_PX : 0) + more;
    while (
      count < widths.length &&
      used + step(count) + tail(count + 1) <= available
    )
      used += step(count++);
    this.fittingCount.set(count);
  }
}
