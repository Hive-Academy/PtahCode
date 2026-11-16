import { DOCUMENT } from '@angular/common';
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

export type PtahInstrumentBandTone = 'ok' | 'warn' | 'error' | 'idle' | 'info';

export interface PtahInstrumentBandSegment {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly meta?: string;
  readonly tone: PtahInstrumentBandTone;
  readonly targetId?: string;
}

const BAR_CLASSES: Record<PtahInstrumentBandTone, string> = {
  ok: 'bg-state-done',
  warn: 'bg-state-need',
  error: 'bg-state-err',
  idle: 'bg-state-idle',
  info: 'bg-state-run',
};

/**
 * A compact status summary: one segment per section (state bar, label, value, meta).
 * Each segment is a native button, so Enter and Space activate it. A segment with a
 * `targetId` moves focus to that element.
 */
@Component({
  selector: 'ptah-instrument-band',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'instrument-band',
    class: 'block min-w-0 [container-type:inline-size]',
  },
  template: `
    <nav [attr.aria-label]="ariaLabel()" class="border-b border-surface-border bg-base-100 py-ptah-controls">
      <ol class="grid gap-ptah-label" [class]="columnClasses()" [style.--ptah-band-columns]="segments().length">
        @for (segment of segments(); track segment.id) {
          <li class="min-w-0">
            <button
              type="button"
              class="grid w-full min-w-0 gap-ptah-label rounded-ptah-control border border-transparent px-ptah-controls py-ptah-label text-left text-base-content hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              [attr.aria-label]="accessibleName(segment)"
              (click)="select(segment)"
            >
              <span aria-hidden="true" class="mb-ptah-label h-[3px] rounded-full" [class]="barClass(segment)"></span>
              <span aria-hidden="true" class="truncate text-xs text-base-content-muted">{{ segment.label }}</span>
              @if (loading()) {
                <span aria-hidden="true" class="skeleton h-ptah-controls w-3/4"></span>
                <span aria-hidden="true" class="skeleton h-ptah-label w-1/2"></span>
              } @else {
                <span aria-hidden="true" class="truncate text-sm font-semibold leading-5">{{ segment.value }}</span>
                <span aria-hidden="true" class="truncate text-xs text-base-content-muted" [attr.title]="segment.meta ?? null">{{ segment.meta }}</span>
              }
            </button>
          </li>
        }
      </ol>
    </nav>
  `,
})
export class PtahInstrumentBandComponent {
  private readonly document = inject(DOCUMENT);

  readonly segments = input<readonly PtahInstrumentBandSegment[]>([]);
  readonly loading = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input('Section overview');
  readonly segmentSelect = output<string>();

  /** Equal rows below 760 px (4 = 2x2, 6 = 3x2, no lone segment); one row above. */
  protected readonly columnClasses = computed(() => {
    const count = this.segments().length;
    const narrow = count === 6 ? 'grid-cols-3' : count > 0 && count % 2 === 0 ? 'grid-cols-2' : 'grid-cols-1';
    return `${narrow} [@container(min-width:760px)]:grid-cols-[repeat(var(--ptah-band-columns),minmax(0,1fr))]`;
  });

  protected barClass(segment: PtahInstrumentBandSegment): string {
    return BAR_CLASSES[this.loading() ? 'idle' : segment.tone];
  }

  protected accessibleName(segment: PtahInstrumentBandSegment): string {
    return this.loading() ? `${segment.label} Loading` : [segment.label, segment.value, segment.meta].filter(Boolean).join(' ');
  }

  protected select(segment: PtahInstrumentBandSegment): void {
    this.segmentSelect.emit(segment.id);
    if (!segment.targetId) return;
    const target = this.document.getElementById(segment.targetId);
    if (!target) return;
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
    target.focus();
  }
}
