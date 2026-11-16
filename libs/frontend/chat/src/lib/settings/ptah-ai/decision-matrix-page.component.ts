import {
  ChangeDetectionStrategy,
  Component,
  computed,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, RefreshCw } from 'lucide-angular';
import {
  OUTCOME_TASK_KINDS,
  type AgentGetCapabilityMatrixResult,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInstrumentBandComponent,
  PtahSelectDirective,
  PtahToolbarComponent,
  type PtahInstrumentBandSegment,
} from '@ptah-extension/ui';
import { CapabilityMatrixSettingComponent } from './capability-matrix-setting.component';

@Component({
  selector: 'ptah-decision-matrix-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CapabilityMatrixSettingComponent,
    LucideAngularModule,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInstrumentBandComponent,
    PtahSelectDirective,
    PtahToolbarComponent,
  ],
  template: `
    <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)]">
      <button
        ptahButton
        variant="ghost"
        type="button"
        (click)="back.emit()"
        aria-label="Context management"
      >
        Context management
      </button>
      <span class="text-xs text-base-content-muted">{{ ratedMeta() }}</span>
      <button
        ptahIconButton
        type="button"
        label="Refresh ratings"
        [busy]="busy()"
        (click)="refresh()"
      >
        <lucide-angular [img]="RefreshIcon" aria-hidden="true" />
      </button>
    </div>
    <ptah-instrument-band
      [segments]="segments()"
      [loading]="busy()"
      ariaLabel="Decision matrix overview"
    />
    <ptah-toolbar
      [query]="search()"
      placeholder="Search models"
      (queryChange)="search.set($event)"
    >
      <select
        sort
        ptahSelect
        aria-label="Sort by task kind"
        [value]="sortKind()"
        (change)="setSort($event)"
      >
        @for (kind of tasks; track kind) {
          <option [value]="kind">{{ labels[kind] }}</option>
        }
      </select>
      <select
        filters
        ptahSelect
        aria-label="Filter by family"
        [value]="family()"
        (change)="setFamily($event)"
      >
        <option value="">All families</option>
        @for (name of families(); track name) {
          <option [value]="name">{{ name }}</option>
        }
      </select>
      <button
        filters
        ptahButton
        variant="ghost"
        size="xs"
        type="button"
        (click)="descending.set(!descending())"
        [attr.aria-pressed]="descending()"
        [attr.aria-label]="
          descending()
            ? 'Sort descending; switch to ascending'
            : 'Sort ascending; switch to descending'
        "
      >
        {{ descending() ? 'Descending' : 'Ascending' }}
      </button>
      <span filters class="text-xs tabular-nums text-base-content-muted"
        >{{ visibleCount() }} results</span
      >
    </ptah-toolbar>
    <ptah-capability-matrix-setting
      [headingLevel]="2"
      [familyFilter]="family()"
      [modelSearch]="search()"
      [sortKind]="sortKind()"
      [sortDescending]="descending()"
      (resultChange)="onResult($event)"
      (loadingChange)="busy.set($event)"
      (visibleCountChange)="visibleCount.set($event)"
    />
  `,
})
export class DecisionMatrixPageComponent {
  readonly back = output<void>();
  protected readonly RefreshIcon = RefreshCw;
  private readonly matrix = viewChild(CapabilityMatrixSettingComponent);
  protected readonly tasks = OUTCOME_TASK_KINDS;
  protected readonly labels: Record<OutcomeTaskKind, string> = {
    plan: 'Plan',
    implement: 'Implement',
    review: 'Review',
    research: 'Research',
    tests: 'Tests',
    docs: 'Docs',
  };
  protected readonly family = signal('');
  protected readonly search = signal('');
  protected readonly sortKind = signal<OutcomeTaskKind>('plan');
  protected readonly descending = signal(true);
  protected readonly busy = signal(true);
  protected readonly result = signal<AgentGetCapabilityMatrixResult | null>(
    null,
  );
  protected readonly families = computed(() => [
    ...new Set((this.result()?.profiles ?? []).map((p) => p.family)),
  ]);
  protected readonly visibleCount = signal(0);
  protected readonly latest = computed(() => {
    let latest: string | null = null;
    for (const profile of this.result()?.profiles ?? [])
      for (const kind of OUTCOME_TASK_KINDS) {
        const cell = profile.cells[kind];
        if (cell.kind === 'value' && (!latest || cell.asOf > latest))
          latest = cell.asOf;
      }
    return latest;
  });
  protected readonly ratedMeta = computed(() => {
    const latest = this.latest();
    return latest ? `Rated ${this.relative(latest)}` : 'No ratings yet';
  });
  protected readonly segments = computed<readonly PtahInstrumentBandSegment[]>(
    () => {
      const profiles = this.result()?.profiles ?? [];
      const stale = profiles.reduce(
        (count, p) =>
          count +
          OUTCOME_TASK_KINDS.filter(
            (kind) => p.cells[kind].kind === 'value' && p.cells[kind].stale,
          ).length,
        0,
      );
      const latest = this.latest();
      return [
        {
          id: 'families',
          label: 'Families',
          value: String(this.families().length),
          tone: 'info',
        },
        {
          id: 'models',
          label: 'Models rated',
          value: String(
            new Set(
              profiles
                .filter(
                  (p) =>
                    p.model !== '*' &&
                    OUTCOME_TASK_KINDS.some(
                      (kind) => p.cells[kind].kind !== 'unknown',
                    ),
                )
                .map((p) => p.model),
            ).size,
          ),
          tone: 'info',
        },
        {
          id: 'last',
          label: 'Last rating',
          value: latest ? this.relative(latest) : 'None',
          meta: latest ?? undefined,
          tone: 'info',
        },
        {
          id: 'stale',
          label: 'Stale ratings',
          value: String(stale),
          tone: stale > 0 ? 'warn' : 'ok',
        },
      ];
    },
  );
  protected onResult(result: AgentGetCapabilityMatrixResult | null): void {
    this.result.set(result);
  }
  protected refresh(): void {
    if (this.busy()) return;
    this.busy.set(true);
    void this.matrix()?.reload();
  }
  protected setFamily(event: Event): void {
    if (event.target instanceof HTMLSelectElement)
      this.family.set(event.target.value);
  }
  protected setSort(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const value = event.target.value;
    const kind = OUTCOME_TASK_KINDS.find((k) => k === value);
    if (kind) this.sortKind.set(kind);
  }
  /** "today", "1 day ago" or "N days ago"; a future or unreadable date reads as today. */
  private relative(date: string): string {
    const elapsed = Date.now() - Date.parse(date);
    const days = Number.isFinite(elapsed)
      ? Math.max(0, Math.floor(elapsed / 86_400_000))
      : 0;
    if (days === 0) return 'today';
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
}
