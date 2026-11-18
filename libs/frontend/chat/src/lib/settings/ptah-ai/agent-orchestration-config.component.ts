import { PtahFieldComponent } from '@ptah-extension/ui';
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
import { LucideAngularModule, Pencil, RefreshCw, X } from 'lucide-angular';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInputDirective,
} from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { savePreferredAgentOrder as saveSharedPreferredAgentOrder } from './preferred-agent-order-save';
import { cliMatrixRows } from './cli-matrix-rows';
import {
  LaneOrderListComponent,
  type LaneOrderChip,
  type LaneOrderMove,
} from './lane-order-list.component';

/** Bounds of the max-concurrent field; the runtime enforces the same range (`MAX_CONCURRENT_AGENTS`). */
const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 100;
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
/** One order chip (the strip, its measuring copy and "+N"). */
const CHIP =
  'shrink-0 whitespace-nowrap rounded border border-base-300 bg-base-100 px-1.5 py-0.5 font-bold';
/** `gap-1` between the strip's items. */
const ORDER_GAP_PX = 4;
const ORDER_SUBPIXEL_SLACK_PX = 1;
/** Orchestration policy lives in the user settings (plan §3 rows 891-892), like the CLI matrix's writes. */
const SAVE_SCOPE = 'global';
const DETECT_FAILED =
  'Could not re-detect CLI agents. Your saved settings have not changed.';

/**
 * Agent Orchestration policy toolbar (plan :702-709, design-spec §1.2 item 2, prototype `orchestration.html` :107-147),
 * rendered inside the CLI matrix card above its table (no card of its own).
 * One row: max concurrent agents (number input 1-100), the preferred agent order as compact read-only chips
 * (the prototype's `1. Codex → 2. Antigravity → …`), and Re-detect CLIs.
 * - The chip group opens the order popover (the "popover for short choices" save model). Its rows are
 *   `ptah-lane-order-list` (drag and drop plus Move up/down buttons); each requested move saves here.
 * - Reads `state.orchestration()` and `state.cliAgents()`; the chips are the CLI matrix's installed rows
 *   (`cliMatrixRows`, same rank rule), so the bar and the matrix always show one order.
 * - Every write is `state.saveSettings({orchestration:{…}})` through `SettingsSaveFeedbackService` (toast, Undo, D15:
 *   the shown values are the read-back ones). Re-detect is `state.redetectClis()`; its result is announced through the page toast.
 * Since Batch 33 the old body (system CLI cards, the Copilot toggle now in the matrix, the "Manage … in Providers"
 * links, RUX-9) and its private `agent:*` calls are gone. Class and selector are kept (exported from the barrel).
 */
