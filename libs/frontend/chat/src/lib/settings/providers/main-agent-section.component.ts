import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import {
  ProvidersSettingsStateService, type ProvidersEffectiveRoute, type ProvidersSettingsSection,
} from '@ptah-extension/core';
import {
  PtahBadgeDirective, PtahButtonDirective, PtahDescriptionItemComponent, PtahDescriptionListComponent,
  PtahSkeletonComponent, type PtahBadgeTone,
} from '@ptah-extension/ui';

type MainAgentTone = 'success' | 'warning' | 'neutral';

/** Header status pill: "Operational" exactly when the main route is loaded and `ready`. */
export function routeStatus(route: ProvidersSettingsSection<ProvidersEffectiveRoute>): { readonly tone: MainAgentTone; readonly text: string } {
  if (route.status === 'error') return { tone: 'warning', text: 'Route unavailable' };
  if (route.status !== 'ready' || !route.data) return { tone: 'neutral', text: 'Checking…' };
  return route.data.ready ? { tone: 'success', text: 'Operational' } : { tone: 'warning', text: 'Needs attention' };
}

const BADGE_TONE: Readonly<Record<MainAgentTone, PtahBadgeTone>> = {
  success: 'ok', warning: 'warn', neutral: 'neutral',
};

/**
 * The Main agent block at the top of the Providers tab's first card (above Connections, on the same card) (design-spec §3,
 * user layout correction; Providers redesign PR A): a header with the title, the status ("Active", D16 scope badges) and
 * the route's status ("Operational"), then one `ptah-description-list` with the Provider, Model and Effort of the next
 * request. "Change main agent" is a normal `ptahButton` directly after the provider value, so the way to change the
 * provider, model and effort sits next to what it changes. Reads `ProvidersSettingsStateService` directly.
 *
 * The page owns and projects the D16 badges (`[main-agent-badges]`), the Main Agent popover (`[main-agent-popover]`,
 * anchored at the block's bottom-left edge) and its own read errors / clear review (default slot, under the block).
 * Colour sits on dots and badge tones; all text stays base-content (deviation 6).
 */
