import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import {
  OUTCOME_TASK_KINDS,
  type AgentCapabilityMatrixProfile,
  type AgentGetCapabilityMatrixResult,
  type AgentGetCapabilityMatrixParams,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahTableBarCellDirective,
  PtahDetailCellDirective,
  PtahDetailRowDirective,
  PtahTableGroupHeaderDirective,
  PtahTableGroupRowDirective,
  PtahRowExpanderComponent,
  PtahTableStickyHeaderDirective,
  PtahTableComponent,
  PtahTableGroupTitleComponent,
  PtahTableScoreComponent,
} from '@ptah-extension/ui';
import {
  SettingsSectionReadyDirective,
  SettingsSectionStateComponent,
} from '../shared/settings-section-state.component';
import { RoutingDisplayNamesStore } from './routing-display-names.store';

const NO_PARAMS: AgentGetCapabilityMatrixParams = {};
const LABELS: Record<OutcomeTaskKind, string> = {
  plan: 'Plan',
  implement: 'Implement',
  review: 'Review',
  research: 'Research',
  tests: 'Tests',
  docs: 'Docs',
};

@Component({
  selector: 'ptah-capability-matrix-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NativePopoverComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahTableBarCellDirective,
    PtahDetailCellDirective,
    PtahDetailRowDirective,
    PtahTableGroupHeaderDirective,
    PtahTableGroupRowDirective,
    PtahRowExpanderComponent,
    PtahTableStickyHeaderDirective,
    PtahTableComponent,
    PtahTableGroupTitleComponent,
    PtahTableScoreComponent,
    SettingsSectionReadyDirective,
    SettingsSectionStateComponent,
  ],
  template: `
    <section
      data-glass-surface="content"
      aria-labelledby="capability-matrix-heading"
      data-testid="capability-matrix-setting"
    >
      @if (headingLevel() === 2) {
        <h2 id="capability-matrix-heading" class="sr-only">
          Capability matrix
        </h2>
      } @else {
        <h3 id="capability-matrix-heading" class="sr-only">
          Capability matrix
        </h3>
      }
      @if (load() !== 'ready') {
        <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
      }
      @if (result()?.lastPicksUnavailable) {
        <p role="note" class="text-xs text-base-content-muted">
          Recent picks are unavailable.
        </p>
      }
      <div
        [attr.data-testid]="
          load() === 'loading'
            ? 'capability-matrix-loading'
            : load() === 'empty'
              ? 'capability-matrix-empty'
              : null
        "
      >
        <ptah-settings-section-state
          [state]="load()"
          errorText="The capability matrix could not be read."
          errorTestId="capability-matrix-error"
          retryTestId="capability-matrix-retry"
          emptyTitle="No ratings yet."
          emptyBody="Ratings appear after lanes finish tasks."
          (retry)="reload()"
        >
          <ng-template ptahSectionReady>
            <ptah-table
              #matrix
              label="Capability matrix"
              density="compact"
              [collapseBelow]="780"
              data-testid="capability-matrix-table"
            >
              <thead>
                <tr>
                  <th scope="col" ptahStickyHeader>Model</th>
                  @for (kind of tasks; track kind) {
                    <th
                      scope="col"
                      [hidden]="matrix.collapsed() && kind !== sortKind()"
                      [attr.aria-sort]="
                        kind === sortKind()
                          ? sortDescending()
                            ? 'descending'
                            : 'ascending'
                          : null
                      "
                    >
                      {{ labels[kind] }}
                    </th>
                  }
                  @if (matrix.collapsed()) {
                    <th scope="col">Details</th>
                  }
                </tr>
              </thead>
              @for (family of families(); track family) {
                <tbody [id]="'family-' + family">
                  <tr ptahGroupRow>
                    <th ptahGroupHeader [columns]="matrix.collapsed() ? 3 : 7">
                      <ptah-table-group-title
                        [name]="names.executor(family).text"
                        ><span ptahGroupCount ptahBadge count>{{
                          modelCount(family)
                        }}</span></ptah-table-group-title
                      >
                      @if (
                        family.startsWith('pc-') && names.executor(family).raw;
                        as raw
                      ) {
                        <span class="sr-only"
                          >Executor ID details: {{ raw }}</span
                        >
                      }
                    </th>
                  </tr>
                  @for (
                    profile of familyProfiles(family);
                    track profile.model
                  ) {
                    <tr [class.bg-base-content/5]="profile.model === '*'">
                      <th
                        scope="row"
                        ptahStickyHeader
                        class="font-mono"
                        [class.font-semibold]="profile.model === '*'"
                      >
                        {{
                          profile.model === '*'
                            ? 'Family default'
                            : names.model(profile.model).text
                        }}
                        @if (
                          profile.model !== '*' &&
                            names.model(profile.model).raw;
                          as raw
                        ) {
                          <span class="sr-only">Raw model ID {{ raw }}</span>
                        }
                      </th>
                      @for (kind of tasks; track kind) {
                        @let cell = profile.cells[kind];
                        <td
                          ptahBarCell
                          [hidden]="matrix.collapsed() && kind !== sortKind()"
                          [attr.data-testid]="
                            'matrix-row-' +
                            family +
                            '-' +
                            profile.model +
                            '-' +
                            kind
                          "
                        >
                          <ptah-table-score
                            [label]="
                              labels[kind] +
                              ' for ' +
                              displayModel(profile.model)
                            "
                            [score]="cell.kind === 'value' ? cell.score : null"
                            [stale]="cell.kind === 'value' && cell.stale"
                          />
                          <!-- A hidden (collapsed) cell has no popover: its detail row owns the one popover per rating. -->
                          @if (
                            cell.kind === 'value' &&
                            (!matrix.collapsed() || kind === sortKind())
                          ) {
                            <ptah-native-popover
                              [isOpen]="
                                openCell() ===
                                rowId(family, profile.model, kind)
                              "
                              [hasBackdrop]="true"
                              [keepInViewport]="true"
                              (closed)="openCell.set(null)"
                            >
                              <button
                                trigger
                                ptahButton
                                variant="ghost"
                                size="xs"
                                type="button"
                                [attr.aria-label]="
                                  'Details for ' +
                                  labels[kind] +
                                  ' for ' +
                                  displayModel(profile.model)
                                "
                                [attr.aria-expanded]="
                                  openCell() ===
                                  rowId(family, profile.model, kind)
                                "
                                [attr.aria-controls]="
                                  'detail-' + rowId(family, profile.model, kind)
                                "
                                (click)="
                                  toggleCell(family, profile.model, kind)
                                "
                              >
                                Details
                              </button>
                              <div
                                content
                                [id]="
                                  'detail-' + rowId(family, profile.model, kind)
                                "
                                class="max-w-64 bg-base-100 text-xs shadow-lg"
                              >
                                <p>Source: {{ cell.source }}</p>
                                <p>
                                  Source reference:
                                  {{ cell.sourceRef ?? 'None' }}
                                </p>
                                <p>As of {{ cell.asOf }}</p>
                                <p>
                                  Samples:
                                  {{ cell.sampleCount ?? 'Not counted' }}
                                </p>
                                <p>Stale: {{ cell.stale ? 'Yes' : 'No' }}</p>
                                @if (cell.note) {
                                  <p>{{ cell.note }}</p>
                                }
                              </div>
                            </ptah-native-popover>
                          }
                        </td>
                      }
                      @if (matrix.collapsed()) {
                        <td>
                          <ptah-table-row-expander
                            label="Show other ratings"
                            [controls]="
                              rowId(family, profile.model, 'plan') + '-more'
                            "
                            [expanded]="
                              expandedRows().has(
                                rowId(family, profile.model, 'plan')
                              )
                            "
                            (expandedChange)="
                              setExpanded(
                                rowId(family, profile.model, 'plan'),
                                $event
                              )
                            "
                          />
                        </td>
                      }
                    </tr>
                    @if (matrix.collapsed()) {
                      <tr
                        [ptahDetailRow]="
                          expandedRows().has(
                            rowId(family, profile.model, 'plan')
                          )
                        "
                        [id]="rowId(family, profile.model, 'plan') + '-more'"
                      >
                        <td ptahDetailCell [colspan]="3">
                          <dl>
                            @for (kind of tasks; track kind) {
                              @if (kind !== sortKind()) {
                                <dt>{{ labels[kind] }}</dt>
                                <dd>
                                  <ptah-table-score
                                    [label]="
                                      labels[kind] +
                                      ' for ' +
                                      displayModel(profile.model)
                                    "
                                    [score]="score(profile, kind)"
                                    [stale]="
                                      profile.cells[kind].kind === 'value' &&
                                      profile.cells[kind].stale
                                    "
                                  />
                                  @if (profile.cells[kind].kind === 'value') {
                                    @let detail = profile.cells[kind];
                                    <ptah-native-popover
                                      [isOpen]="
                                        openCell() ===
                                        rowId(family, profile.model, kind)
                                      "
                                      [hasBackdrop]="true"
                                      [keepInViewport]="true"
                                      (closed)="openCell.set(null)"
                                      ><button
                                        trigger
                                        ptahButton
                                        variant="ghost"
                                        size="xs"
                                        type="button"
                                        [attr.aria-label]="
                                          'Details for ' +
                                          labels[kind] +
                                          ' for ' +
                                          displayModel(profile.model)
                                        "
                                        [attr.aria-expanded]="
                                          openCell() ===
                                          rowId(family, profile.model, kind)
                                        "
                                        [attr.aria-controls]="
                                          'detail-' +
                                          rowId(family, profile.model, kind)
                                        "
                                        (click)="
                                          toggleCell(
                                            family,
                                            profile.model,
                                            kind
                                          )
                                        "
                                      >
                                        Details
                                      </button>
                                      <div
                                        content
                                        [id]="
                                          'detail-' +
                                          rowId(family, profile.model, kind)
                                        "
                                        class="max-w-64 bg-base-100 text-xs shadow-lg"
                                      >
                                        <p>Source: {{ detail.source }}</p>
                                        <p>
                                          Source reference:
                                          {{ detail.sourceRef ?? 'None' }}
                                        </p>
                                        <p>As of {{ detail.asOf }}</p>
                                        <p>
                                          Samples:
                                          {{
                                            detail.sampleCount ?? 'Not counted'
                                          }}
                                        </p>
                                        <p>
                                          Stale:
                                          {{ detail.stale ? 'Yes' : 'No' }}
                                        </p>
                                        @if (detail.note) {
                                          <p>{{ detail.note }}</p>
                                        }
                                      </div></ptah-native-popover
                                    >
                                  }
                                </dd>
                              }
                            }
                          </dl>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              }
            </ptah-table>
          </ng-template>
        </ptah-settings-section-state>
      </div>
    </section>
  `,
})
export class CapabilityMatrixSettingComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  protected readonly names = inject(RoutingDisplayNamesStore);
  readonly familyFilter = input('');
  readonly modelSearch = input('');
  readonly sortKind = input<OutcomeTaskKind>('plan');
  readonly sortDescending = input(false);
  readonly headingLevel = input<2 | 3>(3);
  readonly resultChange = output<AgentGetCapabilityMatrixResult | null>();
  protected readonly tasks = OUTCOME_TASK_KINDS;
  protected readonly labels = LABELS;
  protected readonly load = signal<'loading' | 'error' | 'ready' | 'empty'>(
    'loading',
  );
  protected readonly result = signal<AgentGetCapabilityMatrixResult | null>(
    null,
  );
  protected readonly openCell = signal<string | null>(null);
  protected readonly announcement = signal('');
  private readonly table = viewChild(PtahTableComponent);
  constructor() {
    effect(() => {
      const table = this.table();
      const message = this.announcement();
      if (table && this.load() === 'ready' && message) table.announce(message);
    });
  }
  protected readonly expandedRows = signal<ReadonlySet<string>>(new Set());
  protected readonly visible = computed(() =>
    (this.result()?.profiles ?? []).filter(
      (p) =>
        (!this.familyFilter() || p.family === this.familyFilter()) &&
        p.model.toLowerCase().includes(this.modelSearch().trim().toLowerCase()),
    ),
  );
  protected readonly families = computed(() => [
    ...new Set(this.visible().map((p) => p.family)),
  ]);
  protected familyProfiles(family: string): AgentCapabilityMatrixProfile[] {
    const kind = this.sortKind();
    return this.visible()
      .filter((p) => p.family === family)
      .sort((a, b) => {
        if (a.model === '*') return -1;
        if (b.model === '*') return 1;
        const ac = a.cells[kind],
          bc = b.cells[kind];
        if (ac.kind === 'unknown')
          return bc.kind === 'unknown' ? a.model.localeCompare(b.model) : 1;
        if (bc.kind === 'unknown') return -1;
        return (
          (ac.score - bc.score) * (this.sortDescending() ? -1 : 1) ||
          a.model.localeCompare(b.model)
        );
      });
  }
  protected modelCount(family: string): string {
    const n = this.familyProfiles(family).filter((p) => p.model !== '*').length;
    return n === 1 ? '1 model' : `${n} models`;
  }
  protected score(
    p: AgentCapabilityMatrixProfile,
    kind: OutcomeTaskKind,
  ): number | null {
    const c = p.cells[kind];
    return c.kind === 'value' ? c.score : null;
  }
  protected displayModel(model: string): string {
    return model === '*' ? 'Family default' : this.names.model(model).text;
  }
  protected setExpanded(id: string, expanded: boolean): void {
    const next = new Set(this.expandedRows());
    if (expanded) next.add(id);
    else next.delete(id);
    this.expandedRows.set(next);
  }
  protected rowId(
    family: string,
    model: string,
    kind: OutcomeTaskKind,
  ): string {
    return Array.from(JSON.stringify([family, model, kind]), (char) =>
      char.charCodeAt(0).toString(16).padStart(4, '0'),
    ).join('');
  }
  protected toggleCell(
    family: string,
    model: string,
    kind: OutcomeTaskKind,
  ): void {
    const id = this.rowId(family, model, kind);
    this.openCell.set(this.openCell() === id ? null : id);
  }
  ngOnInit(): void {
    void this.reload();
  }
  async reload(): Promise<void> {
    this.load.set('loading');
    try {
      const response = await this.rpc.call(
        'agent:getCapabilityMatrix',
        NO_PARAMS,
        { timeout: 5_000 },
      );
      if (!response.isSuccess()) {
        this.result.set(null);
        this.resultChange.emit(null);
        this.load.set('error');
        this.announcement.set('Ratings could not be loaded.');
        return;
      }
      this.result.set(response.data);
      this.resultChange.emit(response.data);
      this.load.set(response.data.profiles.length ? 'ready' : 'empty');
      this.announcement.set(
        response.data.profiles.length
          ? `${response.data.profiles.length} ratings loaded.`
          : 'No ratings yet.',
      );
    } catch (error: unknown) {
      // degradation-audit: reported - a failed read shows the error state with Retry.
      this.logger.warn(
        'CapabilityMatrixSetting',
        'agent:getCapabilityMatrix failed',
        {
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
        },
      );
      this.result.set(null);
      this.resultChange.emit(null);
      this.load.set('error');
      this.announcement.set('Ratings could not be loaded.');
    }
  }
}
