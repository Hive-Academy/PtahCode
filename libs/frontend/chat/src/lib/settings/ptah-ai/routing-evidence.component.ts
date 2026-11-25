import { DecimalPipe, NgTemplateOutlet, PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import type {
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceLane,
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
    <ptah-form-section wide level="2" heading="Routing evidence" data-glass-surface="content">
      <ng-template #funnelDetails let-funnel>
        <dl class="my-[var(--ptah-space-2)] grid grid-cols-2 gap-x-[var(--ptah-space-3)] gap-y-[var(--ptah-gap-label)] text-xs tabular-nums">
          @for (field of funnelFields; track field[0]) {
            <dt>{{ field[1] }}</dt>
            <dd>{{ funnel[field[0]] }}</dd>
          }
        </dl>
      </ng-template>

      @let evidence = state();
      @if (evidence === 'loading') {
        <ptah-skeleton shape="lines" />
        <p class="sr-only" role="status">Loading routing evidence…</p>
      } @else if (evidence === 'error') {
        <ptah-alert tone="error" [compact]="true" live="polite">
          Routing evidence could not be loaded.
          <button alertAction type="button" ptahButton variant="ghost" (click)="reload()">
            Retry
          </button>
        </ptah-alert>
      } @else {
        <div class="space-y-[var(--ptah-gap-section)]">
          <p class="text-xs text-base-content-muted">Outcomes from the last {{ evidence.windowDays }} days</p>
          @for (lane of evidence.lanes; track lane.laneId) {
            <div class="min-w-0 space-y-[var(--ptah-gap-controls)]">
              <h3 class="font-semibold break-all">{{ lane.laneId }}</h3>
              <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)] text-xs text-base-content-muted">
                <span>Catalog</span>
                <span ptahBadge [tone]="lane.catalog.status === 'ok' ? 'ok' : 'warn'">
                  {{ catalogStatus[lane.catalog.status] }}
                </span>
                <span>Last successful fetch: {{ age(lane.catalog.lastOkAt) }}</span>
                @if (lane.catalog.fetchedAt !== lane.catalog.lastOkAt) {
                  <span>Last attempt: {{ age(lane.catalog.fetchedAt) }}</span>
                }
              </div>
              @if (lane.models.length > 0) {
                <ptah-table [label]="'Model evidence for ' + lane.laneId" density="compact">
                  <thead>
                    <tr>
                      <th scope="col">Model</th>
                      <th scope="col">Supported efforts</th>
                      <th scope="col">Task and effort outcomes</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (model of lane.models; track model.model) {
                      @let efforts = model.efforts;
                      <tr>
                        <th scope="row">
                          {{ model.model === '*' ? 'Family default' : model.model }}
                          @if (!model.inCatalog && model.model !== '*') {
                            <span class="block text-xs text-base-content-muted">Outside current catalog</span>
                          }
                        </th>
                        <td>
                          <span ptahBadge [tone]="efforts.provenance === 'ptah-fallback' ? 'warn' : 'neutral'">
                            {{ provenanceLabel[efforts.provenance] }}
                          </span>
                          @if (efforts.provenance !== 'unknown') {
                            <div>{{ efforts.supported.join(', ') || 'None' }}</div>
                            @if (efforts.provenance === 'native') {
                              <div>Default: {{ efforts.default ?? 'not reported' }}</div>
                            }
                          }
                        </td>
                        <td>
                          @for (key of model.keys; track key.taskKind + '|' + key.effort) {
                            <details>
                              <summary class="cursor-pointer">
                                <span class="capitalize">{{ key.taskKind }}</span>
                                · {{ key.effort === '*' ? 'Any effort' : key.effort }}
                                · @if (key.score === null) {
                                  no samples
                                } @else {
                                  Score {{ key.score | number: '1.0-2' }}
                                  · {{ key.sampleCount }} {{ key.sampleCount === 1 ? 'sample' : 'samples' }}
                                  · {{ age(key.asOf) }}
                                  @if (key.stale) {
                                    <span ptahBadge tone="warn">Stale</span>
                                  }
                                }
                              </summary>
                              <ng-container [ngTemplateOutlet]="funnelDetails" [ngTemplateOutletContext]="{ $implicit: key.funnel }" />
                              <p class="text-xs">Effort not sent: {{ key.effortNotSent }}</p>
                            </details>
                          } @empty {
                            <span class="text-base-content-muted">no samples</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </ptah-table>
              } @else {
                <p class="text-xs text-base-content-muted">No models to show.</p>
              }
            </div>
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
                      <td>{{ model.meanConfidence === null ? 'not reported' : (model.meanConfidence | percent) }}</td>
                      <td>
                        <details>
                          <summary class="cursor-pointer">Funnel</summary>
                          <ng-container [ngTemplateOutlet]="funnelDetails" [ngTemplateOutletContext]="{ $implicit: model.funnel }" />
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
  protected readonly state = signal<AgentGetRoutingEvidenceResult | 'loading' | 'error'>('loading');
  protected readonly catalogStatus = CATALOG_STATUS;
  protected readonly funnelFields = FUNNEL_FIELDS;
  protected readonly provenanceLabel = {
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
      const response = await this.rpc.call('agent:getRoutingEvidence', {}, { timeout: 5_000 });
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
