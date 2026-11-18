import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahSkeletonComponent,
} from '@ptah-extension/ui';
import {
  AppStateManager,
  ProvidersSettingsStateService,
} from '@ptah-extension/core';
import { CliOrchestrationMatrixComponent } from '../ptah-ai/cli-orchestration-matrix.component';
import { ProviderConsumerAssignmentsComponent } from './provider-consumer-assignments.component';
import {
  BACKGROUND_ROLE_IDS,
  PROVIDER_CONSUMER_IDS,
  type ProviderConsumerId,
} from './provider-consumer-rows';

/**
 * Deep-link sections this part of the Providers tab owns. The Decision model row has no deep link (core's
 * `PendingSettingsTab.section` names none); `background-models` reaches it.
 */
export type AgentsRoutingFocusTarget =
  'background-models' | 'cli-agents' | ProviderConsumerId;

/**
 * Agents routing on the Providers tab, below the Main agent and Connections sections: the CLI matrix (with the read
 * states of its three sources), then the always-visible background model roles. The `cli-agents` deep link focuses the matrix table
 * (`[data-testid="cli-matrix"]`).
 *
 * The Providers page beside it opens the shared state, so this component does not (`open()` re-reads every
 * section). Save outcomes for the matrix and the roles show in the Settings page toast
 * (`SettingsSaveFeedbackService`), like every other save on the page.
 *
 * A deep link is consumed once applied (the section focused and, for a role, its popover open): `focusTargetConsumed`
 * lets Settings clear the target, so the same link raised again while on this tab applies again (Gate V 36, M-1).
 */
