import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import {
  AppStateManager,
  AuthStateService,
  PlanLimitsStore,
} from '@ptah-extension/core';
import type { LocalTimeOptions } from '@ptah-extension/shared';
import {
  PtahBadgeDirective,
  PtahSectionHeaderComponent,
  PtahStatusBadgeComponent,
  PtahStatePanelComponent,
  PtahSurfaceDirective,
} from '@ptah-extension/ui';
import { groupProviderAccounts } from '../provider-account-card/provider-account-grouping.model';
import { ProviderLimitCardComponent } from './provider-limit-card.component';
import { ProviderLimitChipComponent } from './provider-limit-chip.component';
import {
  buildProviderLimitCard,
  buildProviderLimitChip,
  type ProviderLimitCardState,
} from './provider-limit-card.view-model';
import { refreshFailedNotice } from './refresh-failed-notice';

/** Card order after the selected provider: most constrained first. */
const STATE_ORDER: Readonly<Record<ProviderLimitCardState, number>> = {
  'limit-reached': 0,
  'near-limit': 1,
  available: 2,
  'not-confirmed': 4,
  'estimate-only': 4,
  aged: 3,
  unknown: 4,
};

/**
 * Plan limits as a compact card grid: the selected chat provider first
 * (accented), then the other providers with readings, then one chip per
 * provider without a reading.
 */
