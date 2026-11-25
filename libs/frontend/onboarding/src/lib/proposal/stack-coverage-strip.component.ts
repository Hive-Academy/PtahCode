import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  PtahButtonDirective,
  PtahSkeletonComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import {
  coverageSummaryText,
  coverageVerdictLabel,
  type StackCoverageItem,
} from './stack-coverage';

const FALLBACK_MAX_CHIPS = 12;
const FALLBACK_COLLAPSED_CHIPS = 11;
const LINE_TOLERANCE_PX = 4;

@Component({
  selector: 'ptah-stack-coverage-strip',
  standalone: true,
  imports: [PtahButtonDirective, PtahSkeletonComponent, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stack-coverage-strip.component.html',
})
export class StackCoverageStripComponent {
  public readonly items = input<StackCoverageItem[]>([]);
  public readonly activeItem = input<string | null>(null);
  public readonly loading = input(false);
  public readonly filterChanged = output<string | null>();

  protected readonly coveredCount = computed(
    () => this.items().filter((item) => item.state === 'covered').length,
  );

  private readonly itemKeySignature = computed(() =>
    JSON.stringify(this.items().map((item) => this.itemKey(item))),
  );
  private readonly expandedState = linkedSignal({
    source: this.itemKeySignature,
    computation: () => false,
  });
  protected readonly expanded = this.expandedState.asReadonly();

  /** Measured chip limit for at most 2 lines; null falls back to 12-chip parity rule. */
  private readonly measuredLimitState = signal<number | null>(null);
  private readonly measuringAllState = signal(false);

  protected readonly visibleItems = computed(() => {
    const list = this.items();
    if (this.expanded() || this.measuringAllState()) {
      return list;
    }
    const measured = this.measuredLimitState();
    if (measured !== null) {
      return list.slice(0, measured);
    }
    return list.length <= FALLBACK_MAX_CHIPS
      ? list
      : list.slice(0, FALLBACK_COLLAPSED_CHIPS);
  });

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.items().length - this.visibleItems().length),
  );

  protected readonly showMoreVisible = computed(
    () =>
      !this.expanded() && !this.measuringAllState() && this.hiddenCount() > 0,
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chipRow = viewChild<ElementRef<HTMLElement>>('chipRow');

  private observer: ResizeObserver | null = null;
  private observedElement: HTMLElement | null = null;
  private lastMeasuredWidth = -1;
  private measureGeneration = 0;

  protected readonly skeletons = [1, 2, 3, 4, 5, 6];

  public constructor() {
    effect(() => {
      this.items();
      untracked(() => {
        this.measuredLimitState.set(null);
        this.measuringAllState.set(false);
        this.lastMeasuredWidth = -1;
        this.scheduleMeasure();
      });
    });

    effect(() => {
      const row = this.chipRow()?.nativeElement ?? null;
      untracked(() => this.attachObserver(row));
    });

    this.destroyRef.onDestroy(() => {
      this.measureGeneration++;
      this.disconnectObserver();
    });
  }

  private attachObserver(row: HTMLElement | null): void {
    if (row === this.observedElement) return;
    this.disconnectObserver();
    if (!row) return;
    this.observedElement = row;
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => {
        if (this.destroyRef.destroyed || this.expanded()) return;
        const width =
          entries[0]?.contentRect?.width ?? row.getBoundingClientRect().width;
        if (width <= 0) return;
        if (
          this.lastMeasuredWidth >= 0 &&
          Math.abs(width - this.lastMeasuredWidth) < 1
        ) {
          return;
        }
        this.lastMeasuredWidth = width;
        this.measuredLimitState.set(null);
        this.measuringAllState.set(true);
        this.scheduleMeasure();
      });
      this.observer.observe(row);
    }
    this.scheduleMeasure();
  }

  private disconnectObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedElement = null;
  }

  private scheduleMeasure(checkOverflow = false): void {
    const generation = ++this.measureGeneration;
    afterNextRender(
      () => {
        if (this.destroyRef.destroyed || generation !== this.measureGeneration) {
          return;
        }
        this.measureTwoLines(checkOverflow);
      },
      { injector: this.injector },
    );
  }

  private measureTwoLines(checkOverflow: boolean): void {
    if (this.expanded() || this.loading()) {
      this.measuringAllState.set(false);
      return;
    }
    const row = this.chipRow()?.nativeElement;
    if (!row) return;
    const totalItems = this.items().length;
    if (totalItems === 0) {
      this.measuringAllState.set(false);
      this.measuredLimitState.set(0);
      return;
    }

    const allButton = row.querySelector<HTMLElement>('[data-strip-all]');
    const chipButtons = Array.from(
      row.querySelectorAll<HTMLElement>('[data-strip-chip]'),
    );
    const rowRect = row.getBoundingClientRect();
    const chipRects = chipButtons.map((button) =>
      button.getBoundingClientRect(),
    );
    const hasLayout =
      rowRect.width > 0 ||
      chipRects.some(
        (rect) => rect.width > 0 || rect.height > 0 || rect.top > 0,
      );
    if (!hasLayout) {
      this.measuringAllState.set(false);
      return;
    }

    if (rowRect.width > 0) {
      this.lastMeasuredWidth = rowRect.width;
    }

    const lineTops: number[] = [];
    const resolveLineIndex = (top: number): number => {
      const existing = lineTops.findIndex(
        (lineTop) => Math.abs(lineTop - top) <= LINE_TOLERANCE_PX,
      );
      if (existing !== -1) return existing;
      lineTops.push(top);
      lineTops.sort((a, b) => a - b);
      return lineTops.findIndex(
        (lineTop) => Math.abs(lineTop - top) <= LINE_TOLERANCE_PX,
      );
    };

    const allRect = allButton?.getBoundingClientRect();
    if (
      allRect &&
      (allRect.width > 0 || allRect.height > 0 || allRect.top > 0)
    ) {
      resolveLineIndex(allRect.top);
    }

    const chipLineIndices = chipRects.map((rect) => resolveLineIndex(rect.top));
    let fitCount = 0;
    for (let index = 0; index < chipLineIndices.length; index++) {
      if (chipLineIndices[index] < 2) {
        fitCount = index + 1;
      } else {
        break;
      }
    }

    if (!checkOverflow) {
      if (fitCount === chipButtons.length && fitCount < totalItems) {
        this.measuringAllState.set(true);
        this.scheduleMeasure();
        return;
      }
      this.measuringAllState.set(false);
      this.measuredLimitState.set(fitCount);
      if (fitCount < totalItems) {
        // Render the actual overflow label before measuring the room it needs.
        this.scheduleMeasure(true);
      }
      return;
    }

    const showMoreRect = row
      .querySelector<HTMLElement>('[data-strip-show-more]')
      ?.getBoundingClientRect();
    if (showMoreRect && resolveLineIndex(showMoreRect.top) >= 2) {
      const parsedGap = Number.parseFloat(getComputedStyle(row).columnGap);
      const gapPx = Number.isFinite(parsedGap) ? parsedGap : 0;
      // The control can always start the second line after a first-line chip.
      while (
        fitCount > 0 &&
        chipLineIndices[fitCount - 1] === 1 &&
        chipRects[fitCount - 1].right + gapPx + showMoreRect.width > rowRect.right
      ) {
        fitCount--;
      }
    }

    if (fitCount < chipButtons.length) {
      this.measuredLimitState.set(fitCount);
      // Trimming changes the number in the label and can widen the control.
      this.scheduleMeasure(true);
    }
  }

  protected expand(): void {
    const firstNewIndex = this.visibleItems().length;
    const firstNew = this.items()[firstNewIndex];
    this.measuringAllState.set(false);
    this.expandedState.set(true);
    afterNextRender(
      () => {
        if (firstNew) {
          this.host.nativeElement
            .querySelector<HTMLButtonElement>(
              `button[aria-describedby="${this.descriptionId(firstNew)}"]`,
            )
            ?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  protected itemKey(item: StackCoverageItem): string {
    return item.itemId ?? `${item.kind}:${item.name}`;
  }

  protected descriptionId(item: StackCoverageItem): string {
    return `stack-evidence-${encodeURIComponent(this.itemKey(item))}`;
  }

  protected status(
    item: StackCoverageItem,
  ): 'completed' | 'pending' | 'warning' {
    return item.state === 'covered'
      ? 'completed'
      : item.state === 'available'
        ? 'pending'
        : 'warning';
  }

  protected summary(item: StackCoverageItem): string {
    return coverageSummaryText(item);
  }

  protected verdictLabel(item: StackCoverageItem): string | null {
    return item.verdict ? coverageVerdictLabel(item.verdict) : null;
  }

  protected accessibleName(item: StackCoverageItem): string {
    const verdict = this.verdictLabel(item);
    const coverageText =
      item.state === 'covered' && item.originalSearchFailed
        ? 'Covered - original search failed'
        : item.state === 'covered'
          ? `covered by ${item.selectedCount} selected ${item.selectedCount === 1 ? 'skill' : 'skills'}`
          : this.summary(item);
    if (verdict) {
      return `${item.name}, ${item.kind}. Registry: ${coverageText}. Verdict: ${verdict}`;
    }
    return `${item.name}, ${coverageText}`;
  }
}
