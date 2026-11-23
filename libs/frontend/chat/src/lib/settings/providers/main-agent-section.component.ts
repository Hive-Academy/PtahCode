import { ChangeDetectionStrategy, Component, computed, contentChild, inject, output } from '@angular/core';
import { Check, ChevronDown, LucideAngularModule, TriangleAlert } from 'lucide-angular';
import {
  ProvidersSettingsStateService, type ProvidersEffectiveRoute, type ProvidersSettingsSection,
} from '@ptah-extension/core';
import {
  PtahAlertComponent, PtahBadgeDirective, PtahButtonDirective, ProviderMarkComponent,
  PtahSkeletonComponent,
} from '@ptah-extension/ui';
import { MainAgentReassignPopoverComponent } from './main-agent-reassign-popover.component';
import { mainAgentDefaultModelLabel } from './main-agent-default-model-label';

type MainAgentTone = 'success' | 'warning' | 'neutral';

const BADGE_TONE = { success: 'ok', warning: 'warn', neutral: 'neutral' } as const;

/** Header status pill: "Operational" exactly when the main route is loaded and `ready`. */
export function routeStatus(route: ProvidersSettingsSection<ProvidersEffectiveRoute>): { readonly tone: MainAgentTone; readonly text: string } {
  if (route.status === 'error') return { tone: 'warning', text: 'Route unavailable' };
  if (route.status !== 'ready' || !route.data) return { tone: 'neutral', text: 'Checking…' };
  return route.data.ready ? { tone: 'success', text: 'Operational' } : { tone: 'warning', text: 'Needs attention' };
}