@Component({
  selector: 'ptah-plan-limits-panel',
  standalone: true,
  imports: [
    PtahBadgeDirective,
    PtahSectionHeaderComponent,
    PtahStatePanelComponent,
    PtahStatusBadgeComponent,
    ProviderLimitCardComponent,
    ProviderLimitChipComponent,
    PtahSurfaceDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  // Cards grow to fill each row: two across, four from 1120px of panel
  // width, one below 560px. The panel host is the size container.
  styles: [`
    :host { container-type: inline-size; }
    .plan-limit-card-slot { flex: 1 1 calc(50% - 8px); min-width: 15rem; }
    .plan-limit-chip-slot { flex: 1 1 18rem; min-width: 0; }
    @container (min-width: 1120px) {
      .plan-limit-card-slot { flex-basis: calc(25% - 12px); }
    }
    @container (max-width: 559px) {
      .plan-limit-card-slot { flex-basis: 100%; }
    }
  `],
  template: `
    <section
      ptahSurface
      class="flex min-w-0 flex-col gap-ptah-group"
      aria-labelledby="plan-limits-heading"
      data-testid="dashboard-section-plan-limits"
    >
      <ptah-section-header
        heading="Plan limits"
        headingId="plan-limits-heading"
        description="Most constrained window per provider"
        size="section"
        [level]="2"
      >
        <div actions class="flex flex-wrap gap-ptah-label" data-testid="plan-limits-summary">
          @if (reachedCount() > 0) {
            <ptah-ui-status-badge
              status="failed"
              [label]="reachedCount() + (reachedCount() === 1 ? ' limit reached' : ' limits reached')"
            />
          }
          @if (nearCount() > 0) {
            <ptah-ui-status-badge status="pending" [label]="nearCount() + ' near limit'" />
          }
        </div>
      </ptah-section-header>

      @if (cards().length === 0 && chips().length === 0) {
        <ptah-state-panel
          [state]="loading() ? 'loading' : loadError() ? 'error' : 'empty'"
          [title]="loading() ? 'Loading provider usage' : 'Usage unavailable'"
          [body]="loading() ? null : 'No usage readings returned. Refresh to try again.'"
        />
      } @else {
        @if (refreshNotice(); as notice) {
          <ptah-state-panel
            state="partial"
            title="Refresh failed"
            [body]="notice"
            data-testid="refresh-failed"
          />
        }
        @if (discoveryIncomplete()) {
          <p class="text-xs text-base-content-muted">
            Provider discovery is incomplete; more accounts may appear.
          </p>
        }
        @if (!hasSelectedCard()) {
          <p class="text-xs text-base-content-muted" data-testid="plan-limits-no-selected">
            No usage reading returned for the selected provider
          </p>
        }
        @if (cards().length > 0) {
          <div class="flex flex-wrap gap-ptah-field">
            @for (card of cards(); track card.key) {
              <ptah-provider-limit-card
                class="plan-limit-card-slot"
                [card]="card"
                (openChat)="openChat()"
                (openSettings)="openSettings($event)"
              />
            }
          </div>
        }
        @if (chips().length > 0) {
          <div
            class="flex flex-col gap-ptah-controls border-t border-[var(--surface-border)] pt-ptah-field"
            data-testid="plan-limits-chips"
          >
            <h3
              id="plan-limits-chips-heading"
              class="flex items-center gap-ptah-label text-xs font-semibold text-base-content-muted"
            >
              Without usage readings
              <span ptahBadge tone="neutral" size="xs" data-testid="plan-limits-chips-count">
                {{ chips().length }}
              </span>
            </h3>
            <ul class="flex flex-wrap gap-ptah-controls" aria-labelledby="plan-limits-chips-heading">
              @for (chip of chips(); track chip.key) {
                <li class="plan-limit-chip-slot flex">
                  <ptah-provider-limit-chip class="flex flex-1 min-w-0" [chip]="chip" />
                </li>
              }
            </ul>
          </div>
        }
      }
    </section>
  `,
})
export class PlanLimitsPanelComponent {
  private readonly planLimits = inject(PlanLimitsStore);
  private readonly auth = inject(AuthStateService);
  private readonly appState = inject(AppStateManager);
  private readonly timeOptions: LocalTimeOptions = {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zoneNameLocale: inject(LOCALE_ID),
  };

  protected readonly loading = this.planLimits.loading;
  protected readonly loadError = this.planLimits.loadError;

  private readonly groups = computed(() =>
    groupProviderAccounts(
      this.planLimits.snapshot()?.owners ?? [],
      this.auth.activeProviderId(),
      this.planLimits.now(),
      this.timeOptions,
    ),
  );

  protected readonly cards = computed(() => {
    const now = this.planLimits.now();
    const { selected, other } = this.groups();
    return [
      ...selected.map((record) => buildProviderLimitCard(record.owner, true, now, this.timeOptions)),
      ...other
        .map((record) => buildProviderLimitCard(record.owner, false, now, this.timeOptions))
        .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.label.localeCompare(b.label)),
    ];
  });

  protected readonly reachedCount = computed(
    () => this.cards().filter((card) => card.state === 'limit-reached').length,
  );
  protected readonly nearCount = computed(
    () => this.cards().filter((card) => card.state === 'near-limit').length,
  );

  protected readonly hasSelectedCard = computed(() => this.groups().selected.length > 0);

  protected readonly chips = computed(() => {
    const now = this.planLimits.now();
    return this.groups().withoutReadings.map((record) =>
      buildProviderLimitChip(record.owner, now, this.timeOptions),
    );
  });

  protected readonly discoveryIncomplete = computed(
    () => this.planLimits.snapshot()?.discoveryIncomplete ?? false,
  );

  protected readonly refreshNotice = computed(() => {
    const snapshot = this.planLimits.snapshot();
    return this.loadError() && snapshot
      ? refreshFailedNotice(snapshot, this.planLimits.now())
      : null;
  });

  private readonly providerWatcher = effect(() => {
    const providerId = this.auth.activeProviderId();
    untracked(() => void this.planLimits.load({ providerId }));
  });

  /** "Go to chat": chat opens, where a session with the provider reads its usage. */
  openChat(): void {
    this.appState.setCurrentView('chat');
  }

  /** "Add key": Settings opens on the Providers tab, focused on this provider. */
  openSettings(providerId: string): void {
    this.appState.openSettingsTab('providers', providerId);
  }
}
