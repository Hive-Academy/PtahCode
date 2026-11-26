import { DecimalPipe, NgTemplateOutlet, PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import type {
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceKey,
  AgentRoutingEvidenceLane,
  AgentRoutingEvidenceModel,
  AgentRoutingFunnel,
} from '@ptah-extension/shared';
import {
  PtahAlertComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahFormSectionComponent,
  PtahSkeletonComponent,
  PtahTableComponent,
} from '@ptah-extension/ui';

const CATALOG_STATUS = {
  ok: 'Ready',
  timeout: 'Timed out',
  error: 'Failed',
  empty: 'Empty',
  never: 'Never fetched',
} satisfies Record<AgentRoutingEvidenceLane['catalog']['status'], string>;

const FUNNEL_FIELDS = [
  ['spawned', 'Spawned'],
  ['completed', 'Completed'],
  ['delivered', 'Delivered'],
  ['reviewed', 'Reviewed'],
  ['approved', 'Approved'],
  ['capacityDropped', 'Capacity drop-outs'],
  ['unverified', 'Unverified'],
  ['noDeliverable', 'No deliverable'],
  ['failed', 'Failed'],
  ['rejected', 'Rejected'],
  ['unresolvedRevise', 'Unresolved revisions'],
  ['reviseRounds', 'Revision rounds'],
] as const satisfies readonly (readonly [keyof AgentRoutingFunnel, string])[];

interface RoutingModelView extends AgentRoutingEvidenceModel {
  readonly sampledKeys: readonly AgentRoutingEvidenceKey[];
  /** Null when wildcard and effort-specific cells for one task kind overlap. */
  readonly sampleTotal: number | null;
}

interface RoutingLaneView extends AgentRoutingEvidenceLane {
  readonly measuredModels: readonly RoutingModelView[];
  readonly catalogOnlyModels: readonly AgentRoutingEvidenceModel[];
  readonly measuredCellCount: number;
}

type RoutingEvidenceView = Omit<AgentGetRoutingEvidenceResult, 'lanes'> & {
  readonly lanes: readonly RoutingLaneView[];
};

function modelView(model: AgentRoutingEvidenceModel): RoutingModelView {
  const sampledKeys = model.keys.filter((key) => key.sampleCount > 0);
  return { ...model, sampledKeys, sampleTotal: sampleTotal(sampledKeys) };
}

/**
 * A wildcard cell includes the effort-specific cells for its task kind. Do not
 * present their counts as independent samples.
 */
function sampleTotal(keys: readonly AgentRoutingEvidenceKey[]): number | null {
  const byTask = new Map<string, AgentRoutingEvidenceKey[]>();
  for (const key of keys) {
    const taskKeys = byTask.get(key.taskKind);
    if (taskKeys === undefined) byTask.set(key.taskKind, [key]);
    else taskKeys.push(key);
  }
  let total = 0;
  for (const taskKeys of byTask.values()) {
    const hasWildcard = taskKeys.some((key) => key.effort === '*');
    const hasSpecific = taskKeys.some((key) => key.effort !== '*');
    if (hasWildcard && hasSpecific) return null;
    total += taskKeys.reduce((sum, key) => sum + key.sampleCount, 0);
  }
  return total;
}

function laneView(lane: AgentRoutingEvidenceLane): RoutingLaneView {
  const models = lane.models.map(modelView);
  const measuredModels = models.filter((model) => model.sampledKeys.length > 0);
  return {
    ...lane,
    measuredModels,
    catalogOnlyModels: models.filter((model) => model.sampledKeys.length === 0),
    measuredCellCount: measuredModels.reduce(
      (sum, model) => sum + model.sampledKeys.length,
      0,
    ),
  };
}

@Component({
  selector: 'ptah-routing-evidence',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    PercentPipe,
    PtahAlertComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahFormSectionComponent,
    PtahSkeletonComponent,
    PtahTableComponent,
  ],
  template: `
    <ptah-form-section
      wide
      level="2"
      heading="Routing evidence"
      data-glass-surface="content"
    >
      <ng-template #funnelDetails let-funnel>
        <dl
          class="my-[var(--ptah-space-2)] grid grid-cols-2 gap-x-[var(--ptah-space-3)] gap-y-[var(--ptah-gap-label)] text-xs tabular-nums"
        >
          @for (field of funnelFields; track field[0]) {
            <dt>{{ field[1] }}</dt>
            <dd>{{ funnel[field[0]] }}</dd>
          }
        </dl>
      </ng-template>

      <ng-template #effortSupport let-efforts>
        <div
          class="flex min-w-0 flex-wrap items-center gap-[var(--ptah-gap-inline)]"
        >
          <span
            ptahBadge
            size="xs"
            [tone]="efforts.provenance === 'ptah-fallback' ? 'warn' : 'neutral'"
          >
            {{ provenanceLabel[efforts.provenance] }}
          </span>
          @if (efforts.provenance !== 'unknown') {
            @for (effort of efforts.supported; track effort) {
              <span
                ptahBadge
                appearance="outline"
                size="xs"
                data-testid="routing-supported-effort"
                >{{ effort }}</span
              >
            } @empty {
              <span class="text-xs text-base-content-muted">No supported efforts</span>
            }
            @if (efforts.provenance === 'native') {
              <span class="text-xs text-base-content-muted">
                Default: {{ efforts.default ?? 'not reported' }}
              </span>
            }
          }
        </div>
      </ng-template>

      @let evidence = view();
      @if (evidence === 'loading') {
        <ptah-skeleton shape="lines" />
        <p class="sr-only" role="status">Loading routing evidence…</p>
      } @else if (evidence === 'error') {
        <ptah-alert tone="error" [compact]="true" live="polite">
          Routing evidence could not be loaded.
          <button
            alertAction
            type="button"
            ptahButton
            variant="ghost"
            (click)="reload()"
          >
            Retry
          </button>
        </ptah-alert>
      } @else {
        <div class="space-y-[var(--ptah-gap-section)]">
          <p class="text-xs text-base-content-muted">
            Outcomes from the last {{ evidence.windowDays }} days
          </p>
          @for (lane of evidence.lanes; track lane.laneId) {
            <section
              class="min-w-0 space-y-[var(--ptah-gap-controls)]"
              [attr.aria-label]="'Routing evidence for ' + lane.laneId"
              data-testid="routing-evidence-lane"
            >
              <div
                class="flex min-w-0 flex-wrap items-start justify-between gap-[var(--ptah-gap-controls)]"
              >
                <div class="min-w-0">
                  <h3 class="font-semibold break-all">{{ lane.laneId }}</h3>
                  <p class="text-xs text-base-content-muted">
                    {{ lane.measuredModels.length }}
                    {{ lane.measuredModels.length === 1 ? 'measured model' : 'measured models' }}
                    · {{ lane.measuredCellCount }}
                    {{ lane.measuredCellCount === 1 ? 'sampled cell' : 'sampled cells' }}
                  </p>
                </div>
                <span
                  ptahBadge
                  size="xs"
                  [tone]="lane.catalog.status === 'ok' ? 'ok' : 'warn'"
                >
                  Catalog: {{ catalogStatus[lane.catalog.status] }}
                </span>
              </div>
              <div
                class="flex flex-wrap gap-x-[var(--ptah-gap-controls)] gap-y-[var(--ptah-gap-label)] text-xs text-base-content-muted"
              >
                <span>{{ lane.catalog.modelCount }} in catalog</span>
                <span>Last successful fetch: {{ age(lane.catalog.lastOkAt) }}</span>
                @if (lane.catalog.fetchedAt !== lane.catalog.lastOkAt) {
                  <span>Last attempt: {{ age(lane.catalog.fetchedAt) }}</span>
                }
              </div>

              @if (lane.measuredModels.length > 0) {
                <div class="grid min-w-0 gap-[var(--ptah-gap-controls)]">
                  @for (model of lane.measuredModels; track model.model) {
                    <article
                      class="min-w-0 space-y-[var(--ptah-gap-controls)] rounded-[var(--ptah-radius-control)] border border-base-content/10 bg-base-200/30 p-[var(--ptah-gap-field)]"
                      [attr.data-model]="model.model"
                      data-testid="routing-model-card"
                    >
                      <div
                        class="flex min-w-0 flex-wrap items-start justify-between gap-[var(--ptah-gap-controls)]"
                      >
                        <div class="min-w-0">
                          <h4 class="font-medium break-all">
                            {{ model.model === '*' ? 'Family default' : model.model }}
                          </h4>
                          @if (!model.inCatalog && model.model !== '*') {
                            <span
                              ptahBadge
                              size="xs"
                              tone="warn"
                              class="mt-[var(--ptah-gap-label)]"
                            >
                              Outside current catalog
                            </span>
                          }
                        </div>
                        <div
                          class="flex flex-wrap gap-[var(--ptah-gap-inline)] text-xs tabular-nums"
                        >
                          <span ptahBadge appearance="outline" size="xs">
                            {{ model.sampledKeys.length }}
                            {{ model.sampledKeys.length === 1 ? 'cell' : 'cells' }}
                          </span>
                          <span
                            ptahBadge
                            appearance="outline"
                            size="xs"
                            data-testid="routing-model-sample-total"
                          >
                            @if (model.sampleTotal === null) {
                              Sample totals overlap
                            } @else {
                              {{ model.sampleTotal }}
                              total {{ model.sampleTotal === 1 ? 'sample' : 'samples' }}
                            }
                          </span>
                        </div>
                      </div>

                      <ng-container
                        [ngTemplateOutlet]="effortSupport"
                        [ngTemplateOutletContext]="{ $implicit: model.efforts }"
                      />

                      <dl
                        class="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--ptah-gap-inline)]"
                        [attr.aria-label]="'Sampled task and effort cells for ' + model.model"
                        data-testid="routing-evidence-matrix"
                      >
                        @for (key of model.sampledKeys; track key.taskKind + '|' + key.effort) {
                          <div
                            class="min-w-0 rounded border border-base-content/10 bg-base-100/60 p-[var(--ptah-gap-controls)]"
                            [attr.data-effort]="key.effort"
                            [attr.data-task-kind]="key.taskKind"
                            data-testid="routing-evidence-cell"
                          >
                            <dt
                              class="flex flex-wrap items-center justify-between gap-[var(--ptah-gap-inline)] text-xs"
                            >
                              <span class="font-medium capitalize">{{ key.taskKind }}</span>
                              <span class="text-base-content-muted">
                                {{ key.effort === '*' ? 'Any effort' : key.effort }}
                              </span>
                            </dt>
                            <dd
                              class="mt-[var(--ptah-gap-label)] flex flex-wrap items-center gap-x-[var(--ptah-gap-inline)] text-xs tabular-nums"
                            >
                              <span>
                                @if (key.score === null) {
                                  Score not reported
                                } @else {
                                  Score {{ key.score | number: '1.0-2' }}
                                }
                              </span>
                              <span>
                                {{ key.sampleCount }}
                                {{ key.sampleCount === 1 ? 'sample' : 'samples' }}
                              </span>
                              @if (key.stale) {
                                <span ptahBadge size="xs" tone="warn">Stale</span>
                              }
                            </dd>
                          </div>
                        }
                      </dl>

                      <details
                        class="border-t border-base-content/10 pt-[var(--ptah-gap-controls)]"
                        data-testid="routing-model-details"
                      >
                        <summary
                          class="cursor-pointer rounded text-xs font-medium text-base-content-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                        >
                          Outcome details ({{ model.sampledKeys.length }})
                        </summary>
                        @if (model.sampleTotal === null) {
                          <p class="mt-[var(--ptah-space-2)] text-xs text-base-content-muted">
                            Wildcard and effort-specific samples are not added together.
                          </p>
                        }
                        <div class="mt-[var(--ptah-space-2)] space-y-[var(--ptah-gap-field)]">
                          @for (key of model.sampledKeys; track key.taskKind + '|' + key.effort) {
                            <section
                              class="min-w-0 rounded border border-base-content/10 p-[var(--ptah-gap-controls)]"
                              [attr.aria-label]="
                                'Outcome details for ' + key.taskKind + ' and ' + key.effort
                              "
                            >
                              <div
                                class="flex flex-wrap items-center justify-between gap-[var(--ptah-gap-inline)] text-xs"
                              >
                                <h5 class="font-medium capitalize">
                                  {{ key.taskKind }}
                                  <span class="font-normal text-base-content-muted">
                                    · {{ key.effort === '*' ? 'Any effort' : key.effort }}
                                  </span>
                                </h5>
                                <span class="tabular-nums">
                                  @if (key.score === null) {
                                    Score not reported
                                  } @else {
                                    Score {{ key.score | number: '1.0-2' }}
                                  }
                                  · {{ key.sampleCount }}
                                  {{ key.sampleCount === 1 ? 'sample' : 'samples' }}
                                </span>
                              </div>
                              <p class="mt-[var(--ptah-space-1)] text-xs text-base-content-muted">
                                Measured {{ age(key.asOf) }}
                                @if (key.stale) {
                                  · Stale
                                }
                                · Effort not sent: {{ key.effortNotSent }}
                              </p>
                              <ng-container
                                [ngTemplateOutlet]="funnelDetails"
                                [ngTemplateOutletContext]="{ $implicit: key.funnel }"
                              />
                            </section>
                          }
                        </div>
                      </details>
                    </article>
                  }
                </div>
              } @else {
                <p
                  class="rounded border border-dashed border-base-content/15 p-[var(--ptah-gap-field)] text-xs text-base-content-muted"
                  data-testid="routing-lane-empty"
                >
                  {{ lane.models.length === 0
                    ? 'No models or measured outcomes yet.'
                    : 'No measured outcomes in this window.' }}
                </p>
              }

              @if (lane.catalogOnlyModels.length > 0) {
                <details
                  class="text-xs text-base-content-muted"
                  data-testid="routing-catalog-models"
                >
                  <summary
                    class="cursor-pointer rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                  >
                    Catalog models without evidence ({{ lane.catalogOnlyModels.length }})
                  </summary>
                  <ul class="mt-[var(--ptah-space-2)] space-y-[var(--ptah-gap-controls)]">
                    @for (model of lane.catalogOnlyModels; track model.model) {
                      <li class="min-w-0 rounded border border-base-content/10 p-[var(--ptah-gap-controls)]">
                        <div class="mb-[var(--ptah-space-1)] flex flex-wrap items-center gap-[var(--ptah-space-2)]">
                          <span class="font-medium break-all text-base-content">
                            {{ model.model === '*' ? 'Family default' : model.model }}
                          </span>
                          @if (!model.inCatalog && model.model !== '*') {
                            <span ptahBadge size="xs" tone="warn">Outside current catalog</span>
                          }
                        </div>
                        <ng-container
                          [ngTemplateOutlet]="effortSupport"
                          [ngTemplateOutletContext]="{ $implicit: model.efforts }"
                        />
                      </li>
                    }
                  </ul>
                </details>
              }
            </section>
          } @empty {
            <p class="text-xs text-base-content-muted">No lane evidence yet.</p>
          }

          <div class="min-w-0 space-y-[var(--ptah-gap-controls)]">
            <h3 class="font-semibold">Decision models</h3>
            @if (evidence.decisionModels.length > 0) {
              <ptah-table label="Decision model outcomes" density="compact">
                <thead>
                  <tr>
                    <th scope="col">Decision model</th>
                    <th scope="col">Proposals</th>
                    <th scope="col">Accepted</th>
                    <th scope="col">Mean confidence</th>
                    <th scope="col">Outcomes</th>
                  </tr>
                </thead>
                <tbody>
                  @for (model of evidence.decisionModels; track model.decisionModel) {
                    <tr>
                      <th scope="row">{{ model.decisionModel }}</th>
                      <td>{{ model.proposals }}</td>
                      <td>{{ model.accepted }}</td>
                      <td>
                        {{ model.meanConfidence === null ? 'not reported' : (model.meanConfidence | percent) }}
                      </td>
                      <td>
                        <details>
                          <summary class="cursor-pointer">Funnel</summary>
                          <ng-container
                            [ngTemplateOutlet]="funnelDetails"
                            [ngTemplateOutletContext]="{ $implicit: model.funnel }"
                          />
                        </details>
                      </td>
                    </tr>
                  }
                </tbody>
              </ptah-table>
            } @else {
              <p class="text-xs text-base-content-muted">No decision model outcomes yet.</p>
            }
          </div>
        </div>
      }
    </ptah-form-section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class RoutingEvidenceComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  private readonly state = signal<
    AgentGetRoutingEvidenceResult | 'loading' | 'error'
  >('loading');
  protected readonly view = computed<RoutingEvidenceView | 'loading' | 'error'>(
    () => {
      const evidence = this.state();
      if (typeof evidence === 'string') return evidence;
      return { ...evidence, lanes: evidence.lanes.map(laneView) };
    },
  );
  protected readonly catalogStatus = CATALOG_STATUS;
  protected readonly funnelFields = FUNNEL_FIELDS;
  protected readonly provenanceLabel: Readonly<Record<string, string>> = {
    native: 'Native',
    'ptah-fallback': 'Ptah fallback',
    unknown: 'not reported',
  };

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      const response = await this.rpc.call(
        'agent:getRoutingEvidence',
        {},
        { timeout: 5_000 },
      );
      this.state.set(response.isSuccess() ? response.data : 'error');
    } catch {
      // degradation-audit: reported - the section shows a retryable evidence error.
      this.logger.warn('RoutingEvidence', 'agent:getRoutingEvidence failed');
      this.state.set('error');
    }
  }

  protected age(timestamp: number | string | null): string {
    if (timestamp === null) return 'Never';
    const ms = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    if (!Number.isFinite(ms)) return 'Unknown';
    const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
    if (minutes === 0) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
}
