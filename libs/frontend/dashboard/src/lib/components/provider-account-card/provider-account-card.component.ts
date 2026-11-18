import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  AppStateManager,
  AuthStateService,
  PlanLimitsStore,
} from '@ptah-extension/core';
import {
  formatLocalAbsolute,
  windowObservedAt,
  type LocalTimeOptions,
  type PlanLimitsSnapshot,
} from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  PtahSectionHeaderComponent,
  PtahStatePanelComponent,
} from '@ptah-extension/ui';
import type { PlanTileActionView } from './plan-tile-view.model';
import { groupProviderAccounts } from './provider-account-grouping.model';
import { ProviderAccountFeatureComponent } from './provider-account-feature.component';
import { ProviderAccountSummaryRowComponent } from './provider-account-summary-row.component';

@Component({
  selector: 'ptah-provider-account-card',
  standalone: true,
  imports: [
    PtahButtonDirective,
    PtahSectionHeaderComponent,
    PtahStatePanelComponent,
    ProviderAccountFeatureComponent,
    ProviderAccountSummaryRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', style: 'container: provider-accounts / inline-size' },
  styles: [
    `
      @container provider-accounts (max-width:479px) {
        section {
          padding: var(--ptah-space-3);
        }
      }
    `,
  ],
  template: ` <section
    class="surface-1 rounded-ptah-surface p-ptah-surface flex flex-col gap-ptah-group"
    aria-labelledby="provider-accounts-heading"
    data-testid="dashboard-section-provider-accounts"
  >
    <ptah-section-header
      heading="Provider accounts &amp; plan limits"
      headingId="provider-accounts-heading"
      size="section"
      [level]="2"
    >
      <button
        actions
        type="button"
        ptahButton
        variant="ghost"
        size="sm"
        [disabled]="loading()"
        (click)="refresh()"
      >
        {{
          loading()
            ? 'Refreshing'
            : loadError() && owners().length === 0
              ? 'Retry'
              : 'Refresh'
        }}
      </button>
    </ptah-section-header>
    @if (owners().length === 0) {
      <ptah-state-panel
        [state]="loading() ? 'loading' : loadError() ? 'error' : 'empty'"
        [title]="loading() ? 'Loading provider usage' : 'Usage unavailable'"
        [body]="
          loading() ? null : 'No usage readings returned. Refresh to try again.'
        "
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
      <ptah-section-header
        heading="Selected for chat"
        size="group"
        [level]="3"
      />
      @if (groups().selected.length > 1) {
        <p class="text-xs text-base-content-muted">
          Accounts for selected provider
        </p>
      }
      @for (record of groups().selected; track record.owner.owner.key) {
        <ptah-provider-account-feature
          [view]="record.view"
          [expanded]="expandedOwners().has(record.owner.owner.key)"
          (toggleExpanded)="toggleOwner(record.owner.owner.key)"
          (actionClick)="onTileAction($event)"
        />
      }
      @if (groups().selected.length === 0) {
        <p class="text-sm">
          No usage reading returned for the selected provider
        </p>
      }
      @if (groups().other.length > 0) {
        <ptah-section-header
          heading="Other provider accounts"
          size="group"
          [level]="3"
        />
        <div class="flex flex-col gap-ptah-heading">
          @for (record of groups().other; track record.owner.owner.key) {
            <ptah-provider-account-summary-row
              [view]="record.view"
          [expanded]="expandedOwners().has(record.owner.owner.key)"
          (toggleExpanded)="toggleOwner(record.owner.owner.key)"
              (actionClick)="onTileAction($event)"
            />
          }
        </div>
      }
      @if (groups().withoutReadings.length > 0) {
        <div>
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="sm"
            [attr.aria-expanded]="quietExpanded()"
            aria-controls="provider-without-readings"
            (click)="toggleQuiet()"
          >
            Without usage readings ({{ groups().withoutReadings.length }}){{
              attentionCount()
                ? ' · ' + attentionCount() + ' need attention'
                : ''
            }}
          </button>
          <div id="provider-without-readings" [hidden]="!quietExpanded()">
            @for (
              record of groups().withoutReadings;
              track record.owner.owner.key
            ) {
              <ptah-provider-account-summary-row
                [view]="record.view"
          [expanded]="expandedOwners().has(record.owner.owner.key)"
          (toggleExpanded)="toggleOwner(record.owner.owner.key)"
                (actionClick)="onTileAction($event)"
              />
            }
          </div>
        </div>
      }
    }
  </section>`,
})
export class ProviderAccountCardComponent {
  private readonly planLimits = inject(PlanLimitsStore);
  private readonly auth = inject(AuthStateService);
  private readonly appState = inject(AppStateManager);
  private readonly timeOptions: LocalTimeOptions = {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zoneNameLocale: inject(LOCALE_ID),
  };
  protected readonly loading = this.planLimits.loading;
  protected readonly loadError = this.planLimits.loadError;
  protected readonly owners = computed(
    () => this.planLimits.snapshot()?.owners ?? [],
  );
  protected readonly groups = computed(() =>
    groupProviderAccounts(
      this.owners(),
      this.auth.activeProviderId(),
      this.planLimits.now(),
      this.timeOptions,
    ),
  );
  protected readonly discoveryIncomplete = computed(
    () => this.planLimits.snapshot()?.discoveryIncomplete ?? false,
  );
  private readonly quietOpen = signal(false);
  protected readonly quietExpanded = this.quietOpen.asReadonly();
  protected readonly attentionCount = computed(
    () =>
      this.groups().withoutReadings.filter((record) =>
        [
          'service-unavailable',
          'cli-unavailable',
          'cli-version-unsupported',
          'stale',
        ].includes(record.owner.status),
      ).length,
  );
  protected readonly refreshNotice = computed(() => {
    const snapshot = this.planLimits.snapshot();
    return this.loadError() && snapshot
      ? refreshFailedNotice(snapshot, this.planLimits.now(), this.timeOptions)
      : null;
  });
  private readonly openOwners = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedOwners = this.openOwners.asReadonly();
  private readonly disclosureWatcher = effect(() => {
    const snapshot = this.planLimits.snapshot();
    if (snapshot === null) return;
    const keys = new Set(snapshot.owners.map((owner) => owner.owner.key));
    untracked(() => this.pruneOwners(keys));
  });
  toggleOwner(key: string): void {
    this.openOwners.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  private pruneOwners(keys: ReadonlySet<string>): void {
    this.openOwners.update((current) => {
      const next = new Set([...current].filter((key) => keys.has(key)));
      return next.size === current.size ? current : next;
    });
  }
  toggleQuiet(): void {
    this.quietOpen.update((value) => !value);
  }
  private readonly providerWatcher = effect(() => {
    const providerId = this.auth.activeProviderId();
    untracked(() => void this.planLimits.load({ providerId }));
  });

  refresh(): void {
    void this.planLimits.load({
      providerId: this.auth.activeProviderId(),
      refresh: true,
    });
  }

  /**
   * Tile inline actions — existing navigation only: "Go to chat" goes to
   * chat, where a session with the provider opens and its usage can be
   * read; "Add key" opens Settings on the Providers tab focused on this
   * provider.
   */
  onTileAction(action: PlanTileActionView): void {
    if (action.kind === 'open-session') {
      this.appState.setCurrentView('chat');
    } else {
      this.appState.openSettingsTab('providers', action.providerId);
    }
  }
}

export function refreshFailedNotice(
  snapshot: PlanLimitsSnapshot,
  now: number,
  time: LocalTimeOptions,
): string | null {
  if (snapshot.owners.length === 0) return null;
  let newest: number | undefined;
  for (const owner of snapshot.owners) {
    const instants = [
      ...owner.windows.map(windowObservedAt),
      ...owner.ownerEvidence.map((evidence) => evidence.observedAt),
    ];
    for (const instant of instants) {
      if (
        Number.isFinite(instant) &&
        (newest === undefined || instant > newest)
      ) {
        newest = instant;
      }
    }
  }
  return newest === undefined
    ? 'Refresh failed — showing last observed data'
    : `Refresh failed — showing last observed data (observed ${formatLocalAbsolute(newest, now, time)})`;
}
