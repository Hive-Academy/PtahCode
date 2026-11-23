import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  compactSessionMetrics,
  limitAwareDot,
  sdkContribution,
  sessionTotal,
  InspectorLimitsLanesComponent,
  InspectorLinkedSessionsComponent,
  InspectorSessionStatsComponent,
  type SessionStatsInputs,
  type SessionLimitSummary,
} from '@ptah-extension/chat-ui';
import { SessionId } from '@ptah-extension/shared';
import { LucideAngularModule, PanelRightClose } from 'lucide-angular';
import {
  HandoffChainClient,
  InspectorShellController,
  SessionInspectorStore,
} from '../../../services/session-inspector';
import { SessionRowActionsService } from '../../../services/session-list/session-row-actions.service';
import { injectInspectorAgentRows, type InspectorAgentRows } from './inspector-agent-rows';
import { InspectorAgentsSectionComponent } from './inspector-agents-section.component';
import { InspectorGitSectionComponent } from './inspector-git-section.component';
import { InspectorSessionActionsComponent } from './inspector-session-actions.component';
import { InspectorRequestLinesComponent } from './inspector-request-panel.component';
import { InspectorTaskSectionComponent } from './inspector-task-section.component';

import { PtahIconButtonDirective } from '@ptah-extension/ui';
/** Where the inspector body is shown; `sheet` is the modal overlay band. */
export type SessionInspectorPresentation =
  'docked' | 'sheet' | 'embedded' | 'rail';
type InspectorFocusSection = 'session' | 'agents' | 'orchestrator' | 'limits' | 'attention';

const FOCUS_TARGETS: Record<Exclude<InspectorFocusSection, 'attention'>, string> = {
  session: '[data-active-session-stats] [data-inspector-section="session"] h3',
  agents: '[data-inspector-section="agents"] h3',
  orchestrator: '[data-agent-key="orchestrator"]',
  limits: '[data-inspector-section="limits"] h3',
};

function statsSwitchWindowMs(element: HTMLElement): number {
  const value = typeof getComputedStyle === 'function'
    ? getComputedStyle(element).getPropertyValue('--ptah-motion-switch').trim()
    : '';
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value);
  const durationMs = match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : 380;
  return durationMs + 40;
}

/**
 * `ptah-session-inspector`: the "This session" body (design 4, D45). One
 * component serves the chat-view (docked or sheet) and the Rail board aside;
 * hosts load it only inside `@defer`, so its sections stay a lazy chunk.
 *
 * Section order (D45, rev 3 "B+"): Orchestrator requests, the projected
 * `[inspectorSection]` add-on slot (no wrapper, so an empty slot leaves no
 * box), SESSION totals (when `stats`), AGENTS (every agent, the selected row
 * expanded in place), PLAN LIMITS + LANES (when `stats.limits`), TASK,
 * GIT. Rows carry `st-r` + `--i` for the entry stagger; the CSS
 * caps the index at 6.
 */
