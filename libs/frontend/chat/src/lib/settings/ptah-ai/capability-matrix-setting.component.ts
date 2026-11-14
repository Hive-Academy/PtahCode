import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
} from '@ptah-extension/ui';
import { RoutingDisplayNamesStore } from './routing-display-names.store';
import {
  OUTCOME_TASK_KINDS,
  type AgentCapabilityMatrixProfile,
  type AgentGetCapabilityMatrixParams,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
const RPC_TIMEOUT_MS = 5_000;
const NO_PARAMS: AgentGetCapabilityMatrixParams = {};

/**
 * Read-only capability matrix (`agent:getCapabilityMatrix`). Electron only:
 * the parent mounts it under `isElectron`. Unknown cells render as "unrated".
 */
@Component({
  selector: 'ptah-capability-matrix-setting',
  standalone: true,
  imports: [NativePopoverComponent, PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      data-glass-surface="content"
      class="flex flex-col gap-[var(--ptah-gap-heading)] text-sm text-base-content"
      aria-labelledby="capability-matrix-heading"
      data-testid="capability-matrix-setting"
    >
      <div class="border-b border-base-content/10 pb-2">
        <h3
          id="capability-matrix-heading"
          class="text-base font-semibold text-base-content"
        >
          Capability matrix
        </h3>
        <p class="mt-0.5 text-xs text-base-content-muted">
          Scores for each family, model and task kind. Unrated means no
          evidence yet.
        </p>
      </div>

      @switch (load()) {
        @case ('loading') {
          <p
            class="text-xs text-base-content-muted"
            role="status"
            aria-live="polite"
            data-testid="capability-matrix-loading"
          >
            Loading capability matrix…
          </p>
        }
        @case ('error') {
          <div role="alert" class="space-y-[var(--ptah-space-1)]">
            <p data-testid="capability-matrix-error">
              The capability matrix could not be read.
            </p>
            <button
              type="button"
              ptahButton
              (click)="reload()"
              data-testid="capability-matrix-retry"
            >
              Retry
            </button>
          </div>
        }
        @default {
          @if (profiles().length === 0) {
            <p
              class="text-xs text-base-content-muted"
              data-testid="capability-matrix-empty"
            >
              Evidence appears here after runs.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="table table-xs min-w-[780px]" data-testid="capability-matrix-table">
                <thead>
                  <tr>
                    <th scope="col" class="sticky left-0 bg-base-100 px-[var(--ptah-space-3)] py-[var(--ptah-space-2)]">Model</th>
                    @for (kind of tasks; track kind) { <th scope="col" class="capitalize px-[var(--ptah-space-3)] py-[var(--ptah-space-2)]">{{ kind }}</th> }
                  </tr>
                </thead>
                @for (family of families(); track family) {
                  <tbody [id]="'family-' + family">
                    <tr><th scope="rowgroup" colspan="7" class="bg-base-content/5 px-[var(--ptah-space-3)] py-[var(--ptah-space-2)]">
                      <button type="button" [class]="'flex min-h-8 items-center gap-2 rounded text-sm font-semibold ' + focusRing" [attr.aria-expanded]="expanded().has(family)" [attr.aria-controls]="'family-' + family" [title]="family" (click)="toggleFamily(family)">
                        <span aria-hidden="true" class="inline-block w-3 transition-transform" [class.rotate-90]="expanded().has(family)">›</span>
                        <span>{{ names.executor(family).text }}</span>
                        <span ptahBadge count>{{ modelCount(family) }}</span>
                      </button>
                      @if (family.startsWith('pc-') && names.executor(family).raw; as raw) {
                        <details><summary class="min-h-8 cursor-pointer">Executor ID details</summary><code class="break-all">{{ raw }}</code></details>
                      }
                    </th></tr>
                    @if (expanded().has(family)) {
                      @for (profile of familyProfiles(family); track profile.model) {
                        <tr>
                          <th scope="row" class="sticky left-0 bg-base-100 px-[var(--ptah-space-3)] py-[var(--ptah-space-2)] [overflow-wrap:anywhere]">
                            {{ names.model(profile.model).text }}
                            @if (names.model(profile.model).raw; as raw) { <span class="sr-only">Raw model ID {{ raw }}</span> }
                          </th>
                          @for (kind of tasks; track kind) {
                            @let cell = profile.cells[kind];
                            <td class="min-w-24 px-[var(--ptah-space-3)] py-[var(--ptah-space-2)]" [attr.data-testid]="'matrix-row-' + family + '-' + profile.model + '-' + kind">
                              @if (cell.kind === 'unknown') { <span class="text-base-content-muted">— Unrated</span> }
                              @else {
                                <span class="font-semibold">{{ cell.score }}/100</span>
                                <div class="h-1.5 rounded bg-base-content/15" aria-hidden="true"><div class="h-1.5 rounded bg-primary" [style.width.%]="cell.score"></div></div>
                                <div class="mt-[var(--ptah-space-1)] flex flex-wrap items-center gap-[var(--ptah-space-1)]">
                                <span ptahBadge size="xs">{{ cell.source }}</span>
                                @if (cell.sampleCount !== null) { <span>n={{ cell.sampleCount }}</span> }
                                @if (cell.stale) { <span ptahBadge tone="warn" size="xs">Stale</span> }
                                <ptah-native-popover [isOpen]="openCell() === rowId(family, profile.model, kind)" [hasBackdrop]="true" (closed)="openCell.set(null)">
                                  <button trigger type="button" class="min-h-8 underline" [attr.aria-expanded]="openCell() === rowId(family, profile.model, kind)" [attr.aria-controls]="'detail-' + rowId(family, profile.model, kind)" (click)="toggleCell(family, profile.model, kind)">Details</button>
                                  <div content [id]="'detail-' + rowId(family, profile.model, kind)" class="max-w-64 bg-base-100 p-[var(--ptah-surface-pad)] text-xs shadow-lg"><p>As of {{ cell.asOf }}</p><p>Source: {{ cell.sourceRef || 'None' }}</p>@if (cell.note) { <p>{{ cell.note }}</p> }</div>
                                </ptah-native-popover>
                                </div>
                              }
                            </td>
                          }
                        </tr>
                      }
                    }
                  </tbody>
                  }
              </table>
            </div>
          }
        }
      }
    </section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: var(--ptah-surface-pad);
    }
  `,
})
export class CapabilityMatrixSettingComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  protected readonly names = inject(RoutingDisplayNamesStore);
  protected readonly tasks = OUTCOME_TASK_KINDS;
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly openCell = signal<string | null>(null);

  protected readonly focusRing = FOCUS;
  protected readonly load = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly profiles = signal<readonly AgentCapabilityMatrixProfile[]>(
    [],
  );



  protected families(): readonly string[] { return [...new Set(this.profiles().map((profile) => profile.family))]; }
  protected familyProfiles(family: string): readonly AgentCapabilityMatrixProfile[] { return this.profiles().filter((profile) => profile.family === family); }
  protected modelCount(family: string): string {
    const count = this.familyProfiles(family).length;
    return count === 1 ? '1 model' : `${count} models`;
  }
  protected toggleFamily(family: string): void {
    const next = new Set(this.expanded());
    if (next.has(family)) next.delete(family); else next.add(family);
    this.expanded.set(next);
  }
  protected rowId(family: string, model: string, kind: OutcomeTaskKind): string { return `${family}-${model}-${kind}`; }
  protected toggleCell(family: string, model: string, kind: OutcomeTaskKind): void {
    const id = this.rowId(family, model, kind);
    this.openCell.set(this.openCell() === id ? null : id);
  }

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.load.set('loading');
    try {
      const response = await this.rpc.call(
        'agent:getCapabilityMatrix',
        NO_PARAMS,
        { timeout: RPC_TIMEOUT_MS },
      );
      if (!response.isSuccess()) {
        this.profiles.set([]);
        this.load.set('error');
        return;
      }
      this.profiles.set(response.data.profiles);
      this.expanded.set(new Set(response.data.profiles.length ? [response.data.profiles[0].family] : []));
      this.load.set('ready');
    } catch (error: unknown) {
      // degradation-audit: reported - a failed read shows the error row with Retry.
      this.logger.warn('CapabilityMatrixSetting', 'agent:getCapabilityMatrix failed', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
      this.profiles.set([]);
      this.load.set('error');
    }
  }
}