@Component({
  selector: 'ptah-agents-routing-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    PtahAlertComponent,
    PtahButtonDirective,
    PtahSkeletonComponent,
    CliOrchestrationMatrixComponent,
    ProviderConsumerAssignmentsComponent,
  ],
  template: `
    <div class="flex flex-col gap-8 font-sans text-sm text-base-content">
      <!-- The loading and retry state of each source shows inside the matrix card (or its placeholder), not below it. -->
      <ng-template #readStatesTpl>
        @for (section of readStates(); track section.id) {
          @if (section.state.status === 'error') {
            <ptah-alert
              tone="error"
              [compact]="true"
              live="assertive"
              [attr.data-read-error]="section.id"
            >
              <p class="min-w-0">
                {{ section.label }} could not be loaded. Your saved settings
                have not changed.
              </p>
              <button
                alertAction
                type="button"
                ptahButton
                variant="ghost"
                (click)="section.retry()"
              >
                Retry {{ section.label }}
              </button>
            </ptah-alert>
          } @else if (
            section.state.status === 'loading' ||
            section.state.status === 'unloaded'
          ) {
            <div
              role="status"
              aria-live="polite"
              class="flex min-w-0 flex-col gap-[var(--ptah-gap-controls)] text-base-content-muted"
              [attr.data-read-loading]="section.id"
            >
              <span>Loading {{ section.label }}…</span>
              <ptah-skeleton [lines]="1" size="sm" />
            </div>
          }
        }
      </ng-template>

      <!-- Deferred (own chunk; the eager bundle is at its budget) behind a same-footprint placeholder. -->
      @defer (on immediate) {
        <ptah-cli-orchestration-matrix
          #cliMatrix
          hostReadStates
          (codexSettingsRequested)="codexSettingsRequested.emit()"
        >
          <div
            read-states
            class="contents"
            data-testid="cli-matrix-read-states"
          >
            <ng-container *ngTemplateOutlet="readStatesTpl" />
          </div>
        </ptah-cli-orchestration-matrix>
      } @placeholder {
        <div
          class="flex min-h-[22rem] flex-col gap-[var(--ptah-gap-field)] border-b border-base-content/10"
          data-testid="cli-matrix-placeholder"
        >
          <!-- Only the empty matrix slot is busy. The read states are its siblings, so a failed read
               is announced (TASK_2026_2256). -->
          <div aria-busy="true" data-testid="cli-matrix-placeholder-busy"></div>
          <ng-container *ngTemplateOutlet="readStatesTpl" />
        </div>
      }

      <!-- Background models remain visible, matching the Settings prototype. -->
      <section
        class="border-t border-base-content/10 pt-6"
        data-glass-surface="content"
      >
        <div data-testid="background-roles-details">
          <header class="sr-only" data-testid="background-roles-summary">
            <span
              data-testid="background-roles-chevron"
              aria-hidden="true"
            ></span>
            Background models
            <span>{{ roleCount }} roles</span>
            <span
              class="text-xs text-base-content-muted"
              data-testid="background-roles-list"
            >
              Memory curator, enhancement, decision
            </span>
          </header>
          <section
            data-focus="background-models"
            tabindex="-1"
            aria-label="Background models"
            class="scroll-mt-4"
          >
            <ptah-provider-consumer-assignments
              [disabled]="saving()"
              [initialEditingConsumerId]="consumerTarget()"
              (setupProviderRequested)="openProviderSetup($event)"
              (deepLinkOpened)="onRoleOpened($event)"
              (assignmentSaved)="state.refresh()"
              (timeoutSaved)="state.refreshEnhancement()"
            />
          </section>
        </div>
      </section>
    </div>
  `,
  styles: `
    :host-context([data-glass='on']) section[data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class AgentsRoutingSettingsComponent {
  readonly codexSettingsRequested = output<void>();
  readonly focusTarget = input<AgentsRoutingFocusTarget | null>(null);
  /** The current `focusTarget` has been applied; the host clears it (Settings' `agentsRoutingTarget`). */
  readonly focusTargetConsumed = output<void>();
  protected readonly state = inject(ProvidersSettingsStateService);
  private readonly appState = inject(AppStateManager);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly roleCount = BACKGROUND_ROLE_IDS.length;
  protected readonly saving = computed(
    () => this.state.commit().status === 'saving',
  );
  protected readonly consumerTarget = computed<ProviderConsumerId | null>(
    () => {
      const target = this.focusTarget();
      return PROVIDER_CONSUMER_IDS.find((id) => id === target) ?? null;
    },
  );
  protected readonly readStates = computed(() => [
    {
      id: 'cli',
      label: 'CLI agents',
      state: this.state.cliAgents(),
      retry: () => this.state.refreshCliAgents(),
    },
    {
      id: 'cli-models',
      label: 'CLI instance models',
      state: this.state.cliModels(),
      retry: () => this.state.refreshCliModels(),
    },
    {
      id: 'orchestration',
      label: 'delegated CLI models',
      state: this.state.orchestration(),
      retry: () => this.state.refreshOrchestration(),
    },
  ]);
  /**
   * The deferred matrix's host, by template ref: a class query would make the matrix an eager dependency. It resolves
   * once the deferred block renders, which re-runs the focus effect for a `cli-agents` deep link that arrived first.
   */
  private readonly cliMatrix = viewChild<string, ElementRef<HTMLElement>>(
    'cliMatrix',
    { read: ElementRef },
  );
  private focusedTarget: AgentsRoutingFocusTarget | null = null;
  /** The role whose popover the roles table opened for the current deep link. */
  private openedRole: ProviderConsumerId | null = null;

  constructor() {
    afterRenderEffect(() => {
      const target = this.focusTarget();
      if (!target) {
        this.focusedTarget = null;
        this.openedRole = null;
        return;
      }
      if (target === this.focusedTarget) return;
      const node =
        target === 'cli-agents'
          ? this.matrixTable()
          : this.openBackgroundRoles();
      if (node) {
        node.scrollIntoView?.({ block: 'nearest' });
        node.focus();
        this.focusedTarget = target;
        this.consumeWhenApplied();
      }
    });
  }

  /** The roles table opened the deep-linked role's popover (it may land before or after the section focus). */
  protected onRoleOpened(id: ProviderConsumerId): void {
    this.openedRole = id;
    this.consumeWhenApplied();
  }

  /** Done once the section is focused and, for a role, its popover is open; a later normal visit has no target. */
  private consumeWhenApplied(): void {
    const target = this.focusTarget();
    if (!target || this.focusedTarget !== target) return;
    const role = this.consumerTarget();
    if (role !== null && this.openedRole !== role) return;
    this.focusTargetConsumed.emit();
  }

  /**
   * A background role asked to set up a provider: the existing deep-link path opens the setup wizard for that
   * provider on this same Providers tab.
   */
  protected openProviderSetup(providerId: string): void {
    this.appState.requestSettingsTab({ tab: 'providers', providerId });
  }

  /** The matrix table; null until the deferred matrix has rendered. */
  private matrixTable(): HTMLElement | null {
    return (
      this.cliMatrix()?.nativeElement.querySelector<HTMLElement>(
        '[data-testid="cli-matrix"]',
      ) ?? null
    );
  }

  /** Resolve the always-visible background section for deep-link focus. */
  private openBackgroundRoles(): HTMLElement | null {
    const host = this.element.nativeElement;
    return host.querySelector<HTMLElement>('[data-focus="background-models"]');
  }
}
