/**
 * UsageBreakdownTableComponent
 *
 * Breakdown table with a [Model | Day] toggle (requirement 5), on the same
 * surface as the chart cards. Model view: a concentration strip of provider
 * cost shares, then model (provider mark + display name + provider chip),
 * cost, share (inline bar in the provider colour plus the percentage),
 * tokens — sorted by cost desc then tokens (the view model pre-sorts).
 * Unpriced rows show "—" for cost and carry a title note. Day view: one row
 * per day with cost (inline stacked bar in the chart's provider colours,
 * relative to the largest day), share, tokens and that day's top model.
 * While any fact is unpriced, every share is of the known priced cost only,
 * and the heading states that denominator.
 *
 * The card is a CSS container (`tbl`): below 640 px the Top model column
 * folds into a second line of the Day cell (the column is `display: none`,
 * so the text is announced once); below 420 px the inline bars hide and the
 * values stay. Labels, titles and bar widths come from the pure
 * `usage-table-rows` builders; bars are decorative (`aria-hidden`).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahSectionHeaderComponent,
  PtahSurfaceDirective,
  ProviderMarkComponent,
  PtahTableComponent,
  PtahNumericCellDirective,
} from '@ptah-extension/ui';
import type {
  DayBreakdownRow,
  ModelBreakdownRow,
  ProviderDailySeries,
} from './usage-summary.view-model';
import {
  buildConcentrationSegments,
  buildDayTableRows,
  buildModelTableRows,
  dayBreakdownDescription,
  modelBreakdownDescription,
} from './usage-table-rows';

@Component({
  selector: 'ptah-usage-breakdown-table',
  standalone: true,
  imports: [
    ProviderMarkComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahSectionHeaderComponent,
    PtahSurfaceDirective,
    PtahTableComponent,
    PtahNumericCellDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .usage-tbl { container-type: inline-size; container-name: tbl; }
    .usage-tbl-narrow { display: none; }
    /* Segments: no layout gap (it would push the tail out of the clipped track);
       the divider is drawn inside each box, segments may shrink to fit, and a
       non-zero tail keeps a visible sliver. */
    .usage-tbl-seg { box-sizing: border-box; min-width: 2px; flex-shrink: 1; }
    .usage-tbl-seg:not(:last-child) { box-shadow: inset -1px 0 0 oklch(var(--b1)); }
    @container tbl (max-width: 639.98px) {
      .usage-tbl-wide { display: none; }
      .usage-tbl-narrow { display: block; }
    }
    @container tbl (max-width: 419.98px) {
      .usage-tbl-bar { display: none; }
    }
  `,
  template: `
    <section
      ptahSurface
      class="usage-tbl flex min-w-0 flex-col gap-ptah-heading tabular-nums"
      aria-label="Breakdown"
      data-testid="usage-breakdown"
    >
      <div class="flex items-start justify-between gap-ptah-heading">
        <ptah-section-header
          heading="Breakdown"
          [level]="3"
          [description]="description()"
        />
        <div
          class="flex shrink-0 gap-ptah-controls"
          role="group"
          aria-label="Breakdown view"
        >
          <button
            type="button"
            ptahButton
            size="xs"
            [variant]="mode() === 'model' ? 'primary' : 'ghost'"
            [selected]="mode() === 'model'"
            (click)="mode.set('model')"
          >
            Model
          </button>
          <button
            type="button"
            ptahButton
            size="xs"
            [variant]="mode() === 'day' ? 'primary' : 'ghost'"
            [selected]="mode() === 'day'"
            (click)="mode.set('day')"
          >
            Day
          </button>
        </div>
      </div>

      @if (mode() === 'model') {
        @if (concentration().length > 0) {
          <div
            class="flex h-2.5 w-full overflow-hidden rounded-full bg-base-content/10"
            aria-hidden="true"
            data-testid="usage-breakdown-concentration"
          >
            @for (segment of concentration(); track segment.providerId) {
              <span
                class="usage-tbl-seg block h-full"
                [style.width.%]="segment.widthPercent"
                [style.background]="segment.color"
              ></span>
            }
          </div>
        }
        <ptah-table
          label="Usage breakdown by model"
          size="sm"
          density="compact"
          data-testid="usage-breakdown-model"
        >
          <thead>
            <tr>
              <th scope="col" class="w-full">Model</th>
              <th scope="col" ptahNumeric class="whitespace-nowrap">Cost</th>
              <th
                scope="col"
                ptahNumeric
                class="whitespace-nowrap"
                [attr.title]="shareTitle()"
              >
                {{ shareHeading() }}
              </th>
              <th scope="col" ptahNumeric class="whitespace-nowrap">Tokens</th>
            </tr>
          </thead>
          <tbody>
            @for (row of modelTableRows(); track row.key) {
              <tr data-testid="usage-model-row">
                <th scope="row" class="max-w-0 text-left font-normal">
                  <div class="flex min-w-0 items-center gap-2">
                    <ptah-provider-mark
                      [providerId]="row.providerId"
                      size="sm"
                      class="h-5 w-5 shrink-0"
                    />
                    <span
                      class="min-w-0 truncate font-semibold"
                      [attr.title]="row.modelDisplayName"
                    >
                      {{ row.modelDisplayName }}
                    </span>
                    <span ptahBadge size="xs" class="shrink-0 text-[10px]">
                      {{ row.providerName }}
                    </span>
                  </div>
                </th>
                <td
                  ptahNumeric
                  class="whitespace-nowrap font-semibold"
                  [attr.title]="row.costTitle"
                >
                  {{ row.costLabel }}
                </td>
                <td ptahNumeric class="whitespace-nowrap">
                  <div class="flex items-center justify-end gap-2">
                    <span
                      class="usage-tbl-bar h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-base-content/10"
                      aria-hidden="true"
                      data-testid="usage-share-bar"
                    >
                      <span
                        class="block h-full rounded-full"
                        [style.width.%]="row.shareBarPercent"
                        [style.background]="row.accent"
                      ></span>
                    </span>
                    <span class="min-w-[3.2rem] text-right">{{ row.shareLabel }}</span>
                  </div>
                </td>
                <td
                  ptahNumeric
                  class="whitespace-nowrap text-base-content-muted"
                  [attr.title]="row.tokensTitle"
                >
                  {{ row.tokensLabel }}
                </td>
              </tr>
            }
          </tbody>
        </ptah-table>
      } @else {
        <ptah-table
          label="Usage breakdown by day"
          size="sm"
          density="compact"
          data-testid="usage-breakdown-day"
        >
          <thead>
            <tr>
              <th scope="col" class="whitespace-nowrap">Day</th>
              <th scope="col" ptahNumeric class="whitespace-nowrap">Cost</th>
              <th
                scope="col"
                ptahNumeric
                class="whitespace-nowrap"
                [attr.title]="shareTitle()"
              >
                {{ shareHeading() }}
              </th>
              <th scope="col" ptahNumeric class="whitespace-nowrap">Tokens</th>
              <th scope="col" class="usage-tbl-wide w-full">Top model</th>
            </tr>
          </thead>
          <tbody>
            @for (row of dayTableRows(); track row.day) {
              <tr data-testid="usage-day-row">
                <th scope="row" class="text-left font-medium">
                  <span class="whitespace-nowrap">{{ row.dayLabel }}</span>
                  <span
                    class="usage-tbl-narrow max-w-40 truncate text-xs font-normal text-base-content-muted"
                    [attr.title]="row.topModelLabel"
                    data-testid="usage-day-top-model-sub"
                  >
                    <span class="sr-only">Top model: </span>{{ row.topModelLabel }}
                  </span>
                </th>
                <td
                  ptahNumeric
                  class="whitespace-nowrap"
                  [attr.title]="row.costTitle"
                >
                  <div class="flex items-center justify-end gap-2">
                    <span
                      class="usage-tbl-bar flex h-1.5 w-[72px] shrink-0 overflow-hidden rounded-full bg-base-content/10"
                      aria-hidden="true"
                      data-testid="usage-day-cost-bar"
                    >
                      @for (segment of row.segments; track segment.providerId) {
                        <span
                          class="usage-tbl-seg block h-full first:rounded-s-full last:rounded-e-full"
                          [style.width.%]="segment.widthPercent"
                          [style.background]="segment.color"
                        ></span>
                      }
                    </span>
                    <span class="min-w-[4.5rem] font-semibold">{{ row.costLabel }}</span>
                  </div>
                </td>
                <td ptahNumeric class="whitespace-nowrap">{{ row.shareLabel }}</td>
                <td
                  ptahNumeric
                  class="whitespace-nowrap text-base-content-muted"
                  [attr.title]="row.tokensTitle"
                >
                  {{ row.tokensLabel }}
                </td>
                <td class="usage-tbl-wide max-w-0 truncate" [attr.title]="row.topModelLabel">
                  {{ row.topModelLabel }}
                </td>
              </tr>
            }
          </tbody>
        </ptah-table>
      }
    </section>
  `,
})
export class UsageBreakdownTableComponent {
  readonly modelRows = input.required<readonly ModelBreakdownRow[]>();
  readonly dayRows = input.required<readonly DayBreakdownRow[]>();
  /** The window's days, oldest first; indexes `providerSeries` values. */
  readonly days = input<readonly string[]>([]);
  /** Per-provider daily cost, for the stacked day bars in the chart colours. */
  readonly providerSeries = input<readonly ProviderDailySeries[]>([]);
  /** True while any in-window cost fact is unpriced: shares then divide by the known priced cost only. */
  readonly costPartiallyKnown = input(false);

  protected readonly mode = signal<'model' | 'day'>('model');

  protected readonly modelTableRows = computed(() =>
    buildModelTableRows(this.modelRows()),
  );

  protected readonly dayTableRows = computed(() =>
    buildDayTableRows(this.dayRows(), this.days(), this.providerSeries()),
  );

  protected readonly concentration = computed(() =>
    buildConcentrationSegments(this.providerSeries()),
  );

  /** "9 models · $1,066.33 known cost" or "30 days · busiest day Nov 9". */
  protected readonly description = computed(() =>
    this.mode() === 'model'
      ? modelBreakdownDescription(this.modelRows())
      : dayBreakdownDescription(this.dayRows()),
  );

  /** "Share of known cost" while unpriced facts shrink the denominator; plain "Share" otherwise. */
  protected readonly shareHeading = computed(() =>
    this.costPartiallyKnown() ? 'Share of known cost' : 'Share',
  );

  protected readonly shareTitle = computed<string | null>(() =>
    this.costPartiallyKnown()
      ? 'Some usage in this range is unpriced; shares are of the known priced cost only'
      : null,
  );
}