@Component({
  selector: 'ptah-agent-orchestration-config',
  standalone: true,
  imports: [
    PtahFieldComponent,
    LaneOrderListComponent,
    LucideAngularModule,
    NativePopoverComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .policy-bar {
      flex-wrap: nowrap;
    }
    .policy-bar > div:first-child {
      flex: 0 1 12rem;
      min-width: 0;
    }
    .policy-bar ptah-field {
      width: 100%;
    }
    .policy-trailing {
      display: flex;
      flex: 1 1 0;
      min-width: 0;
      align-items: center;
      gap: var(--ptah-gap-inline);
    }
    @container (max-width: 28rem) {
      .policy-order-label {
        display: none;
      }
    }
    @container (max-width: 34rem) {
      .policy-bar {
        gap: var(--ptah-gap-inline);
      }
      .policy-max-input {
        width: 3.5rem;
      }
      .policy-redetect {
        width: var(--ptah-control-h-sm);
        min-width: var(--ptah-control-h-sm);
        padding-inline: 0 !important;
      }
      .policy-redetect-label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    }
  `,
  templateUrl: './agent-orchestration-config.component.html',
})
export class AgentOrchestrationConfigComponent {
  protected readonly RefreshIcon = RefreshCw;
  protected readonly EditIcon = Pencil;
  protected readonly CloseIcon = X;
  protected readonly focusRing = FOCUS;

  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The saved value, or `null` before the first read. */
  protected readonly maxConcurrent = computed(
    () => this.state.orchestration().data?.maxConcurrentAgents ?? null,
  );
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
  /** The whole order for the trigger's accessible name (the chips may clip in a narrow box). */
  protected readonly orderSummary = computed(
    () =>
      'Preferred order: ' +
      this.chips()
        .map(
          (chip, i) => `${i + 1}. ${chip.name}${chip.enabled ? '' : ' (off)'}`,
        )
        .join(', '),
  );
  /** The slider stays enabled while a save runs (disabling it would drop its focus); the save is refused then (D3). */
  protected readonly canWrite = computed(
    () =>
      this.state.scopes().status === 'ready' &&
      this.state.reviewContext() !== null,
  );
  /** Both lists must be read: an order written from one of them would drop the other's ids. No move while saving. */
  protected readonly canReorder = computed(
    () =>
      this.canWrite() &&
      !this.feedback.saving() &&
      this.state.orchestration().data !== null &&
      this.state.cliAgents().data !== null,
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
  private readonly orderList = viewChild(LaneOrderListComponent);

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

  protected readonly orderOpen = signal(false);

  private readonly redetecting = signal(false);
  protected readonly detecting = computed(
    () => this.redetecting() || this.state.cliDetection().status === 'loading',
  );

  protected toggleOrder(): void {
    this.orderOpen.update((open) => !open);
  }

  /** True while the closed popover returns focus to the trigger: no tooltip then. */
  protected readonly orderFocusReturning = signal(false);

  /** Esc, the backdrop and Close end here; the popover returns focus to the trigger. */
  protected closeOrder(): void {
    this.orderFocusReturning.set(true);
    this.orderOpen.set(false);
    // The popover restores focus in the next change detection; a later Tab shows the tooltip.
    setTimeout(() => this.orderFocusReturning.set(false));
  }

  /** Focus the dialog title without opening a move-button tooltip. */
  protected focusOrderTitle(): void {
    this.element.nativeElement
      .querySelector<HTMLElement>('#policy-order-title')
      ?.focus();
  }

  /**
   * Saves on commit (blur / Enter / spinner). A fractional or out-of-range number is clamped to an integer in
   * 1..MAX_CONCURRENT; an empty or non-numeric entry keeps the previous value. The field then shows the read-back value.
   */
  protected async saveMaxConcurrent(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const raw = input.valueAsNumber;
    const previous = this.state.orchestration().data?.maxConcurrentAgents;
    const context = this.state.reviewContext();
    try {
      if (!context || previous === undefined || !Number.isFinite(raw)) return;
      const value = Math.min(
        MAX_CONCURRENT,
        Math.max(MIN_CONCURRENT, Math.round(raw)),
      );
      if (value === previous) return;
      await this.feedback.save({
        label: 'max concurrent agents',
        scope: SAVE_SCOPE,
        write: () =>
          this.state.saveSettings(
            { orchestration: { maxConcurrentAgents: value } },
            context,
          ),
        undo: () =>
          this.state.saveSettings(
            { orchestration: { maxConcurrentAgents: previous } },
            context,
          ),
      });
    } finally {
      // The binding may not change (the same saved value), so the field is set to the read-back value directly.
      const saved = this.state.orchestration().data?.maxConcurrentAgents;
      if (saved !== undefined) input.value = String(saved);
    }
  }

  async redetectClis(): Promise<void> {
    if (this.detecting()) return;
    this.redetecting.set(true);
    let ok = false;
    try {
      ok = await this.state.redetectClis();
    } catch (error: unknown) {
      // degradation-audit: reported - the toast says re-detect failed.
      // The state settles its own read failures; a throw means the command itself broke.
      void error;
    } finally {
      this.redetecting.set(false);
    }
    if (ok) this.feedback.announce('CLI agents re-detected.', 'status');
    else this.feedback.announce(DETECT_FAILED, 'alert');
  }

  /**
   * One move = one write of the whole order, with Undo. The rows show the read-back order (D15); when this move's own
   * write did not save (refused, failed or threw), the page toast from `save()` says so with the details.
   */
  protected async savePreferredOrder({
    order,
    movedId,
    direction,
  }: LaneOrderMove): Promise<void> {
    if (!this.canReorder()) return;
    await saveSharedPreferredAgentOrder(this.state, this.feedback, order);
    // A popover closed while the save ran has no list: focus stays where Esc put it.
    this.orderList()?.settled(movedId, direction);
  }
}
