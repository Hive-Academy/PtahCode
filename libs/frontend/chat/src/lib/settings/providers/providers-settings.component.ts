import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  ClaudeAmbientStatusService,
  ProviderAccountsStateService,
  ProvidersSettingsStateService,
  VSCodeService,
  type ProvidersConnection,
  type ProvidersConnectionDraft,
  type ProvidersEditContext,
  type ProvidersExternalAuthAction,
} from '@ptah-extension/core';
import { isProviderSessionProviderId } from '@ptah-extension/shared';
import type {
  SettingScope,
  AuthVerifyDraftConnectionParams,
  AuthCancelDraftVerificationParams,
  ConnectionCheckRecord,
} from '@ptah-extension/shared';
import {
  MainAgentScopeBadgesComponent,
  type MainAgentScopeField,
} from './main-agent-scope-badges.component';
import { settingsProviderConnections } from './provider-connection-options';
import { ProviderConnectionCardComponent } from './provider-connection-card.component';
import {
  applyRecordedCheck,
  resolveConnectionState,
  type ProviderConnectionCardStatus,
} from './provider-connection-card.state';
import {
  ProviderSetupWizardComponent,
  type ProviderWizardCommit,
  type WizardCommitState,
} from './provider-setup-wizard.component';
import { ConnectionDetailDrawerComponent } from './connection-detail-drawer.component';
import { MainAgentSectionComponent } from './main-agent-section.component';
import {
  MainAgentReassignPopoverComponent,
  type MainAgentFocus,
} from './main-agent-reassign-popover.component';
import { connectedAccountCount } from './accounts/account-presentation';
import {
  connectionKind,
  type ConnectionDrawerTabId,
} from './connection-drawer/connection-kind';
import type { OverviewConnectionStatus } from './connection-drawer/overview-tab.component';
// Type-only: the Credentials tab and its helpers stay in the drawer's deferred chunk (the write runner is tiny).
import type {
  CredentialsCommit,
  CredentialsExternalAuth,
} from './connection-drawer/credentials-tab.component';
import { runDrawerWrite } from './connection-drawer/drawer-write';
import { connectionUsage } from './connection-usage';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { commitToast } from '../feedback/settings-commit-toast';
// Rendered only inside `@defer`, so it stays out of the eager settings bundle.
import { KimiCodeLoginProgressComponent } from './connection-drawer/kimi-code-login-progress.component';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahAlertComponent,
  PtahStatePanelComponent,
  PtahSkeletonComponent,
  PtahCardGridDirective,
} from '@ptah-extension/ui';

/**
 * Deep-link sections this page owns. Background roles and CLI agents are on the same tab, in
 * `AgentsRoutingSettingsComponent` below this page.
 */
export type ProvidersSettingsFocusTarget =
  | 'main-agent'
  | 'main-model'
  | 'main-effort'
  | 'connections'
  | 'more-providers';

/** A deep link to one connection and its destination tab. */
export type ProvidersSettingsDrawerRequest =
  | { readonly connection: 'claude-cli'; readonly tab: 'accounts' }
  | { readonly providerId: 'openai-codex'; readonly tab: 'credentials' };

const CONTROL =
  'btn btn-outline btn-sm border-base-content-muted bg-base-100 text-base-content hover:bg-base-100 hover:text-base-content hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';

/**
 * Providers tab composition. All host access and persistence belong to the injected state owner;
 * the model-catalogue loader is provided once by `SettingsComponent`.
 */