@Component({
  selector: 'ptah-session-inspector',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    InspectorRequestLinesComponent,
    InspectorSessionStatsComponent,
    InspectorLinkedSessionsComponent,
    InspectorAgentsSectionComponent,
    InspectorLimitsLanesComponent,
    InspectorTaskSectionComponent,
    InspectorGitSectionComponent,
    InspectorSessionActionsComponent,
    PtahIconButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './session-inspector.component.html',
  // Glass on: docked, the inspector sits in a chrome pane (the Stats dock),
  // so it stays clear and the pane's blur shows. The sheet and the 56 px
  // rail strip (no glass pane behind it) keep their fill.
  styles: `
    :host-context([data-glass='on']) aside[data-inspector-pane] {
      background: transparent;
    }
    .inspector-stats-switch { position: relative; }
    .inspector-stats-leave {
      position: absolute;
      inset: 0;
      pointer-events: none;
      animation: ptahMotionLeave var(--ptah-motion-out) var(--ptah-ease-gentle-in) forwards;
    }
    .inspector-stats-enter {
      animation: ptahMotionEnter var(--ptah-motion-switch) var(--ptah-ease-soft) backwards;
    }
    :host-context([data-glass='on']) .inspector-stats-enter {
      animation-name: ptahMotionEnterGlass;
    }
    :host-context([data-glass='on'][data-motion-style='fade']) .inspector-stats-enter {
      --ptah-motion-enter-y: 18px;
    }
    :host-context([data-glass='on'][data-motion-style='scale']) .inspector-stats-enter {
      --ptah-motion-enter-y: 6px;
    }
    :host-context([data-glass='on']) .inspector-stats-leave {
      animation: none;
      display: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .inspector-stats-leave { display: none; }
      .inspector-stats-enter {
        animation: none;
      }
    }
  `,
})
export class SessionInspectorComponent {
  private readonly store = inject(SessionInspectorStore);
  private readonly handoffChain = inject(HandoffChainClient);
  private readonly rowActions = inject(SessionRowActionsService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Provided by the chat-view host only; the Rail board has no sheet. */
  private readonly shell = inject(InspectorShellController, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private statsSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly leavingModel = signal<ReturnType<typeof this.sessionModel> | null>(null);
  protected readonly statsSwitching = signal(false);

  readonly tabId = input.required<string>();
  readonly presentation = input<SessionInspectorPresentation>('docked');
  /** The host has a lane surface (Rail board): agent rows open lanes. */
  readonly hasLaneSurface = input<boolean>(false);
  /** Canvas selection; undefined retains standalone selection, null clears it. */
  readonly selectedAgentKey = input<string | null>();
  /** Session stats of the shown view; `null` hides SESSION / PLAN LIMITS / LANES. */
  readonly stats = input<SessionStatsInputs | null>(null);
  readonly limitSummary = input<SessionLimitSummary | null>();
  readonly sessionTitle = input('');
  readonly sessionStatus = input('');
  readonly running = input(false);
  readonly workflow = input<string | null>(null);
  readonly branch = input<string | null>(null);
  /** Host can retain this across a rail -> dock/sheet remount. */
  readonly focusSection = input<InspectorFocusSection | null>(null);

  readonly closeRequested = output<void>();
  readonly expandRequested = output<InspectorFocusSection | undefined>();
  /** "Open thread" on an agent row: show that agent's lane. */
  readonly laneRequested = output<string>();
  /** An AGENTS row was selected (or the selected key was normalized). */
  readonly agentSelected = output<string>();
  readonly answerRequested = output<string>();

  protected readonly PanelRightCloseIcon = PanelRightClose;

  /** Polite live region shared by request outcomes and session changes. */
  protected readonly announcement = signal('');

  private readonly closeButton =
    viewChild<ElementRef<HTMLElement>>('closeButton');
  private readonly expandButton =
    viewChild<ElementRef<HTMLButtonElement>>('expandButton');

  protected readonly railLimitSummary = computed(
    () => this.limitSummary() ?? this.stats()?.limitSummary ?? null,
  );
  protected readonly railLimitDot = computed(() =>
    limitAwareDot(null, false, this.railLimitSummary()),
  );
  protected readonly railLimitDescription = computed(() =>
    this.railLimitDot() ? (this.railLimitSummary()?.fullText ?? '') : '',
  );
  protected readonly expandLabel = computed(() =>
    this.railLimitDescription()
      ? `Expand session details; ${this.railLimitDescription()}`
      : 'Expand session details',
  );
  protected readonly railMetrics = computed(() => {
    const stats = this.stats();
    if (!stats) return [];
    const warning = this.railLimitDescription();
    return compactSessionMetrics(stats, this.totals()).map((metric) => ({
      ...metric,
      target: metric.id === 'context' ? 'orchestrator' as const : 'session' as const,
      ariaLabel: metric.id === 'context' && warning
        ? `${metric.ariaLabel}; ${warning}`
        : metric.ariaLabel,
    }));
  });
  protected readonly runLabel = computed(() => {
    const model = this.model();
    const count = this.inspectorAgentRows.captionCounts().running;
    return `${count == null ? 'Running agents unavailable' : `Running agents: ${count}`}; ${model.needsYouCount} need you`;
  });

  /** Uncached input and output tokens of the session. */
  protected readonly sessionTokens = computed(() => {
    const tokens = this.stats()?.snapshot?.tokens;
    return tokens
      ? {
          input: tokens.input,
          output: tokens.output,
        }
      : null;
  });

  protected readonly model = computed(() =>
    this.store.modelFor(this.tabId())(),
  );

  private readonly sessionId = computed(() => this.stats()?.sessionId ?? this.model().sessionId);
  protected readonly laneRuns = computed(() => this.stats()?.limits?.inspectorRuns ?? []);
  private readonly projection = injectInspectorAgentRows(this.tabId, this.sessionId, this.laneRuns);
  private readonly cliContributions = computed(() =>
    this.projection.contributions().filter((entry) => entry.source === 'cli'),
  );
  private readonly totals = computed(() => {
    const snapshot = this.stats()?.snapshot ?? null;
    const sdk = sdkContribution(snapshot);
    // A pending SDK read is not evidence of missing usage. Wait to show a whole-session figure.
    const usage = snapshot ? [sdk, ...this.cliContributions()] : [sdk];
    const coverage = this.projection.cliCoverage();
    return {
      tokens: sessionTotal(usage, coverage.tokens, 'tokens'),
      cost: sessionTotal(usage, coverage.cost, 'cost'),
    };
  });
  protected readonly inspectorAgentRows: InspectorAgentRows = {
    ...this.projection,
    totals: this.totals,
    rows: computed(() => {
      const rows = this.projection.rows();
      const requests = this.model().orchestrator.requests;
      return requests.length
        ? rows?.map((row) => row.key === 'orchestrator' ? { ...row, requests } : row) ?? null
        : rows;
    }),
  };
  protected readonly agentsSelection = linkedSignal({
    source: () => ({ sessionId: this.sessionId(), key: this.selectedAgentKey() }),
    computation: ({ key }) => key,
  });
  protected readonly sessionModel = computed(() => {
    const stats = this.stats();
    if (!stats) return null;
    const model = this.model();
    const rosterMatches = !stats.sessionId || !model.sessionId || stats.sessionId === model.sessionId;
    const rows = rosterMatches ? this.inspectorAgentRows.rows() : null;
    return {
      stats,
      totals: this.totals(),
      cliContributions: this.cliContributions(),
      turns: rosterMatches ? model.orchestrator.turns : null,
      agentCount: rows?.length ?? null,
      liveAgentCount: rows === null ? null : this.inspectorAgentRows.captionCounts().running,
    };
  });
  protected readonly showAttention = computed(() =>
    this.inspectorAgentRows.rows() !== null && this.model().needsYouCount > 0,
  );
  private readonly attentionKey = computed(() => this.inspectorAgentRows.rows()?.find((row) =>
    row.requests.length > 0 || row.agent.openRequestIds.length > 0 || row.agent.status === 'waiting',
  )?.key);

  /**
   * SDK id whose handoff chain the expanded body lists (TASK_2026_876).
   * Null on the `w-14` rail and before the session id resolves.
   */
  protected readonly linkedSessionId = computed(() =>
    this.presentation() === 'rail' ? null : this.model().sessionId,
  );

  /** Linked sessions, root first; empty leaves the section out of the DOM. */
  protected readonly linkedSessions = computed(() => {
    const sessionId = this.linkedSessionId();
    return sessionId ? this.handoffChain.entriesFor(sessionId)() : [];
  });

  /** AGENTS rows continue the stagger after Orchestrator (+ SESSION). */
  protected readonly agentsStaggerStart = computed(() =>
    this.stats() ? 1 : 0,
  );

  protected readonly afterAgentsIndex = computed(
    () =>
      this.agentsStaggerStart() +
      1 +
      (this.model().agents.data?.rows.length ?? 0),
  );

  constructor() {
    let previousSessionId: string | null = null;
    let previousModel: ReturnType<typeof this.sessionModel> = null;
    effect(() => {
      const current = this.sessionModel();
      if (current === null) {
        if (this.statsSwitchTimer !== null) clearTimeout(this.statsSwitchTimer);
        this.statsSwitchTimer = null;
        this.leavingModel.set(null);
        this.statsSwitching.set(false);
        // Keep the last session snapshot across one empty interval. A new
        // session can then leave from it; the same session does not replay.
        return;
      }
      const sessionId = current.stats.sessionId;
      const changed = previousSessionId !== null &&
        sessionId !== null && sessionId !== previousSessionId;
      if (changed && previousModel) {
        if (this.statsSwitchTimer !== null) clearTimeout(this.statsSwitchTimer);
        this.leavingModel.set(previousModel);
        this.announce('Session changed.');
        this.statsSwitching.set(true);
        this.statsSwitchTimer = setTimeout(() => {
          this.statsSwitchTimer = null;
          this.leavingModel.set(null);
          this.statsSwitching.set(false);
        }, statsSwitchWindowMs(this.element.nativeElement));
      }
      if (sessionId !== null) {
        previousSessionId = sessionId;
        previousModel = current;
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.statsSwitchTimer !== null) clearTimeout(this.statsSwitchTimer);
    });
    // Hold the shown session's chain while the expanded body shows it; the
    // client loads on the first hold and drops the chain on the last release.
    effect((onCleanup) => {
      const sessionId = this.linkedSessionId();
      if (!sessionId) return;
      untracked(() => this.handoffChain.retain(sessionId));
      onCleanup(() => this.handoffChain.release(sessionId));
    });
    let previous: SessionInspectorPresentation | undefined;
    afterRenderEffect(() => {
      const presentation = this.presentation();
      const section = this.focusSection();
      if (presentation === 'rail' && previous && previous !== 'rail') {
        this.focusExpandControl();
      } else if (presentation !== 'rail' && section) {
        const host = this.element.nativeElement;
        const target = section === 'attention'
          ? this.attentionTarget(host) ?? host.querySelector<HTMLElement>(FOCUS_TARGETS.agents)
          : host.querySelector<HTMLElement>(FOCUS_TARGETS[section]);
        const close = this.closeButton()?.nativeElement;
        (target ?? close)?.focus();
        if (presentation === 'sheet' && target && close) {
          // The canvas may focus close as its deferred sheet mounts.
          queueMicrotask(() => {
            if (target.isConnected && this.focusSection() === section &&
              host.ownerDocument.activeElement === close) {
              target.focus();
            }
          });
        }
      }
      previous = presentation;
    });
    // Late mount from the deferred chunk: let the shell focus the close
    // button if the sheet opened before this body rendered.
    effect(() => {
      const button = this.closeButton();
      if (button && this.shell) {
        const shell = this.shell;
        untracked(() => shell.closeReady(button.nativeElement));
      }
    });
  }

  private attentionTarget(host: HTMLElement): HTMLElement | undefined {
    const key = this.attentionKey();
    if (!key) return undefined;
    return Array.from(host.querySelectorAll<HTMLElement>('[data-agent-key]'))
      .find((button) => button.dataset['agentKey'] === key);
  }

  /** For hosts that replace the expanded instance with a newly mounted rail. */
  focusExpandControl(): void {
    this.expandButton()?.nativeElement.focus();
  }

  protected selectAgent(key: string): void {
    this.agentsSelection.set(key);
    this.agentSelected.emit(key);
  }

  protected answerFromHeader(requestId: string): void {
    this.answerRequested.emit(requestId);
    const row = this.inspectorAgentRows.rows()?.find(({ key, requests }) =>
      key === 'orchestrator' && requests.some((request) => request.requestId === requestId),
    );
    if (!row) return;

    this.selectAgent(row.key);
    const index = row.requests.findIndex((request) => request.requestId === requestId);
    afterNextRender(() => {
      const rowElement = this.element.nativeElement
        .querySelector(FOCUS_TARGETS.orchestrator)?.closest('li');
      const lines = rowElement?.querySelector('ptah-inspector-request-lines');
      if (!lines) return;
      const requestButton = () =>
        lines.querySelectorAll<HTMLButtonElement>('[data-request-button]')[index];
      const button = requestButton();
      if (button) {
        button.focus();
      } else {
        lines.querySelector<HTMLButtonElement>(':scope > button[aria-expanded="false"]')?.click();
        afterNextRender(() => requestButton()?.focus(), { injector: this.injector });
      }
    }, { injector: this.injector });
  }

  protected announce(text: string): void {
    this.announcement.set(text);
  }

  /**
   * Another linked session was activated: open it through the session-list
   * open path (canvas focus or a new tile). A failure is logged there; the
   * inspector stays as it is.
   */
  protected openLinkedSession(sessionId: string): void {
    const id = SessionId.safeParse(sessionId);
    if (!id) return;
    const label =
      this.linkedSessions().find((entry) => entry.sessionId === sessionId)
        ?.label ?? '';
    void this.rowActions.openSession({ id, name: label });
  }
}
