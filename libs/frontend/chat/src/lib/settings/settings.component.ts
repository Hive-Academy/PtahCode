import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
  signal,
  OnInit,
  effect,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  LucideAngularModule,
  ArrowLeft,
  Plug,
  Layers,
  TableProperties,
  SlidersHorizontal,
  AudioLines,
  Wrench,
  ShieldCheck,
} from 'lucide-angular';
import {
  MotionStageDirective,
  PROVIDER_MODELS_LOADER,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahSettingsLayoutComponent,
  PtahDescriptionListComponent,
  PtahStatusComponent,
  PtahStatePanelComponent,
  PtahSkeletonComponent,
} from '@ptah-extension/ui';
// Two declarations on purpose: each component import must hold only the `@defer`-only class, or
// Angular keeps the whole tab (Providers with its named-accounts UI and agents routing, Context Management) in the eager chunk.
import { ProvidersSettingsComponent } from './providers/providers-settings.component';
import type {
  ProvidersSettingsDrawerRequest,
  ProvidersSettingsFocusTarget,
} from './providers/providers-settings.component';
import { ProvidersModelsLoader } from './providers/providers-models-loader.service';
import { SettingsSaveFeedbackService } from './feedback/settings-save-feedback.service';
import { SettingsToastComponent } from './feedback/settings-toast.component';
import { AgentsRoutingSettingsComponent } from './providers/agents-routing-settings.component';
import type { AgentsRoutingFocusTarget } from './providers/agents-routing-settings.component';
import { OrchestrationSettingsComponent } from './ptah-ai/orchestration-settings.component';
import { DecisionMatrixPageComponent } from './ptah-ai/decision-matrix-page.component';
import { AdvancedSettingsComponent } from './advanced-settings.component';
import { SearchVoiceSettingsComponent } from './search-voice-settings.component';
import {
  AppStateManager,
  AuthStateService,
  ProvidersSettingsStateService,
  VSCodeService,
  type PendingSettingsTab,
} from '@ptah-extension/core';

type PendingSection = NonNullable<PendingSettingsTab['section']>;

const PROVIDERS_SECTIONS: ReadonlySet<string> =
  new Set<ProvidersSettingsFocusTarget>([
    'main-agent',
    'main-model',
    'main-effort',
    'connections',
    'more-providers',
  ]);
/** The CLI matrix and the background roles: on the Providers tab, below the Main agent and Connections. */
const AGENTS_ROUTING_SECTIONS: ReadonlySet<string> =
  new Set<AgentsRoutingFocusTarget>([
    'background-models',
    'cli-agents',
    'memory-curator',
    'enhancement',
  ]);

const isProvidersSection = (
  section: PendingSection | undefined,
): section is ProvidersSettingsFocusTarget =>
  section !== undefined && PROVIDERS_SECTIONS.has(section);
const isAgentsRoutingSection = (
  section: PendingSection | undefined,
): section is AgentsRoutingFocusTarget =>
  section !== undefined && AGENTS_ROUTING_SECTIONS.has(section);

/**
 * SettingsComponent - Main settings page container
 *
 * Complexity Level: 2 (Container with visibility logic based on auth status)
 * Patterns: conditional rendering
 *
 * Reached as the `settings` ROUTE (`apps/ptah-extension-webview/src/app/app.routes.ts`),
 * eagerly rather than lazily: `initialView: 'settings'` is startup-reachable
 * and the boot auth check navigates here when no credential is configured.
 * Its own "back" button goes through `AppStateManager.setCurrentView('chat')`,
 * which is a Router navigation (TASK_2026_524 batch 1 — the old
 * "signal-based navigation" this comment described is gone).
 *
 * Responsibilities:
 * - Display settings page header with back navigation
 * - Container for settings sections (authentication, model selection, autopilot)
 * - Navigate back to chat view on back button click
 * - Conditional visibility: Show additional sections only after auth configured
 *
 * Child Components:
 * - ProvidersSettingsComponent + AgentsRoutingSettingsComponent: Providers tab (Main agent, Connections, then the
 *   CLI matrix and the background model roles)
 * - OrchestrationSettingsComponent: Context Management tab (tab id `orchestration`: subagent cache TTL, session
 *   budget, lane guards, context budgets, Codex agents, background queries)
 * - AdvancedSettingsComponent: Advanced tab (membership, data portability, agent behaviour, MCP, VS Code LM)
 * - SearchVoiceSettingsComponent: Search & Voice tab (web search, voice, go vet consent)
 *
 * Deep links (`AppStateManager.requestSettingsTab`) are routed by section to the tab that owns
 * it, whatever tab the caller named (implementation-plan.md Component 10); an unknown or missing
 * section opens the requested tab. See `applyPendingTab`.
 */