@Component({
  selector: 'ptah-providers-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahBadgeDirective,
    SettingsBusyDisabledDirective,
    MainAgentScopeBadgesComponent,
    ProviderConnectionCardComponent,
    ProviderSetupWizardComponent,
    ConnectionDetailDrawerComponent,
    MainAgentSectionComponent,
    MainAgentReassignPopoverComponent,
    KimiCodeLoginProgressComponent,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahAlertComponent,
    PtahStatePanelComponent,
    PtahSkeletonComponent,
    PtahCardGridDirective,
    NativePopoverComponent,
  ],
  template: `
    <div
      class="providers-page h-full overflow-y-auto font-sans text-sm text-base-content"
    >
      <!-- No plane of its own: the Settings shell's page plane (settings.component.html, surface-0 = base-100) paints
           light and dark and clears in glass, so the scene shows between the section cards on every tab. -->
      <!-- No width or side padding of its own: the Settings shell (settings.component.html) already sets
           max-w-screen-2xl and the page padding, which used to be applied twice (Batch 24, card grid width). -->
      <!-- Order: the Main agent section, then Connections (header, catalog caption, list). Settings renders the CLI
           matrix and the background roles after this page, so the page repeats neither.
           No page title, no Refresh: the tab names the page, and every region retries its own read. -->
      <div class="space-y-8 py-3">
        <!-- One card: the Main agent block, a hairline, then Connections (the divider pattern of the CLI matrix card
             between the system lanes and the Ptah CLI instances). -->
        <div
          class="space-y-8"
          data-testid="providers-main-connections-card"
          data-glass-surface="content"
        >
          <!-- Main-agent region. Loading shows as the section's skeleton (aria-busy here keeps captures waiting). -->
          <div
            [attr.aria-busy]="mainReadsLoading()"
            data-testid="main-agent-region"
          >
            <!-- The Main agent section holds the D16 badges and opens the Main Agent popover (provider, model, effort).
                 Deferred with the popover (eager route at its bundle budget) behind a same-footprint placeholder. -->
            @defer (on immediate) {
              <ptah-main-agent-section (reassignRequested)="openMainPopover()">
                <ptah-main-agent-reassign-popover
                  main-agent-popover
                  [open]="mainPopover() !== null"
                  [initialFocus]="mainPopover()?.focus ?? null"
                  (closed)="mainPopover.set(null)"
                  (accountSignInRequested)="openAccountSignIn()"
                />
                <div
                  main-agent-badges
                  class="contents"
                  data-testid="main-scope-badges"
                >
                  <!-- Batch 52.6: one badge per overridden layer ("Workspace override"), listing its fields (prototype). -->
                  <ptah-main-agent-scope-badges
                    [fields]="mainScopeFields()"
                    [workspaceName]="workspaceName()"
                    (clearRequested)="reviewClear($event.key, $event.target)"
                  />
                </div>
                <!-- The route's own failure is shown (with Retry) in the block; its other reads and the clear-override
                     review follow under it, in the same section. -->
                @for (section of mainReadErrors(); track section.id) {
                  <div
                    role="alert"
                    [class]="readError"
                    [attr.data-read-error]="section.id"
                  >
                    <p class="min-w-0">
                      {{ section.title }} could not be loaded. Your saved
                      settings have not changed.
                    </p>
                    <button
                      type="button"
                      [class]="retryControl"
                      (click)="section.retry()"
                    >
                      Retry {{ section.label }}
                    </button>
                  </div>
                }
                @if (clearKey(); as key) {
                  <section
                    class="rounded-lg border border-base-content-muted p-4 space-y-3"
                    data-glass-surface="tile"
                    aria-label="Review clear override"
                  >
                    @if (clearTarget() === 'all-above-global') {
                      <p>
                        Use the global {{ settingLabel(key) }} value. Removes
                        the workspace and App overrides above Global. Removing
                        the App override also affects its other workspaces.
                      </p>
                    } @else {
                      <p>
                        Clear {{ settingLabel(key) }} override. The host will
                        resolve the next stored source.
                      </p>
                      <p>
                        Next source:
                        {{
                          state.scopeEntry(key)?.fallbackPreview?.scope ??
                            'App default'
                        }}.
                      </p>
                    }
                    @if (clearEndsSessions(key)) {
                      <p data-testid="clear-ends-sessions">
                        Clearing this override ends running chat sessions. It
                        cannot be undone from here.
                      </p>
                    }
                    <button
                      type="button"
                      [class]="control"
                      (click)="clearOverride()"
                      [ptahBusyDisabled]="saving()"
                    >
                      Confirm clear override
                    </button>
                    <button
                      type="button"
                      [class]="control"
                      (click)="clearKey.set(null)"
                      [disabled]="saving()"
                    >
                      Cancel clear
                    </button>
                  </section>
                }
              </ptah-main-agent-section>
            } @placeholder {
              <div
                class="min-h-[150px] border-b border-base-content/10 p-3"
                aria-busy="true"
                data-testid="main-agent-placeholder"
              ></div>
            }
          </div>

          <!-- Connections: under the Main agent, on the same card. -->
          <section
            aria-labelledby="providers-connections-heading"
            class="space-y-3 border-t border-base-content/10 pt-6"
            data-testid="providers-connections-card"
            [attr.aria-busy]="state.connections().status === 'loading'"
          >
            <!-- Header (prototype): title + count pill left; filter and the primary "Connect provider" right. -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h2
                  id="providers-connections-heading"
                  data-focus="connections"
                  tabindex="-1"
                  class="text-base font-semibold scroll-mt-4"
                >
                  Connections
                </h2>
                @if (state.connections().status === 'ready') {
                  <span ptahBadge data-testid="connections-count"
                    >{{ connections().length }} configured</span
                  >
                  <ptah-native-popover
                    [isOpen]="catalogHintOpen()"
                    placement="bottom-start"
                    backdropClass="transparent"
                    [keepInViewport]="true"
                    (closed)="catalogHintOpen.set(false)"
                  >
                    <button
                      trigger
                      type="button"
                      ptahButton
                      variant="ghost"
                      data-testid="catalog-hint"
                      aria-haspopup="dialog"
                      aria-controls="providers-catalog-hint-list"
                      [attr.aria-expanded]="catalogHintOpen()"
                      (click)="catalogHintOpen.update(toggle)"
                    >
                      <span ptahBadge
                        >{{ catalog().length }} available in catalog</span
                      >
                    </button>
                    <div
                      content
                      class="p-[var(--ptah-gap-field)]"
                      role="dialog"
                      aria-label="Available catalog providers"
                      id="providers-catalog-hint-list"
                    >
                      <ul
                        class="text-sm"
                        data-testid="catalog-hint-text"
                      >
                        @for (provider of catalog(); track provider.id) {
                          <li>{{ provider.name }}</li>
                        } @empty {
                          <li>{{ catalogHint().lead }}</li>
                        }
                      </ul>
                    </div>
                  </ptah-native-popover>
                }
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <ptah-field label="Filter connections" size="sm" class="w-52">
                  <input
                    ptahInput
                    id="connections-filter"
                    size="sm"
                    type="search"
                    class="w-full text-sm text-base-content"
                    placeholder="Filter connections…"
                    aria-label="Filter connections"
                    data-testid="connections-filter"
                    [value]="filter()"
                    (input)="filter.set(inputValue($event))"
                  />
                </ptah-field>
                <button
                  type="button"
                  ptahButton
                  variant="primary"
                  (click)="openWizard('')"
                  [attr.aria-disabled]="canStartSetup() ? null : 'true'"
                  [attr.aria-describedby]="setupBlockReasonId()"
                  data-testid="connect-provider"
                  data-focus="more-providers"
                >
                  <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true">
                    <path
                      d="M8 3v10M3 8h10"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      fill="none"
                    /></svg
                  >Connect provider
                </button>
              </div>
            </div>
            @if (
              requestedDrawer()?.tab === 'credentials' &&
              state.connections().status === 'ready' &&
              !codexConnectionPresent()
            ) {
              <button
                type="button"
                ptahButton
                variant="primary"
                class="mt-3"
                data-testid="connect-codex"
                (click)="connectMissingCodex()"
              >
                Connect Codex
              </button>
            }
            @if (state.connections().status !== 'ready') {
              <div
                class="text-xs text-base-content-muted"
                data-testid="catalog-hint"
              >
                <p id="provider-setup-connections-loading" data-testid="catalog-hint-text">
                  {{ catalogHint().lead }}
                </p>
              </div>
            }
            @if (state.connections().status === 'error') {
              <ptah-alert
                tone="error"
                [compact]="true"
                live="assertive"
                data-read-error="connections"
              >
                <p id="provider-setup-connections-error" class="min-w-0">
                  Providers could not be loaded. Your saved settings have not
                  changed.
                </p>
                <button
                  alertAction
                  type="button"
                  ptahButton
                  variant="ghost"
                  (click)="retryProviderConnections($event)"
                >
                  Retry providers
                </button>
              </ptah-alert>
            }
            @if (setupBlockReason(); as reason) {
              <p id="provider-setup-block-reason" class="text-xs text-base-content-muted">
                {{ reason }}
              </p>
            }
            @if (
              state.connections().status === 'ready' &&
              connections().length === 0
            ) {
              <ptah-state-panel
                state="empty"
                title="No connections configured."
                body="Connect a provider to get started."
              />
            }
            @if (state.connections().status === 'loading') {
              <div aria-label="Loading connections">
                <ptah-skeleton [lines]="2" size="sm" />
              </div>
            }
            @if (
              filter() && connections().length && !shownConnections().length
            ) {
              <p
                role="status"
                class="text-sm text-base-content-muted"
                data-testid="connections-filter-empty"
              >
                No connections match “{{ filter() }}”.
                <button
                  type="button"
                  ptahButton
                  variant="ghost"
                  (click)="filter.set('')"
                >
                  Clear filter
                </button>
              </p>
            }
            <!-- Compact cards (≤ 80 px): the whole card opens the drawer, which holds every per-state action but one.
                 Columns come from the CONTAINER width (ptahCardGrid, auto-fill). The wide variant (27 rem tracks) keeps the
                 name, status and badges of a card on one line; below 27 rem the one column shrinks to the container (onboarding's 400 px). -->
            <div ptahCardGrid variant="wide" data-testid="connections-grid">
              @for (connection of shownConnections(); track connection.id) {
                <ptah-provider-connection-card
                  [attr.data-connection-id]="connection.id"
                  [providerId]="connection.id"
                  [providerName]="connection.name"
                  [authModality]="connection.authMode"
                  [sourceLabel]="
                    connection.hasKey ? 'Key stored locally' : null
                  "
                  [authModalityText]="connection.custom ? 'Custom' : null"
                  [status]="connectionStatus(connection)"
                  [isActive]="activeId() === connection.id"
                  [positiveProbeEvidence]="hasProbeEvidence(connection.id)"
                  [isBlocked]="isBlocked(connection.id)"
                  [lastCheck]="lastCheckOf(connection.id)"
                  [routeProbedAt]="state.route().data?.probedAt ?? null"
                  [usedByCount]="
                    usage().complete
                      ? (usage().byProvider[connection.id]?.length ?? 0)
                      : null
                  "
                  [usedByLabels]="usedByLabels()[connection.id] ?? noLabels"
                  [keyUnreadable]="connection.keyUnreadable === true"
                  [connectedAccounts]="
                    isClaudeCli(connection) ? connectedAccounts() : null
                  "
                  (keyRetryRequested)="state.refreshConnections()"
                  (detailsRequested)="openDrawer(connection.id)"
                  (setupRequested)="openWizard(connection.id)"
                  (addKeyRequested)="openWizard(connection.id)"
                  (replaceKeyRequested)="openWizard(connection.id)"
                  (signInRequested)="externalAction(connection.id, 'sign-in')"
                  (retryRequested)="checkFromCard(connection.id)"
                  (checkAgainRequested)="
                    externalAction(connection.id, 'cli-check')
                  "
                  (checkConnectionRequested)="checkFromCard(connection.id)"
                />
              }
            </div>
          </section>
        </div>
        @if (state.externalAuth().data?.message; as message) {
          <p role="status" class="break-words text-sm">{{ message }}</p>
        }
        @if (pageKimiLogin(); as login) {
          <div class="space-y-2" data-testid="providers-kimi-login">
            @defer (on immediate) {
              <ptah-kimi-code-login-progress [state]="login" />
            }
            @if (login.status !== 'failed') {
              <button
                type="button"
                ptahButton
                (click)="externalAction(kimiCodeId, 'sign-in-cancel')"
                data-testid="providers-kimi-login-cancel"
              >
                Cancel Kimi Code sign-in
              </button>
            }
          </div>
        }
        @if (state.externalAuth().status === 'loading') {
          <p role="status" class="text-sm">Waiting for external sign-in…</p>
        }
        @if (state.externalAuth().status === 'error') {
          <p role="alert" class="text-sm">
            Sign-in could not be checked. Retry the named provider action.
          </p>
        }
      </div>
    </div>
    @if (drawerConnection(); as connection) {
      <!-- Mounted only while open: the usage reads run only then, and the drawer restores focus on destroy.
           Deferred into its own chunk: the settings route is eager and at its initial-bundle budget. -->
      @defer (on immediate) {
        <!-- z-[60]: keeps the drawer above in-page content. The page toast is a top-layer popover that re-raises
             above the drawer and moves beside it when the window has room, else lifts above the drawer footer. The
             Models & Tiers tab repeats that feedback inline (its focus trap is outside the page toast). -->
        <div class="relative z-[60]">
          <ptah-connection-detail-drawer
            [connection]="connection"
            [status]="drawerStatus(connection)"
            [lastCheck]="lastCheckOf(connection.id)"
            [positiveProbeEvidence]="hasProbeEvidence(connection.id)"
            [isActive]="activeId() === connection.id"
            [isDriver]="knownDriverId() === connection.id"
            [loading]="
              state.route().data === null && state.route().status !== 'error'
            "
            [checking]="
              state.route().status === 'loading' ||
              drawerCheckRunning(connection.id)
            "
            [saving]="saving()"
            [canEdit]="canStartSetup()"
            [usedBy]="usage().byProvider[connection.id] ?? []"
            [usageComplete]="usage().complete"
            [usageError]="usageError()"
            [customProtocol]="state.customEntry(connection.id)?.lane ?? null"
            [credentialsSetup]="credentialsSetup()"
            [credentialsSetupError]="state.connectionSetup().status === 'error'"
            [credentialsCommit]="drawerCommit()"
            [externalAuth]="drawerExternalAuth()"
            [kimiLogin]="state.kimiCodeLogin()"
            [verifyDraftConnection]="verifyDraftConnection"
            [cancelDraftVerification]="cancelDraftVerification"
            [accountsAvailable]="accountsAvailable"
            [initialTab]="drawerTab()"
            (closed)="closeDrawer()"
            (checkConnectionRequested)="
              state.checkProviderConnection(connection.id)
            "
            (retryUsageRequested)="state.refresh()"
            (setupRequested)="setupFromDrawer($event)"
            (replaceKeyRequested)="replaceKey($event)"
            (deleteKeyRequested)="deleteKey(connection.id)"
            (signOutRequested)="signOutCopilot()"
            (externalActionRequested)="
              drawerExternalAction(connection.id, $event)
            "
            (keyRetryRequested)="state.refreshConnections()"
          />
        </div>
      }
    }
    @if (wizardOpen()) {
      <!-- One wizard instance per setup session: a deep link applied right after a close must start fresh.
           Deferred out of the initial bundle (prefetched when idle); every open creates a new instance either way. -->
      @defer (when wizardOpen(); prefetch on idle) {
        @for (session of [wizardSession()]; track session) {
          <ptah-provider-setup-wizard
            [open]="true"
            [deepLinkProviderId]="wizardProviderId()"
            [offeredProviderSessionIds]="offeredProviderSessionIds()"
            [existingCredentialPresent]="wizardCredentialStored()"
            [verifyDraftConnection]="verifyDraftConnection"
            [cancelDraftVerification]="cancelDraftVerification"
            [supportedSaveTargets]="globalTarget"
            [workspaceName]="workspaceName()"
            [mainRouteExists]="mainRouteExists()"
            [defaultsResolvable]="wizardDefaults()"
            [providersWithDefaults]="providersWithDefaults()"
            [connectedProviderIds]="connectedProviderIds()"
            [connectionsStatus]="catalogStatus()"
            [saving]="saving()"
            (retryConnectionsRequested)="state.refreshConnections()"
            (signInShortcut)="wizardSignInShortcut($event)"
            [externalAuth]="wizardExternalAuth()"
            [externalMessage]="state.externalAuth().data?.message ?? null"
            [signInProgress]="wizardSignInProgress()"
            [initialSetup]="
              state.connectionSetup().status === 'ready'
                ? state.connectionSetup().data
                : null
            "
            [contextChanged]="wizardContextChanged()"
            [commitDetail]="wizardCommitDetail()"
            (providerChanged)="selectWizardProvider($event)"
            (reviewContextRequested)="reviewWizardContext()"
            [commitState]="wizardCommitState()"
            (commitRequested)="commitWizard($event)"
            (closed)="closeWizard()"
            (externalActionRequested)="
              externalAction($event.providerId, $event.action)
            "
          />
        }
      } @error {
        <!-- The wizard's chunk did not load: say so and let the user close it, which also releases a pending deep link
             (m-2). Opening setup again creates a new deferred block, which retries the load. -->
        <div
          role="alert"
          [class]="readError"
          data-testid="provider-wizard-load-error"
        >
          <p class="min-w-0">
            The setup wizard could not be loaded. Close this message and try
            again.
          </p>
          <button
            type="button"
            [class]="retryControl"
            (click)="closeWizard()"
            data-testid="provider-wizard-load-error-close"
          >
            Close
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host-context([data-glass='on'])
      [data-testid='providers-main-connections-card'] {
      padding: 1.25rem;
    }
  `,
})
export class ProvidersSettingsComponent implements OnInit, OnDestroy {
  readonly requestedProviderId = input<string>('');
  /** Emitted once the wizard was opened for {@link requestedProviderId}. */
  readonly requestedProviderConsumed = output<string>();
  readonly focusTarget = input<ProvidersSettingsFocusTarget | null>(null);
  readonly focusTargetConsumed = output<void>();
  /** Opens the requested connection drawer once the connection list is ready (Electron only: Accounts is D34). */
  readonly requestedDrawer = input<ProvidersSettingsDrawerRequest | null>(null);
  readonly requestedDrawerConsumed = output<void>();
  protected readonly codexConnectionPresent = computed(
    () =>
      this.state
        .connections()
        .data?.some((connection) => connection.id === 'openai-codex') ?? false,
  );
  protected readonly state = inject(ProvidersSettingsStateService);
  /** Accounts is Electron only (D34): elsewhere the drawer tab is absent and the account reads never run. */
  protected readonly accountsAvailable = inject(VSCodeService).isElectron;
  private readonly accounts = this.accountsAvailable
    ? inject(ProviderAccountsStateService)
    : null;
  private readonly ambient = this.accountsAvailable
    ? inject(ClaudeAmbientStatusService)
    : null;
  /** Claude CLI card badge (D41, P5-D13): `null` hides it while either read is loading, failed or not ready. */
  protected readonly connectedAccounts = computed<number | null>(() =>
    this.accounts && this.ambient
      ? connectedAccountCount(
          this.accounts.state('claude')(),
          this.ambient.view(),
        )
      : null,
  );
  /** Provider-session connections the host reports (the state lists one only with its status row). */
  protected readonly offeredProviderSessionIds = computed(() =>
    (this.state.connections().data ?? [])
      .map((connection) => connection.id)
      .filter((id) => isProviderSessionProviderId(id)),
  );
  /** The Claude CLI connection; a provider session (Antigravity) shares the `cli` auth mode but not Claude accounts. */
  protected isClaudeCli(connection: ProvidersConnection): boolean {
    return (
      connectionKind(connection) === 'claude-cli' &&
      !isProviderSessionProviderId(connection.id)
    );
  }
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly control = CONTROL;
  protected readonly globalTarget: readonly SettingScope[] = ['global'];
  /** D16 badges of the Main Agent node, in field order: model, effort, authentication, provider (Batch 52.3). */
  protected readonly mainScopeFields = computed<readonly MainAgentScopeField[]>(
    () => {
      const sources = this.state.mainSources(),
        saving = this.saving();
      const field = (
        key: string,
        fieldName: string,
        shortFieldName: string,
        entry: MainAgentScopeField['entry'] | null | undefined,
        disabled: boolean,
        fallbackValueLabel: string | null = null,
      ): MainAgentScopeField[] =>
        entry
          ? [
              {
                key,
                fieldName,
                shortFieldName,
                entry,
                supportedTargets: this.state.writeScopes(key),
                fallbackValueLabel,
                disabled,
              },
            ]
          : [];
      const valuesBusy = saving || sources.status !== 'ready',
        scopesBusy = saving || this.state.scopes().status !== 'ready';
      const model = sources.data?.model,
        effort = sources.data?.effort,
        auth = this.state.scopeEntry('authMethod');
      return [
        ...field(
          model?.key ?? '',
          'Main agent model',
          'Model',
          model,
          valuesBusy,
        ),
        ...field(
          effort?.key ?? '',
          'Reasoning effort',
          'Effort',
          effort,
          valuesBusy,
        ),
        ...field(
          'authMethod',
          'Main agent authentication',
          'Authentication',
          auth,
          scopesBusy,
          auth ? this.authenticationLabel(auth.fallbackPreview?.value) : null,
        ),
        ...field(
          'anthropicProviderId',
          'Main agent provider',
          'Provider',
          this.state.scopeEntry('anthropicProviderId'),
          scopesBusy,
        ),
      ];
    },
  );
  protected readonly focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
  protected readonly catalogHintOpen = signal(false);
  protected readonly toggle = (open: boolean): boolean => !open;
  protected readonly wizardOpen = signal(false);
  protected readonly wizardProviderId = signal('');
  /** Incremented per openWizard: keys the wizard instance so every setup session starts from a clean draft. */
  protected readonly wizardSession = signal(0);
  protected readonly wizardCommitState = signal<WizardCommitState>('idle');
  /** The open Main Agent popover: a provider preselected by a card, and a deep-linked control to focus. */
  protected readonly mainPopover = signal<{
    focus: MainAgentFocus | null;
  } | null>(null);
  protected readonly clearKey = signal<string | null>(null);
  protected readonly clearTarget = signal<'nearest' | 'all-above-global'>(
    'nearest',
  );
  /** The page toast: this page's own outcomes (setup, clear override) go there, never inline. */
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private focusedTarget: ProvidersSettingsFocusTarget | null = null;
  private lastInputFocus: ProvidersSettingsFocusTarget | null = null;
  private clearContext: ProvidersEditContext | null = null;
  private readonly wizardContext = signal<ProvidersEditContext | null>(null);
  private readonly selectedWizardProvider = signal('');
  protected readonly wizardDefaults = computed(
    () =>
      this.state
        .connections()
        .data?.find((entry) => entry.id === this.selectedWizardProvider())
        ?.defaultsResolvable ?? false,
  );
  /** From auth:getApiKeyStatus (third-party) / auth:getAuthStatus.hasApiKey (Claude API), via connections. */
  protected readonly wizardCredentialStored = computed(
    () =>
      this.state
        .connections()
        .data?.find((entry) => entry.id === this.selectedWizardProvider())
        ?.hasKey === true,
  );
  protected readonly wizardExternalAuth = computed(() => {
    const auth = this.state.externalAuth();
    if (auth.data?.providerId !== this.selectedWizardProvider())
      return {
        signInState: 'idle' as const,
        accountLabel: null,
        cliInstalled: null,
      };
    return {
      ...auth.data,
      signInState:
        auth.status === 'loading'
          ? ('in-flight' as const)
          : auth.status === 'error'
            ? ('failed' as const)
            : auth.data.signInState,
    };
  });
  /** `KIMI_CODE_PROVIDER_ENTRY.id`; a literal keeps `@ptah-extension/shared` a type-only import here. */
  protected readonly kimiCodeId = 'kimi-code';
  /** The in-app sign-in progress belongs to Kimi Code only; any other provider shows none. */
  protected readonly wizardSignInProgress = computed(() =>
    this.selectedWizardProvider() === this.kimiCodeId
      ? this.state.kimiCodeLogin()
      : null,
  );
  /**
   * A Kimi Code sign-in started from a card still runs or failed: the page shows its link and code
   * or its error, unless the Kimi Code drawer or the wizard already shows them.
   */
  protected readonly pageKimiLogin = computed(() => {
    const login = this.state.kimiCodeLogin();
    // `starting`, `awaiting-browser` or `failed`, written as the two other statuses for a smaller main bundle.
    return login &&
      login.status !== 'succeeded' &&
      login.status !== 'cancelled' &&
      this.drawerId() !== this.kimiCodeId &&
      !this.wizardOpen()
      ? login
      : null;
  });
  protected readonly wizardContextChanged = computed(() => {
    const before = this.wizardContext(),
      now = this.state.reviewContext();
    return (
      !!before &&
      (!now ||
        before.scopeKey !== now.scopeKey ||
        before.activePath !== now.activePath)
    );
  });
  protected readonly wizardCommitDetail = computed(() => {
    if (this.wizardCommitState() === 'idle') return '';
    return commitToast(this.state.commit())?.message ?? '';
  });
  private returnFocus: HTMLElement | null = null;
  /** Deep-linked provider handed to the open wizard and not yet accepted by it. */
  private deepLinkAwaitingAcceptance: string | null = null;
  protected readonly saving = computed(
    () => this.state.commit().status === 'saving',
  );
  protected readonly workspaceName = computed(
    () =>
      this.state
        .scopes()
        .data?.activePath?.split(/[\\/]/)
        .filter(Boolean)
        .pop() ?? null,
  );
  protected readonly canStartSetup = computed(
    () =>
      this.state.connections().status === 'ready' &&
      this.state.scopes().status === 'ready' &&
      !this.saving(),
  );
  protected readonly setupBlockReason = computed(() => {
    if (this.state.connections().status !== 'ready') return null;
    const scopes = this.state.scopes().status;
    if (scopes === 'error')
      return 'Setting sources could not be loaded. Your saved settings have not changed.';
    if (scopes !== 'ready') return 'Loading settings…';
    return this.saving() ? 'Wait for the current save to finish.' : null;
  });
  protected readonly setupBlockReasonId = computed(() => {
    const connections = this.state.connections().status;
    if (connections === 'error') return 'provider-setup-connections-error';
    if (connections !== 'ready') return 'provider-setup-connections-loading';
    return this.setupBlockReason() ? 'provider-setup-block-reason' : null;
  });
  protected readonly mainRouteExists = computed(
    () =>
      this.state.route().status === 'ready' &&
      !!this.state.route().data?.driverProviderId &&
      this.state.route().data?.route !== 'unresolved',
  );
  protected readonly activeId = computed(() => {
    const route = this.state.route();
    const id = this.state.activeProviderId();
    return route.status === 'ready' &&
      route.data?.ready &&
      route.data.driverProviderId === id &&
      !this.saving()
      ? id
      : null;
  });
  protected readonly connections = computed(() => {
    const selected = this.state.route().data?.driverProviderId;
    return settingsProviderConnections(
      this.state.connections().data ?? [],
      (entry) =>
        entry.id === selected ||
        (this.accountsAvailable && this.isClaudeCli(entry)),
    )
      .sort(
        (left, right) =>
          Number(right.id === this.activeId()) -
          Number(left.id === this.activeId()),
      );
  });
  protected readonly connectedProviderIds = computed(() => {
    if (this.state.connections().status !== 'ready') return new Set<string>();
    return new Set(
      this.connections()
        .filter((entry) => {
          const status = applyRecordedCheck(
            resolveConnectionState(
              this.connectionStatus(entry),
              this.hasProbeEvidence(entry.id),
              this.activeId() === entry.id,
              this.isBlocked(entry.id),
            ),
            this.lastCheckOf(entry.id),
            this.state.route().data?.probedAt ?? null,
          );
          return status === 'connected' || status === 'active';
        })
        .map((entry) => entry.id),
    );
  });
  protected readonly providersWithDefaults = computed(
    () => new Set(
      (this.state.connections().data ?? [])
        .filter((entry) => entry.defaultsResolvable)
        .map((entry) => entry.id),
    ),
  );
  protected readonly catalog = computed(() => {
    const configured = new Set(this.connections().map((entry) => entry.id));
    return (this.state.connections().data ?? []).filter(
      (entry) => !configured.has(entry.id),
    );
  });
  /** A failed connections read (it includes `provider:listCustomEntries`) is shown in the catalog, never as empty. */
  protected readonly catalogStatus = computed(() => {
    const connections = this.state.connections();
    if (connections.status === 'error') return 'error';
    return connections.status === 'ready' ? 'ready' : 'loading';
  });
  /** The hint strip's sentence: never "0 providers" for a failed or pending read. */
  protected readonly catalogHint = computed(() => {
    const count = this.catalog().length;
    switch (this.catalogStatus()) {
      case 'error':
        return { lead: 'The provider catalog could not be loaded.', names: '' };
      case 'loading':
        return { lead: 'Loading the provider catalog…', names: '' };
      default:
        return count
          ? {
              lead: `${count} catalog provider${count === 1 ? '' : 's'} ready to add:`,
              names: this.catalog()
                .map((entry) => entry.name)
                .join(', '),
            }
          : { lead: 'Every catalog provider is connected.', names: '' };
    }
  });
  /** The connection whose detail drawer is open (the clicked card, `detailsRequested`). */
  private readonly drawerId = signal<string | null>(null);
  /** The card button that opened the drawer; setup opened from the drawer returns focus here. */
  private drawerOpener: HTMLElement | null = null;
  /** The tab the drawer opens on (P6-A10: the main popover's "Sign in" opens the Claude drawer on Accounts). */
  protected readonly drawerTab = signal<ConnectionDrawerTabId>('overview');
  protected readonly drawerConnection = computed(() => {
    const id = this.drawerId();
    return id
      ? (this.state.connections().data?.find((entry) => entry.id === id) ??
          null)
      : null;
  });
  /** Outcome of the drawer's own last write; never an earlier save's (D15). */
  protected readonly drawerCommit = signal<CredentialsCommit | null>(null);
  /** Bumped on every drawer open and close: a write that resolves later publishes to its own session only. */
  private drawerSession = 0;
  /** The connection whose sign-in the drawer started; only that one's progress shows in the drawer. */
  private readonly drawerExternalFor = signal<string | null>(null);
  /** The last loaded route's driver. Survives a save and a not-ready route (broken key), unlike `activeId`. */
  protected readonly knownDriverId = signal<string | null>(null);
  protected readonly drawerExternalAuth = computed<CredentialsExternalAuth>(
    () => {
      const id = this.drawerId(),
        auth = this.state.externalAuth();
      if (!id || this.drawerExternalFor() !== id)
        return { status: 'idle', message: null };
      if (auth.status === 'loading' || auth.status === 'error')
        return { status: auth.status, message: null };
      return {
        status: 'idle',
        message: auth.data?.providerId === id ? auth.data.message : null,
      };
    },
  );
  /** Stored endpoint and main-agent tiers of the open connection (a Replace keeps the tiers as stored). */
  protected readonly credentialsSetup = computed(() => {
    const setup = this.state.connectionSetup();
    return setup.status === 'ready' &&
      setup.data &&
      setup.data.providerId === this.drawerId()
      ? { baseUrl: setup.data.baseUrl, tiers: setup.data.tiers }
      : null;
  });
  /** Who uses each connection. `undefined`/`null` sources mean "not loaded" (see connection-usage.ts). */
  protected readonly usage = computed(() => {
    const route = this.state.route(),
      memory = this.state.memory(),
      enhancement = this.state.enhancement();
    const agents = this.state.cliAgents(),
      clis = this.state.orchestration();
    return connectionUsage({
      mainProviderId:
        route.status !== 'ready'
          ? undefined
          : route.data?.route !== 'unresolved'
            ? (route.data?.driverProviderId ?? null)
            : null,
      curatorProvider:
        memory.status === 'ready' ? (memory.data?.curatorProvider ?? '') : null,
      enhancementProvider:
        enhancement.status === 'ready'
          ? (enhancement.data?.provider ?? '')
          : null,
      cliAgents: agents.status === 'ready' ? agents.data : null,
      // The Codex CLI's detection and on/off state (`agent:getConfig`); "Codex CLI" counts under OpenAI Codex.
      systemClis: clis.status === 'ready' ? clis.data : null,
    });
  });
  /** Read-only view of `usage()` for the cards: the consumer names behind "Used by N", once usage is complete. */
  protected readonly usedByLabels = computed<
    Readonly<Record<string, readonly string[]>>
  >(() => {
    const usage = this.usage();
    if (!usage.complete) return {};
    return Object.fromEntries(
      Object.entries(usage.byProvider).map(([id, users]) => [
        id,
        users.map((user) => user.label),
      ]),
    );
  });
  protected readonly noLabels: readonly string[] = [];
  protected readonly usageError = computed(() =>
    [
      this.state.route(),
      this.state.memory(),
      this.state.enhancement(),
      this.state.cliAgents(),
      this.state.orchestration(),
    ].some((section) => section.status === 'error'),
  );
  /** The Main Agent region's reads other than the route (whose error and Retry live in the Main Agent node). */
  private readonly mainReads = computed(() => [
    {
      id: 'scopes',
      title: 'Setting sources',
      label: 'setting sources',
      state: this.state.scopes(),
      retry: () => this.state.refreshScopes(),
    },
    {
      id: 'model',
      title: 'The main-agent model',
      label: 'main-agent model',
      state: this.state.model(),
      retry: () => this.state.refreshModel(),
    },
    {
      id: 'main-sources',
      title: 'Model and effort sources',
      label: 'model and effort sources',
      state: this.state.mainSources(),
      retry: () => this.state.refreshMainSources(),
    },
    {
      id: 'effort',
      title: 'The main-agent reasoning effort',
      label: 'main-agent reasoning effort',
      state: this.state.effort(),
      retry: () => this.state.refreshEffort(),
    },
  ]);
  /** Failed reads of the Main Agent region, each with its own "Retry {label}" right under the Main agent block. */
  protected readonly mainReadErrors = computed(() =>
    this.mainReads().filter((read) => read.state.status === 'error'),
  );
  protected readonly mainReadsLoading = computed(() =>
    [this.state.route(), ...this.mainReads().map((read) => read.state)].some(
      (section) =>
        section.status === 'loading' || section.status === 'unloaded',
    ),
  );
  protected readonly readError =
    'flex flex-wrap items-center gap-2 rounded-md border border-base-content/10 px-3 py-2 text-sm';
  protected readonly retryControl =
    'btn btn-outline btn-sm border-base-content-muted text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
  /** The Connections header filter: matches the connection name or id, case-insensitive. */
  protected readonly filter = signal('');
  protected readonly shownConnections = computed(() => {
    const query = this.filter().trim().toLowerCase();
    return query
      ? this.connections().filter((entry) =>
          `${entry.name} ${entry.id}`.toLowerCase().includes(query),
        )
      : this.connections();
  });
  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  constructor() {
    effect(() => {
      const route = this.state.route();
      if (route.status === 'ready')
        untracked(() =>
          this.knownDriverId.set(route.data?.driverProviderId ?? null),
        );
    });
    // A connection removed while its drawer is open closes the drawer for good: only a loaded list that
    // no longer holds the id clears it, so a refresh (data kept while loading) leaves the drawer open.
    effect(() => {
      const id = this.drawerId(),
        connections = this.state.connections();
      if (
        !id ||
        connections.status !== 'ready' ||
        connections.data?.some((entry) => entry.id === id)
      )
        return;
      untracked(() => {
        this.drawerId.set(null);
        if (this.drawerOpener?.isConnected) this.drawerOpener.focus();
        this.drawerOpener = null;
      });
    });
    // Deep link (e.g. Tribunal "Configure"): open setup for that provider once setup can start.
    // - While the wizard is open (on any provider) a request stays PENDING and is applied when the
    //   wizard closes; an open draft is never switched away from under the user.
    // - The request is reported consumed only once the wizard has accepted the provider
    //   (see selectWizardProvider), or when that wizard session is dismissed.
    // - The guard is per request: when the parent clears the input, a fresh request for the same
    //   provider opens again, while an unrelated re-render with the same request does not.
    let openedFor = '';
    effect(() => {
      const provider = this.requestedProviderId();
      if (!provider) {
        openedFor = '';
        return;
      }
      if (provider === openedFor || !this.canStartSetup() || this.wizardOpen())
        return;
      openedFor = provider;
      untracked(() => {
        this.deepLinkAwaitingAcceptance = provider;
        this.openWizard(provider);
      });
    });
    // Drawer deep link (onboarding named-account link): open the Claude drawer on the requested tab once the
    // connections are ready. Same per-request guard as above: closing the drawer while the request stays bound does
    // not reopen it; clearing the input and setting it again does. Not Electron: the Accounts tab does not exist.
    let drawerOpenedFor = '';
    effect(() => {
      if (!this.accountsAvailable) return;
      const request = this.requestedDrawer();
      if (!request) {
        drawerOpenedFor = '';
        return;
      }
      const key = `${'providerId' in request ? request.providerId : request.connection}:${request.tab}`;
      if (
        key === drawerOpenedFor ||
        this.state.connections().status !== 'ready'
      )
        return;
      drawerOpenedFor = key;
      untracked(() => {
        const connection = (this.state.connections().data ?? []).find(
          (entry) =>
            'providerId' in request
              ? entry.id === request.providerId
              : this.isClaudeCli(entry),
        );
        if (connection) this.openDrawer(connection.id, request.tab);
      });
    });
    afterRenderEffect(() => {
      if (this.focusTarget() !== this.lastInputFocus) {
        this.lastInputFocus = this.focusTarget();
        this.focusedTarget = null;
      }
      const target = this.focusTarget();
      if (!target || target === this.focusedTarget) return;
      // `main-*` rows land on the Main Agent popover, focused on that control (its own `data-focus`).
      if (
        target === 'main-agent' ||
        target === 'main-model' ||
        target === 'main-effort'
      ) {
        this.focusedTarget = target;
        untracked(() => this.openMainPopover(target));
        return;
      }
      if (target === 'more-providers') {
        if (this.wizardOpen()) return;
        if (!this.canStartSetup()) {
          untracked(() => this.focusConnectProvider());
          return;
        }
        untracked(() => {
          if (!this.openWizard('')) return;
          this.focusedTarget = target;
          this.focusTargetConsumed.emit();
        });
        return;
      }
      const node = this.element.nativeElement.querySelector<HTMLElement>(
        `[data-focus="${target}"]`,
      );
      if (node) {
        node.focus();
        this.focusedTarget = target;
      }
    });
  }
  ngOnInit(): void {
    void this.state.open();
    // D41 / P5-D10: one list read and the cached ambient read, so the card badge can show.
    void this.accounts?.open('claude');
    void this.ambient?.read(false);
  }
  ngOnDestroy(): void {
    if (this.wizardOpen()) {
      void this.state.cancelVerification().catch((error: unknown) => {
        const errorType =
          error instanceof Error ? error.constructor.name : typeof error;
        console.error(
          '[ProvidersSettingsComponent] Cancel verification on destroy failed:',
          errorType,
        );
      });
    }
  }
  protected authenticationLabel(value: unknown): string {
    return value === 'apiKey'
      ? 'API key'
      : value === 'claudeCli'
        ? 'CLI subscription'
        : value === 'thirdParty'
          ? 'Provider connection'
          : 'Host-resolved authentication';
  }
  protected settingLabel(key: string): string {
    return key === 'authMethod'
      ? 'authentication'
      : key === this.state.mainSources().data?.model?.key
        ? 'main agent model'
        : key === this.state.mainSources().data?.effort?.key
          ? 'reasoning effort'
          : 'provider';
  }
  protected connectionStatus(
    entry: ProvidersConnection,
  ): ProviderConnectionCardStatus {
    // Batch 53.2: this connection's own check is running (from its card or its drawer).
    if (this.drawerCheckRunning(entry.id)) return 'checking';
    if (this.activeId() === entry.id) return 'active';
    if (this.state.route().status !== 'ready')
      return this.state.route().status === 'loading'
        ? 'checking'
        : 'check-unavailable';
    return (
      this.state
        .route()
        .data?.providers.find((provider) => provider.id === entry.id)?.status ??
      'not-checked'
    );
  }
  /**
   * The drawer names a failed route read, or a failed check request for this connection, "Check failed"
   * (retryable), not "Check unavailable"; its own running check reads "Checking…".
   */
  protected drawerStatus(entry: ProvidersConnection): OverviewConnectionStatus {
    const check = this.state.connectionCheck();
    const own = check?.providerId === entry.id ? check.status : null;
    if (own === 'checking') return 'checking';
    return this.state.route().status === 'error' || own === 'failed'
      ? 'check-failed'
      : this.connectionStatus(entry);
  }
  /**
   * Batch 53.2 (B38-2): a card's Check connection / Retry checks only its own connection, as the drawer does
   * (`checkProviderConnection`: `auth:checkConnection` for API-key, custom, CLI and sign-in connections, which records
   * `lastCheck`, then the route re-read; local servers and key-optional routes the host cannot check, such as Ollama,
   * LM Studio and Ollama Cloud, get the route re-read alone). While the route itself failed to load, the card reads
   * "Check unavailable" and Retry keeps the full re-read, which is what can repair it. D3: nothing starts while a check
   * or a save runs. The action leaves the card face while it reads "Checking…", so focus moves to its details trigger.
   */
  protected checkFromCard(id: string): void {
    if (this.state.route().status !== 'ready') {
      void this.state.checkConnection();
      return;
    }
    if (this.saving() || this.state.connectionCheck()?.status === 'checking')
      return;
    void this.state.checkProviderConnection(id);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLElement>(
            `ptah-provider-connection-card[data-connection-id="${id}"] [data-testid="provider-card-details-trigger"]`,
          )
          ?.focus(),
      { injector: this.injector },
    );
  }
  protected drawerCheckRunning(id: string): boolean {
    const check = this.state.connectionCheck();
    return check?.providerId === id && check.status === 'checking';
  }
  /** The connection's last recorded check, from the route read (`auth:getEffectiveRoute` `providers[].lastCheck`). */
  protected lastCheckOf(id: string): ConnectionCheckRecord | null {
    return (
      this.state.route().data?.providers.find((provider) => provider.id === id)
        ?.lastCheck ?? null
    );
  }
  /** Per-provider verdict from the effective route; null when the host cannot check it (skipped/unknown). */
  protected hasProbeEvidence(id: string): boolean | null {
    const route = this.state.route();
    if (route.status !== 'ready') return false;
    if (this.isUncheckable(id)) return null;
    const status = route.data?.providers.find(
      (provider) => provider.id === id,
    )?.status;
    return status === 'connected' || status === 'reachable';
  }
  protected isUncheckable(id: string): boolean {
    const status = this.state
      .route()
      .data?.providers.find((provider) => provider.id === id)?.status;
    return status === 'skipped' || status === 'unknown';
  }
  protected isBlocked(id: string): boolean {
    return (
      this.state.route().status === 'ready' &&
      this.state.route().data?.driverProviderId === id &&
      !this.state.route().data?.ready
    );
  }
  protected openDrawer(
    providerId: string,
    tab: ConnectionDrawerTabId = 'overview',
  ): void {
    const active = this.element.nativeElement.ownerDocument.activeElement;
    this.drawerOpener = active instanceof HTMLElement ? active : null;
    // Set with the connection, in one pass: the drawer applies it only when its connection changes.
    this.drawerTab.set(tab);
    this.drawerId.set(providerId);
    this.resetDrawerSession();
    void this.state.refreshConnectionSetup(providerId);
  }
  /**
   * P6-A10 Sign-in route: the main popover's "Sign in" (signed-out stored account) closes the popover and opens the
   * Claude (Subscription) drawer on Accounts. The popover's button leaves the DOM, so the drawer returns focus to the
   * Main Agent node's Reassign button (A-3), else to whatever held focus.
   */
  protected openAccountSignIn(): void {
    const claude = (this.state.connections().data ?? []).find((connection) =>
      this.isClaudeCli(connection),
    );
    this.mainPopover.set(null);
    if (!claude) return;
    this.openDrawer(claude.id, 'accounts');
    const node = this.element.nativeElement.querySelector<HTMLElement>(
      '[data-testid="routing-node-main-agent"] [data-testid="routing-node-action"]',
    );
    if (node) this.drawerOpener = node;
  }
  protected closeDrawer(): void {
    this.drawerId.set(null);
    if (this.requestedDrawer()) this.requestedDrawerConsumed.emit();
    this.resetDrawerSession();
    // D41: the badge re-reads after the drawer (where accounts change) closes; pushes cover the rest.
    void this.accounts?.refresh('claude');
    void this.ambient?.read(false);
  }
  private resetDrawerSession(): void {
    this.drawerSession += 1;
    this.drawerCommit.set(null);
    this.drawerExternalFor.set(null);
  }
  protected connectMissingCodex(): void {
    this.requestedDrawerConsumed.emit();
    this.openWizard('openai-codex');
  }
  protected drawerExternalAction(
    providerId: string,
    action: ProvidersExternalAuthAction,
  ): void {
    this.drawerExternalFor.set(providerId);
    this.externalAction(providerId, action);
  }
  protected deleteKey(providerId: string): Promise<void> {
    return this.drawerWrite((context) =>
      this.state.deleteStoredKey(providerId, context),
    );
  }
  protected signOutCopilot(): Promise<void> {
    return this.drawerWrite((context) => this.state.disconnectCopilot(context));
  }
  /** The drawer builds the verified Replace draft (`replaceKeyDraft`); this only runs the write. */
  protected replaceKey(draft: ProvidersConnectionDraft): Promise<void> {
    return this.drawerWrite((context) =>
      this.state.connectProvider(draft, context),
    );
  }
  /** Runs one drawer write (`runDrawerWrite`); a result that lands after the drawer closed or reopened is dropped. */
  protected drawerWrite(
    write: (context: ProvidersEditContext) => Promise<boolean>,
  ): Promise<void> {
    const session = this.drawerSession;
    return runDrawerWrite(this.state, write, (outcome) => {
      if (session === this.drawerSession) this.drawerCommit.set(outcome);
    });
  }
  /**
   * "Edit in setup" from a drawer tab: close the drawer, put focus back on the card that opened it,
   * then open the wizard, so closing the wizard returns focus to that card too.
   */
  protected setupFromDrawer(providerId: string): void {
    this.closeDrawer();
    if (this.drawerOpener?.isConnected) this.drawerOpener.focus();
    this.openWizard(providerId);
  }
  protected openWizard(providerId: string): boolean {
    if (!providerId) this.focusConnectProvider();
    if (!this.canStartSetup() || this.wizardOpen()) return false;
    this.wizardContext.set(this.state.reviewContext());
    this.returnFocus = this.element.nativeElement.ownerDocument
      .activeElement as HTMLElement | null;
    this.wizardProviderId.set(providerId);
    this.wizardSession.update((session) => session + 1);
    this.wizardCommitState.set('idle');
    this.wizardOpen.set(true);
    return true;
  }
  readonly verifyDraftConnection = async (
    params: AuthVerifyDraftConnectionParams,
  ) => {
    await this.state.verifyDraft(params);
    const result = this.state.verification();
    if (result.status !== 'ready' || result.data?.probeId !== params.probeId)
      throw new Error('Connection check unavailable. Retry.');
    return result.data;
  };
  readonly cancelDraftVerification = (
    params: AuthCancelDraftVerificationParams,
  ) => this.state.cancelVerification(params);
  protected async commitWizard(draft: ProviderWizardCommit): Promise<void> {
    const context = this.wizardContext();
    if (!context || this.saving() || this.wizardContextChanged()) return;
    this.wizardCommitState.set('saving');
    await this.state.connectProvider(draft, context);
    const confirmed =
      this.state.commit().status === 'saved' &&
      [this.state.route(), this.state.connections(), this.state.scopes()].every(
        (section) => section.status === 'ready',
      );
    this.wizardCommitState.set(confirmed ? 'saved' : 'failed');
    // m2 (Providers 21-28 review): a new or re-set connection must be visible; old filter text could hide it.
    if (confirmed) this.filter.set('');
    // One toast for the whole commit: the fields it saved, did not save and could not confirm.
    if (confirmed)
      this.feedback.announce(
        'Connection settings saved and refreshed.',
        'status',
      );
    else
      this.feedback.announce(
        [
          'Some connection settings were not confirmed.',
          commitToast(this.state.commit())?.message,
        ]
          .filter(Boolean)
          .join(' '),
        'alert',
      );
  }
  protected selectWizardProvider(providerId: string): void {
    this.selectedWizardProvider.set(providerId);
    if (!providerId) return;
    if (providerId === this.deepLinkAwaitingAcceptance) this.consumeDeepLink();
    void this.state.refreshConnectionSetup(providerId);
    const connection = this.state
      .connections()
      .data?.find((entry) => entry.id === providerId);
    if (connection?.authMode === 'oauth' || connection?.authMode === 'cli')
      this.externalAction(providerId, 'cli-check');
  }
  protected async reviewWizardContext(): Promise<void> {
    await this.state.refreshScopes();
    this.wizardContext.set(this.state.reviewContext());
    this.wizardCommitState.set('idle');
  }
  /** One-shot: the parent clears the request so a re-mounted page does not reopen it. */
  private consumeDeepLink(): void {
    const provider = this.deepLinkAwaitingAcceptance;
    if (!provider) return;
    this.deepLinkAwaitingAcceptance = null;
    this.requestedProviderConsumed.emit(provider);
  }
  protected closeWizard(announceClose = true): void {
    // A deep link the wizard could not select (e.g. an unknown id) is still handled once dismissed.
    this.consumeDeepLink();
    this.wizardOpen.set(false);
    this.wizardContext.set(null);
    // A saved setup already said so when it committed.
    if (announceClose && this.wizardCommitState() !== 'saved')
      this.feedback.announce(
        'Setup closed. External sign-in, if completed, remains available.',
        'status',
      );
    void this.state.cancelVerification().catch((error: unknown) => {
      const errorType =
        error instanceof Error ? error.constructor.name : typeof error;
      console.error(
        '[ProvidersSettingsComponent] Cancel verification on wizard close failed:',
        errorType,
      );
    });
    this.returnFocus?.focus();
  }
  protected externalAction(
    providerId: string | null,
    action: ProvidersExternalAuthAction,
  ): void {
    void this.state.performExternalAuth(providerId, action);
  }
  private focusConnectProvider(): void {
    this.element.nativeElement
      .querySelector<HTMLButtonElement>('[data-focus="more-providers"]')
      ?.focus();
  }
  protected retryProviderConnections(event: MouseEvent): void {
    if (event.currentTarget === this.element.nativeElement.ownerDocument.activeElement) {
      this.focusConnectProvider();
    }
    void this.state.refreshConnections();
  }
  protected wizardSignInShortcut(providerId: string): void {
    if (this.saving()) return;
    this.closeWizard(false);
    this.externalAction(providerId, 'sign-in');
  }
  /** Opens the Main Agent popover (the node's "Reassign", a `main-*` deep link focused on that control). */
  protected openMainPopover(focus: MainAgentFocus | null = null): void {
    this.mainPopover.set({ focus });
  }
  /** D6: clearing these keys resets the SDK on the host (`config-scope-rpc.handlers.ts:120-145`). */
  protected clearEndsSessions(key: string): boolean {
    return (
      key === 'authMethod' ||
      key === 'anthropicProviderId' ||
      key.startsWith('provider.')
    );
  }
  protected reviewClear(
    key: string,
    target: 'nearest' | 'all-above-global' = 'nearest',
  ): void {
    this.clearContext = this.state.reviewContext();
    this.clearKey.set(key);
    this.clearTarget.set(target);
  }
  protected async clearOverride(): Promise<void> {
    const key = this.clearKey();
    if (!key || !this.clearContext) return;
    await this.state.clearScopeOverride(
      key,
      this.clearTarget(),
      this.clearContext,
    );
    const commit = this.state.commit();
    if (commit.status === 'saved') this.clearKey.set(null);
    const said = commitToast(commit);
    if (said) this.feedback.announce(said.message, said.tone);
  }
}
