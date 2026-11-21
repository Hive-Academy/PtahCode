/**
 * UsageTopSessionsComponent
 *
 * The five costliest sessions of the range, on the same surface as the chart
 * cards: rank chip, session title (truncated, full text in the title), model
 * with its provider mark, cost with an inline bar against the top session in
 * the provider colour, compact tokens and a short relative "last active"
 * (absolute time in the title). The description sums the listed sessions
 * and, when the window's known cost is given, their share of it.
 *
 * The card is a CSS container (`tbl`): below 640 px the Model and Last active
 * columns are `display: none` and the same values (with the model id and the
 * absolute time as titles) appear as a second line under the session title,
 * so nothing is lost, nothing scrolls and nothing is announced twice. Below
 * 420 px the cost bar hides. Labels and bar widths come from
 * `buildSessionTableRows`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { UsageSessionRow } from './usage-summary.view-model';
import {
  ProviderMarkComponent,
  PtahSectionHeaderComponent,
  PtahSurfaceDirective,
  PtahTableComponent,
  PtahNumericCellDirective,
} from '@ptah-extension/ui';
import { buildSessionTableRows, topSessionsDescription } from './usage-table-rows';

@Component({
  selector: 'ptah-usage-top-sessions',
  standalone: true,
  imports: [
    ProviderMarkComponent,
    PtahSectionHeaderComponent,
    PtahSurfaceDirective,
    PtahTableComponent,
    PtahNumericCellDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .usage-tbl { container-type: inline-size; container-name: tbl; }
    .usage-tbl-narrow { display: none; }
    @container tbl (max-width: 639.98px) {
      .usage-tbl-wide { display: none; }
      .usage-tbl-narrow { display: flex; }
    }
    @container tbl (max-width: 419.98px) {
      .usage-tbl-bar { display: none; }
    }
  `,
  template: `
    <section
      ptahSurface
      class="usage-tbl flex min-w-0 flex-col gap-ptah-heading tabular-nums"
      aria-labelledby="usage-top-sessions-heading"
      data-testid="usage-top-sessions"
    >
      <ptah-section-header
        heading="Top 5 sessions by cost"
        headingId="usage-top-sessions-heading"
        [level]="3"
        [description]="description()"
      />
      @if (rows().length === 0) {
        <p class="text-xs text-base-content-muted">
          No session-linked usage in this range.
        </p>
      } @else {
        <ptah-table label="Top 5 sessions by cost" size="sm" density="compact">
          <thead>
            <tr>
              <th scope="col" class="w-px whitespace-nowrap">
                <span aria-hidden="true">#</span><span class="sr-only">Rank</span>
              </th>
              <th scope="col" class="w-full">Session</th>
              <th scope="col" class="usage-tbl-wide">Model</th>
              <th scope="col" ptahNumeric class="whitespace-nowrap">Cost</th>
              <th scope="col" ptahNumeric class="whitespace-nowrap">Tokens</th>
              <th scope="col" ptahNumeric class="usage-tbl-wide whitespace-nowrap">
                Last active
              </th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.key) {
              <tr data-testid="usage-session-row">
                <td class="text-base-content-muted">
                  <span
                    class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-base-content/10 text-[11px]"
                    >{{ row.rank }}</span
                  >
                </td>
                <!-- Row header: the dashboard spec selects this cell as td[title]. -->
                <td role="rowheader" class="max-w-0" [attr.title]="row.title">
                  <span class="block truncate font-semibold">{{ row.title }}</span>
                  <span
                    class="usage-tbl-narrow min-w-0 items-center gap-1 text-xs text-base-content-muted"
                    data-testid="usage-session-sub-line"
                  >
                    <ptah-provider-mark
                      [providerId]="row.providerId"
                      size="sm"
                      class="h-3.5 w-3.5 shrink-0"
                    />
                    <span class="min-w-0 truncate" [attr.title]="row.modelId">{{
                      row.modelDisplayName
                    }}</span>
                    <span class="shrink-0 whitespace-nowrap" [attr.title]="row.lastActive"
                      ><span aria-hidden="true">· </span
                      ><span class="sr-only">, last active </span
                      >{{ row.lastActiveLabel }}</span
                    >
                  </span>
                </td>
                <td class="usage-tbl-wide whitespace-nowrap">
                  <span class="flex items-center gap-2"
                    ><ptah-provider-mark
                      [providerId]="row.providerId"
                      size="sm"
                      class="h-4 w-4 shrink-0"
                    /><span
                      class="max-w-36 truncate"
                      [attr.title]="row.modelId"
                      >{{ row.modelDisplayName }}</span
                    ></span
                  >
                </td>
                <td
                  ptahNumeric
                  class="whitespace-nowrap"
                  [attr.title]="row.costTitle"
                >
                  <div class="flex items-center justify-end gap-2">
                    <span
                      class="usage-tbl-bar h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-base-content/10"
                      aria-hidden="true"
                      data-testid="usage-session-cost-bar"
                    >
                      <span
                        class="block h-full rounded-full"
                        [style.width.%]="row.costBarPercent"
                        [style.background]="row.accent"
                      ></span>
                    </span>
                    <span class="min-w-[4.5rem] font-semibold">{{ row.costLabel }}</span>
                  </div>
                </td>
                <td
                  ptahNumeric
                  class="whitespace-nowrap text-base-content-muted"
                  [attr.title]="row.tokensTitle"
                >
                  {{ row.tokensLabel }}
                </td>
                <td
                  ptahNumeric
                  class="usage-tbl-wide whitespace-nowrap"
                  [attr.title]="row.lastActive"
                >
                  {{ row.lastActiveLabel }}
                </td>
              </tr>
            }
          </tbody>
        </ptah-table>
      }
    </section>
  `,
})
export class UsageTopSessionsComponent {
  readonly sessions = input.required<readonly UsageSessionRow[]>();
  readonly generatedAt = input.required<string>();
  /**
   * The window's known priced cost (`UsageViewModel.totalCostUsd`); the
   * description adds the listed sessions' share of it when positive.
   */
  readonly knownCostUsd = input<number | null>(null);

  protected readonly rows = computed(() =>
    buildSessionTableRows(this.sessions(), this.generatedAt()),
  );

  /** "$525.43 · 49.3% of known cost"; `null` without a priced session. */
  protected readonly description = computed(() =>
    topSessionsDescription(this.sessions(), this.knownCostUsd()),
  );
}