/** The Providers page projects scope badges, the reassign popover and review content. */
@Component({
  selector: 'ptah-main-agent-section',
  standalone: true,
  imports: [
    LucideAngularModule, PtahAlertComponent, PtahBadgeDirective, PtahButtonDirective,
    ProviderMarkComponent, PtahSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The block only: the page puts it and Connections on one card. It lifts while it holds a popover (role="dialog"),
         like the card itself, so the Connections block under it never paints over the panel. -->
    <section class="flex flex-col gap-ptah-heading has-[[role=dialog]]:relative has-[[role=dialog]]:z-30"
      aria-labelledby="main-agent-heading" data-testid="main-agent-section">
      <!-- has-[[role=dialog]]:z-30: the block holding an open popover (a scope badge's, or the Main Agent one; both are
           role="dialog") stays above the blocks after it.
           The class must not contain "popover": the light theme styles every [class*='popover'] (styles.css). -->
      <div class="relative flex flex-col gap-ptah-controls has-[[role=dialog]]:z-30"
        data-testid="routing-node-main-agent">
        <div class="flex flex-wrap items-center gap-x-ptah-inline gap-y-ptah-label">
          <div class="flex shrink-0 items-center gap-ptah-inline">
            @switch (main().tone) {
              @case ('success') { <span class="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true"></span> }
              @case ('warning') { <span class="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true"></span> }
              @default { <span class="h-2 w-2 shrink-0 rounded-full bg-base-content-muted" aria-hidden="true"></span> }
            }
            <h2 id="main-agent-heading" class="whitespace-nowrap text-[length:var(--ptah-text-section-title-size)] font-semibold leading-[var(--ptah-text-section-title-leading)] text-base-content"
              data-testid="routing-node-title">Main agent</h2>
          </div>
          <div class="contents" data-testid="routing-node-badges">
            <ng-content select="[main-agent-badges]" />
          </div>
          <span class="grow" aria-hidden="true"></span>
          <button type="button" ptahButton variant="ghost"
            [attr.aria-label]="main().empty ? 'Choose provider' : 'Change main agent: provider, model and effort'"
            aria-haspopup="dialog" [attr.aria-expanded]="popover()?.open() ?? false"
            (click)="reassignRequested.emit()" data-testid="routing-node-action">
            {{ main().empty ? 'Choose provider' : 'Change' }}
            <lucide-angular [img]="ChevronDownIcon" class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div class="@container flex min-w-0 flex-col gap-[var(--ptah-space-2)] rounded-[var(--ptah-space-4)] border border-surface-border bg-surface-1 px-[var(--ptah-space-4)] py-[var(--ptah-space-3)]"
          [class.border-dashed]="main().empty"
          [class.border-[color-mix(in_srgb,var(--state-ink-need)_45%,transparent)]]="main().assignment === 'attention'" data-testid="main-agent-values">
          <div class="flex min-w-0 flex-wrap items-center gap-[var(--ptah-space-3)]" [class.absolute]="main().state === 'error'"
            data-testid="routing-main-provider-row">
            @if (main().state === 'loading') {
              <div class="min-w-0 grow" aria-busy="true">
                <ptah-skeleton [lines]="3" size="sm" data-testid="routing-node-skeleton" />
              </div>
            } @else if (main().state === 'ready') {
              <div class="flex min-w-0 items-center gap-[var(--ptah-space-3)]">
                @if (main().empty) {
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center text-base-content-muted" aria-hidden="true">?</span>
                } @else {
                  <ptah-provider-mark class="shrink-0" [providerId]="main().driver ?? ''" />
                }
                <span class="min-w-0 break-words text-[length:var(--ptah-text-group-title-size)] font-semibold leading-[var(--ptah-text-group-title-leading)] text-base-content"
                  data-testid="routing-main-provider">{{ main().provider ?? 'No main agent yet' }}</span>
              </div>
            }
            <span role="status" class="shrink-0" data-testid="routing-node-status"
              [attr.data-assignment]="main().assignment">
              <span ptahBadge [style.display]="main().state === 'error' ? 'none' : null" [tone]="badgeTone[main().tone]"
                data-testid="main-agent-route-status">
                @if (main().assignment === 'active' || main().assignment === 'attention') {
                  <lucide-angular [img]="main().assignment === 'active' ? CheckIcon : AttentionIcon"
                    class="size-[var(--ptah-icon-xs)]" aria-hidden="true" />
                } @else if (main().state !== 'error') {
                  <span class="size-2 rounded-full border border-current"
                    [class.bg-current]="main().state === 'loading'" aria-hidden="true"></span>
                }
                {{ main().statusText }}
              </span>
            </span>
          </div>

          @if (main().state === 'error') {
            <ptah-alert tone="warning" [compact]="true" live="assertive" data-testid="routing-node-error">
              <span>Main-agent route unavailable.</span>
              <button alertAction type="button" ptahButton variant="ghost"
                (click)="state.refreshRoute()" data-testid="routing-node-retry">Retry</button>
            </ptah-alert>
          } @else if (main().empty) {
            <p class="text-xs text-base-content-muted [@container(min-width:480px)]:ml-[calc(var(--ptah-space-8)+var(--ptah-space-3))]">
              Choose a provider to start the main agent.
            </p>
          } @else if (main().state === 'ready') {
            <div class="flex min-w-0 flex-wrap gap-[var(--ptah-space-2)] [@container(min-width:480px)]:ml-[calc(var(--ptah-space-8)+var(--ptah-space-3))]">
              <span ptahBadge class="min-w-0 max-w-full" style="height: auto; min-height: var(--ptah-badge-h-sm)" data-testid="routing-main-model-row">
                <span class="text-base-content-muted">Model</span>
                <span class="min-w-0 break-words whitespace-normal text-base-content [overflow-wrap:anywhere]"
                  [class.font-mono]="main().modelIsId" data-testid="routing-main-model">{{ main().model }}</span>
              </span>
              <span ptahBadge class="min-w-0 max-w-full" data-testid="routing-main-effort-row">
                <span class="text-base-content-muted">Effort</span>
                <span class="break-words whitespace-normal text-base-content" data-testid="routing-node-footer">{{ main().effort }}</span>
              </span>
            </div>
            @if (main().assignment === 'attention') {
              <p class="text-xs text-base-content-muted [@container(min-width:480px)]:ml-[calc(var(--ptah-space-8)+var(--ptah-space-3))]">
                This provider may need attention. Use Change to pick another provider or check its connection.
              </p>
            }
          }
        </div>

        <div class="absolute bottom-0 left-0 h-0 w-0"><ng-content select="[main-agent-popover]" /></div>
      </div>
      <ng-content />
    </section>

  `,
})
export class MainAgentSectionComponent {
  protected readonly badgeTone = BADGE_TONE;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly CheckIcon = Check;
  protected readonly AttentionIcon = TriangleAlert;
  protected readonly popover = contentChild(MainAgentReassignPopoverComponent);
  protected readonly state = inject(ProvidersSettingsStateService);

  /** "Change main agent": the page opens the Main Agent popover. */
  readonly reassignRequested = output<void>();

  protected readonly main = computed(() => {
    const route = this.state.route(), effort = this.state.effort();
    const state = route.status === 'error' ? 'error' : route.status === 'ready' && route.data ? 'ready' : 'loading';
    const data = route.data;
    const driver = data && data.driverProviderId && data.route !== 'unresolved' ? data.driverProviderId : null;
    const status = routeStatus(route);
    const empty = state === 'ready' && !driver;
    const assignment = state !== 'ready' ? null : empty ? 'not-set' : data?.ready ? 'active' : 'attention';
    const provider = driver
      ? (this.state.connections().data?.find((entry) => entry.id === driver)?.name ?? driver)
      : null;
    const model = !data ? '' : data.resolvedModel.kind === 'model' ? data.resolvedModel.id
      : data.resolvedModel.kind === 'tier' ? `${data.resolvedModel.tier} tier` : mainAgentDefaultModelLabel(driver, provider);
    const effortText = effort.status === 'ready' ? effort.data?.effort ?? 'Provider default' : '…';
    return {
      state, empty, assignment, driver, model, provider, modelIsId: data?.resolvedModel.kind === 'model',
      tone: empty ? 'neutral' : status.tone,
      statusText: empty ? 'Not set' : state === 'error' ? '' : status.text,
      effort: effortText,
    };
  });
}