@Component({
  selector: 'ptah-main-agent-section',
  standalone: true,
  imports: [
    NgTemplateOutlet, LucideAngularModule, PtahBadgeDirective, PtahButtonDirective,
    PtahDescriptionListComponent, PtahDescriptionItemComponent, PtahSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The block only: the page puts it and Connections on one card. It lifts while it holds a popover (role="dialog"),
         like the card itself, so the Connections block under it never paints over the panel. -->
    <section class="flex flex-col gap-[var(--ptah-gap-heading)] has-[[role=dialog]]:relative has-[[role=dialog]]:z-30"
      aria-labelledby="main-agent-heading" data-testid="main-agent-section">
      <!-- has-[[role=dialog]]:z-30: the block holding an open popover (a scope badge's, or the Main Agent one; both are
           role="dialog") stays above the blocks after it.
           The class must not contain "popover": the light theme styles every [class*='popover'] (styles.css). -->
      <div class="relative flex flex-col gap-[var(--ptah-gap-controls)] has-[[role=dialog]]:z-30"
        data-testid="routing-node-main-agent" [attr.aria-busy]="main().state === 'loading'">
        <!-- Head: the title, then the status and the projected layer badges in the same wrapping row (a badge that does
             not fit moves, whole, to the next line), and the route status at the end. -->
        <div class="flex flex-wrap items-center gap-x-[var(--ptah-gap-inline)] gap-y-[var(--ptah-gap-label)]">
          <div class="mr-auto flex shrink-0 items-center gap-[var(--ptah-gap-inline)]">
            @switch (main().tone) {
              @case ('success') { <span class="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true"></span> }
              @case ('warning') { <span class="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true"></span> }
              @default { <span class="h-2 w-2 shrink-0 rounded-full bg-base-content-muted" aria-hidden="true"></span> }
            }
            <h2 id="main-agent-heading" class="whitespace-nowrap text-base font-semibold leading-5 text-base-content"
              data-testid="routing-node-title">Main agent</h2>
          </div>
          <!-- display: contents, so each badge is an item of the wrapping head row and keeps its own click. -->
          <div class="contents" data-testid="routing-node-badges">
            <span ptahBadge class="shrink-0 whitespace-nowrap" data-testid="routing-node-status">{{ main().status }}</span>
            <ng-content select="[main-agent-badges]" />
          </div>
          <span ptahBadge role="status" [tone]="statusTone()" class="shrink-0 whitespace-nowrap"
            data-testid="main-agent-route-status">{{ status().text }}</span>
        </div>

        @switch (main().state) {
          @case ('loading') {
            <ptah-skeleton [lines]="3" size="sm" data-testid="routing-node-skeleton" />
            <div><ng-container *ngTemplateOutlet="changeAction" /></div>
          }
          @case ('error') {
            <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)] text-xs text-base-content" role="alert"
              data-testid="routing-node-error">
              <span>Main-agent route unavailable.</span>
              <button type="button" ptahButton variant="ghost"
                (click)="state.refreshRoute()" data-testid="routing-node-retry">Retry</button>
            </div>
            <div><ng-container *ngTemplateOutlet="changeAction" /></div>
          }
          @default {
            @if (main().provider; as provider) {
              <ptah-description-list ariaLabel="Main agent settings" data-testid="main-agent-values">
                <!-- The change action sits in the Provider value, directly after the provider name (not in a far-right
                     column), so the values and the way to change them read as one unit. -->
                <div ptahDescriptionItem term="Provider" data-testid="routing-main-provider-row">
                  <span class="break-words font-semibold text-base-content" data-testid="routing-main-provider">{{ provider }}</span>
                  <ng-container *ngTemplateOutlet="changeAction" />
                </div>
                <div ptahDescriptionItem term="Model" data-testid="routing-main-model-row">
                  <span class="min-w-0 break-words text-base-content" [class.font-mono]="main().modelIsId" data-testid="routing-main-model">{{ main().model }}</span>
                </div>
                <div ptahDescriptionItem term="Effort" data-testid="routing-main-effort-row">
                  <span class="break-words text-base-content" data-testid="routing-node-footer">{{ main().effort }}</span>
                </div>
              </ptah-description-list>
            } @else {
              <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)]">
                <p class="text-xs text-base-content">Choose a provider to start the main agent.</p>
                <ng-container *ngTemplateOutlet="changeAction" />
              </div>
            }
          }
        }
        <!-- Anchor for the Main Agent popover (placement bottom-start = the block's bottom-left edge). -->
        <div class="absolute bottom-0 left-0 h-0 w-0"><ng-content select="[main-agent-popover]" /></div>
      </div>
      <ng-content />
    </section>

    <!-- One "Change main agent" button: it renders once, in the place that matches the state. -->
    <ng-template #changeAction>
      <button type="button" ptahButton variant="primary"
        aria-label="Change main agent: provider, model and effort"
        (click)="reassignRequested.emit()" data-testid="routing-node-action">
        Change main agent
        <lucide-angular [img]="ChevronDownIcon" class="h-4 w-4" aria-hidden="true" />
      </button>
    </ng-template>
  `,
})
export class MainAgentSectionComponent {
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly state = inject(ProvidersSettingsStateService);

  /** "Change main agent": the page opens the Main Agent popover. */
  readonly reassignRequested = output<void>();

  protected readonly status = computed(() => routeStatus(this.state.route()));
  protected readonly statusTone = computed(() => BADGE_TONE[this.status().tone]);

  protected readonly main = computed(() => {
    const route = this.state.route(), effort = this.state.effort();
    const state = route.status === 'error' ? 'error' : route.status === 'ready' && route.data ? 'ready' : 'loading';
    const data = route.data;
    const driver = data && data.driverProviderId && data.route !== 'unresolved' ? data.driverProviderId : null;
    const model = !data ? '' : data.resolvedModel.kind === 'model' ? data.resolvedModel.id
      : data.resolvedModel.kind === 'tier' ? `${data.resolvedModel.tier} tier` : 'Default (chosen by Claude)';
    const effortText = effort.status === 'ready' ? effort.data?.effort ?? 'Provider default' : '…';
    const tone: MainAgentTone = !driver ? 'neutral' : data?.ready ? 'success' : 'warning';
    const provider = driver
      ? (this.state.connections().data?.find((entry) => entry.id === driver)?.name ?? driver)
      : null;
    return {
      state, tone, model, provider, modelIsId: data?.resolvedModel.kind === 'model',
      status: !driver ? 'Not set' : data?.ready ? 'Active' : 'Needs attention',
      effort: effortText,
    };
  });
}