@Component({
  selector: 'ptah-settings',
  standalone: true,
  imports: [
    // Used only inside `@defer` in the template, so each tab compiles to its own lazy chunk.
    // Referencing any of these classes anywhere else in this file would make it eager again.
    ProvidersSettingsComponent,
    AgentsRoutingSettingsComponent,
    OrchestrationSettingsComponent,
    DecisionMatrixPageComponent,
    AdvancedSettingsComponent,
    SearchVoiceSettingsComponent,
    SettingsToastComponent,
    LucideAngularModule,
    MotionStageDirective,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahSettingsLayoutComponent,
    PtahDescriptionListComponent,
    PtahStatusComponent,
    PtahStatePanelComponent,
    PtahSkeletonComponent,
  ],
  // Page-scoped: the toast timer dies with the page; one models loader for every tab.
  providers: [
    SettingsSaveFeedbackService,
    { provide: PROVIDER_MODELS_LOADER, useClass: ProvidersModelsLoader },
  ],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Glass (data-glass on, any theme): the page plane clears like the other shell pages, so the blurred chrome
  // pane and its scene show behind the settings layout. Light and dark keep the solid surface-0 plane.
  styles: `
    :host-context([data-glass='on']) .settings-page {
      background-color: transparent;
    }
    /* The Setup section is a glass card like the Advanced sections above it (same inset as theirs). */
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class SettingsComponent implements OnInit {
  private readonly appState = inject(AppStateManager);
  private readonly vscodeService = inject(VSCodeService);
  private readonly providersState = inject(ProvidersSettingsStateService);
  readonly authState = inject(AuthStateService);
  private readonly document = inject(DOCUMENT);
  readonly ArrowLeftIcon = ArrowLeft;
  readonly SetupIcon = Wrench;
  readonly SecurityIcon = ShieldCheck;
  /** Card tabs, in order. Each label is the button's exact accessible name (live-app scripts use it). */
  readonly settingsTabs = [
    { id: 'claude-auth', label: 'Providers', icon: Plug },
    { id: 'orchestration', label: 'Context Management', icon: Layers },
    ...(this.vscodeService.isElectron
      ? ([
          {
            id: 'matrix',
            label: 'Decision matrix',
            icon: TableProperties,
            parent: 'orchestration',
          },
        ] as const)
      : []),
    { id: 'pro-features', label: 'Advanced', icon: SlidersHorizontal },
    { id: 'tools', label: 'Search & Voice', icon: AudioLines },
  ] as const;
  readonly activeSettingsTab = signal<
    | 'providers'
    | 'claude-auth'
    | 'orchestration'
    | 'matrix'
    | 'pro-features'
    | 'tools'
  >('claude-auth');
  readonly selectedSettingsTab = computed(() =>
    this.activeSettingsTab() === 'providers'
      ? 'claude-auth'
      : this.activeSettingsTab(),
  );
  readonly activeTabTitle = computed(
    () =>
      this.settingsTabs.find((tab) => tab.id === this.selectedSettingsTab())
        ?.label ?? 'Providers',
  );
  readonly activeTabDescription = computed(
    () =>
      ({
        providers:
          'Choose which models and CLI agents do the work, and in which order lanes run.',
        'claude-auth':
          'Choose which models and CLI agents do the work, and in which order lanes run.',
        orchestration:
          'Limits that keep chats and lanes inside your budget and plan limits.',
        matrix: 'Routing suggestions, executor rotation and the ratings behind them.',
        'pro-features':
          'Membership, agent behaviour, the MCP server, tools and setup.',
        tools: 'Web search providers, voice engines and workspace checks.',
      })[this.selectedSettingsTab()],
  );
  readonly contextRows = computed(() => [
    ...(this.workspaceName()
      ? [{ key: 'workspace', term: 'Workspace', value: this.workspaceName() }]
      : []),
    { key: 'app', term: 'App', value: this.appLabel },
  ]);
  readonly settingsTabIndex = computed(() =>
    this.settingsTabs.findIndex((tab) => tab.id === this.selectedSettingsTab()),
  );

  readonly providersTarget = signal<ProvidersSettingsFocusTarget | null>(null);
  /** Focus target for the CLI matrix / background roles part of the Providers tab. */
  readonly agentsRoutingTarget = signal<AgentsRoutingFocusTarget | null>(null);

  /**
   * Provider id carried by a deep-link into the settings page (e.g. the
   * tribunal panel's "Configure" action). Forwarded to ProvidersSettingsComponent,
   * which opens the setup wizard for that provider.
   */
  readonly requestedProviderId = signal<string | undefined>(undefined);
  readonly requestedDrawer = signal<ProvidersSettingsDrawerRequest | null>(
    null,
  );

  openCodexSettings(): void {
    this.setActiveTab('providers');
    this.requestedDrawer.set(
      this.isElectron
        ? { providerId: 'openai-codex', tab: 'credentials' }
        : null,
    );
  }

  readonly isElectron = this.vscodeService.isElectron;
  /** Header "App: …" label. */
  readonly appLabel = this.isElectron ? 'Desktop' : 'VS Code';

  runOnboardingAgain(): void {
    this.appState.setCurrentView('onboarding');
  }

  checkClaudeCode(): void {
    if (this.isElectron) this.appState.openOnboardingReady();
  }
  /** Header workspace path (full, for `title`); null until setting sources load or with no folder open. */
  readonly workspacePath = computed(
    () => this.providersState.scopes().data?.activePath ?? null,
  );
  readonly workspaceName = computed(
    () => this.workspacePath()?.split(/[\\/]/).filter(Boolean).pop() ?? null,
  );

  /**
   * Initialize: Load auth status on component mount.
   * Auth status is loaded via AuthStateService.
   */
  constructor() {
    // A request raised while Settings is already open (e.g. the connection
    // drawer's role link, or a role's provider setup) never re-runs ngOnInit, so react to it here.
    effect(() => {
      if (this.appState.pendingSettingsTab())
        untracked(() => this.applyPendingTab());
    });
  }

  async ngOnInit(): Promise<void> {
    this.applyPendingTab();
    await this.authState.loadAuthStatus();
  }

  /**
   * The Providers page opened the wizard for the deep-linked provider: consume
   * the request (like `consumePendingSettingsTab`) so leaving and returning to
   * the Providers tab does not reopen it.
   */
  consumeRequestedProvider(providerId: string): void {
    if (this.requestedProviderId() === providerId)
      this.requestedProviderId.set(undefined);
  }

  /**
   * The one routing table for deep links (implementation-plan.md Component 10). The section decides the tab, not the
   * caller's `tab`: Providers sections and every `providerId` land on Providers; `cli-agents`, `background-models` and
   * the role ids land on Providers too, where `AgentsRoutingSettingsComponent` focuses the CLI matrix table
   * (`[data-testid="cli-matrix"]`) or opens the background roles. Callers that still name `tab: 'orchestration'` for
   * those sections keep working unchanged.
   */
  private applyPendingTab(): void {
    const pending = this.appState.consumePendingSettingsTab();
    if (!pending) return;
    const { section, providerId } = pending;
    this.requestedProviderId.set(providerId);
    if (providerId || isProvidersSection(section)) {
      this.setActiveTab('providers');
      this.providersTarget.set(isProvidersSection(section) ? section : null);
      this.agentsRoutingTarget.set(null);
    } else if (
      this.isElectron &&
      (section === 'capability-matrix' ||
        section === 'decision-matrix' ||
        section === 'host-routing' ||
        section === 'routing-suggestions' ||
        section === 'lane-rotation' ||
        section === 'matrix')
    ) {
      this.setActiveTab('matrix');
      this.providersTarget.set(null);
      this.agentsRoutingTarget.set(null);
    } else if (isAgentsRoutingSection(section)) {
      this.setActiveTab('providers');
      this.agentsRoutingTarget.set(section);
      this.providersTarget.set(null);
    } else {
      this.setActiveTab(pending.tab);
      this.providersTarget.set(null);
      this.agentsRoutingTarget.set(null);
    }
  }

  /**
   * Switch active settings tab
   */
  setActiveTab(
    tab:
      | 'providers'
      | 'claude-auth'
      | 'orchestration'
      | 'matrix'
      | 'pro-features'
      | 'tools',
  ): void {
    const next = tab === 'providers' ? 'claude-auth' : tab;
    if (next !== 'claude-auth') this.requestedDrawer.set(null);
    if (next !== this.activeSettingsTab()) {
      // A deep-link target belongs to the visit it opened: a tab is torn down when left and rebuilt on return, and a
      // kept target would re-open the roles (or a role's popover) and take focus again (Batch 35 revise, R3).
      // applyPendingTab sets the new target after this call.
      this.providersTarget.set(null);
      this.agentsRoutingTarget.set(null);
    }
    this.activeSettingsTab.set(next);
  }

  /**
   * Navigate back to chat view
   */
  backToChat(): void {
    this.appState.setCurrentView('chat');
  }

  /**
   * Recovery for a Providers chunk that failed to load. Angular and the module
   * loader cache the failure, so reopening Settings would fail again; a reload
   * restarts the renderer instead (as electron-shell's welcome screen does).
   */
  reloadWindow(): void {
    this.document.defaultView?.location.reload();
  }

  /**
   * A VS Code LM model change can change which CLIs are usable (#84). Re-detect through the
   * shared state: the Providers tab (which holds the CLI matrix) is never mounted while Advanced is shown.
   */
  onModelChanged(): void {
    void this.providersState.redetectClis();
  }
}
