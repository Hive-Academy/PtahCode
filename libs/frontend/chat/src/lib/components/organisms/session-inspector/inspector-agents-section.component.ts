import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
  untracked,
  type OnInit,
} from '@angular/core';
import {
  AgentSteerInputComponent,
  InspectorCacheTileComponent,
  LaneComposerComponent,
  isRunningAgentWord,
  type InspectorLaneRunDetail,
  type UsageContribution,
} from '@ptah-extension/chat-ui';
import { AgentMonitorStore } from '@ptah-extension/chat-streaming';
import { WallClockService, injectWallClock } from '@ptah-extension/core';
import type { SessionStatsEntry } from '@ptah-extension/shared';
import { formatDuration } from '@ptah-extension/ui';
import { parseLaneKey } from '../../molecules/compact-session/compact-lane-rows';
import type { TrayAgentContext } from '../../../services/session-agents/session-agent-tray';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import type {
  InspectorAgentsData,
  OrchestratorCardModel,
  SectionState,
} from '../../../services/session-inspector';
import {
  InspectorAgentActionsMenuComponent,
  trayEntryHasAction,
  type AgentTrayAction,
} from './inspector-agent-actions-menu.component';
import {
  agentKindLine,
  NOT_REPORTED_TITLE,
  normalizeAgentKey,
  type AgentListRow,
} from './inspector-agent-list';
import {
  AGENT_ROW_COLUMNS,
  InspectorAgentRowComponent,
} from './inspector-agent-row.component';
import { injectInspectorAgentRows, type InspectorAgentRows } from './inspector-agent-rows';
import { InspectorRequestLinesComponent } from './inspector-request-panel.component';

/** Rows shown before "Show N more". */
export const AGENTS_VISIBLE_LIMIT = 6;

/** Session input / output token split, for the Orchestrator tokens tooltip. */
export interface SessionTokenSplit {
  readonly input: number;
  readonly output: number;
}

let nextSectionId = 0;

/**
 * AGENTS: one list of every agent of the session (the Orchestrator
 * included) with model, tokens, cost and status. A click (Enter / Space)
 * selects a row and opens its thread; a left border marks the selected row.
 * Requests and steering stay on their row whatever its status.
 *
 * Selection: the host's `selectedAgentKey` (the canvas lane) wins; without
 * one the section keeps its own. `agentSelected` reports a pick (and a
 * normalized key when the host's key left the roster); opening a thread emits
 * `laneRequested` with a lane surface, else focuses the owning tab.
 * Running durations use the shared wall clock only while an agent runs.
 */
@Component({
  selector: 'ptah-inspector-agents-section',
  standalone: true,
  imports: [
    AgentSteerInputComponent,
    LaneComposerComponent,
    InspectorAgentActionsMenuComponent,
    InspectorCacheTileComponent,
    InspectorAgentRowComponent,
    InspectorRequestLinesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: block; container-type: inline-size; }`],
  template: `
    @let count = caption();
    <section
      class="pb-2 pt-3" data-inspector-section="agents"
      [attr.aria-labelledby]="headingId"
      [attr.aria-busy]="count === null ? 'true' : null"
    >
      <div class="flex items-center justify-between gap-2 px-3">
        <h3
          [id]="headingId" tabindex="-1"
          class="sec-label text-[10.5px] font-semibold uppercase"
        >
          AGENTS
        </h3>
        @if (count !== null) {
          <span class="text-[10.5px] tabular-nums text-base-content-muted" data-testid="agents-count">{{ count }}</span>
        } @else {
          <span class="sr-only" role="status">Loading agents</span>
        }
      </div>
      @if (count === null) {
        <ul class="mt-2" aria-hidden="true">
          @for (n of skeletonRows; track n) {
            <li class="flex items-center gap-2 px-3 py-2">
              <span
                class="size-7 shrink-0 rounded-full bg-surface-2 animate-pulse motion-reduce:animate-none"
              ></span>
              <span class="grid flex-1 gap-1.5">
                <span
                  class="h-3 w-24 rounded bg-surface-2 animate-pulse motion-reduce:animate-none"
                ></span>
                <span
                  class="h-2.5 w-16 rounded bg-surface-2 animate-pulse motion-reduce:animate-none"
                ></span>
              </span>
            </li>
          }
        </ul>
      } @else {
        @if (list().length > 0) {
          <div
            class="mt-2 grid {{
              columns
            }} px-3 pb-1 text-[10.5px] text-base-content-muted"
            [class.mr-8]="hasMenus()"
            aria-hidden="true"
          >
            <span>Agent</span>
            <span class="text-right">Tokens</span>
            <span class="text-right">Cost</span>
            <span class="text-right">Time</span>
          </div>
          <ul [id]="listId" [attr.aria-labelledby]="headingId">
            @for (row of visibleRows(); track row.key; let i = $index) {
              @let selected = selectedKey() === row.key;
              @let expanded = detailKey() === row.key;
              @let rowId = listId + '-' + row.key;
              @let role = runDetail(row.key)?.role ?? null;
              <li
                class="st-r relative motion-safe:transition-colors motion-safe:duration-[120ms]"
                [style.--i]="staggerStart() + 1 + i"
                [class.bg-surface-2]="selected"
                [attr.aria-current]="selected ? 'true' : null"
                (keydown.escape)="closeDetail(row.key, $event)"
              >
                @if (selected) {
                  <span
                    class="absolute inset-y-1 left-0 w-0.5 rounded-full bg-secondary"
                    aria-hidden="true"
                  ></span>
                }
                <div class="flex items-center">
                  <ptah-inspector-agent-row #presentation class="min-w-0 flex-1"
                    [row]="row" [detailId]="rowId" [current]="selected" [expanded]="expanded"
                    [tokenTotal]="tokenTotal()" [usageAmounts]="usageAmounts(row)"
                    [orchestratorDurationMs]="orchestrator()?.durationMs ?? null"
                    [role]="role" [context]="row.agent.kind === 'orchestrator' ? context() : null"
                    [cache]="row.agent.kind === 'orchestrator' ? cacheLine() : null"
                    (selected)="select(row)"
                  />
                  @if (hasMenus()) {
                    <span class="flex w-8 shrink-0 justify-center pr-1">
                      @if (row.tray && row.hasActions) {
                        <ptah-inspector-agent-actions-menu
                          [name]="row.agent.name" [ctx]="row.tray"
                          [open]="menuOpenKey() === row.key"
                          (openChange)="setMenuOpen(row.key, $event)"
                          (action)="onAction(row.key, $event)"
                        />
                      }
                    </span>
                  }
                </div>
                <ptah-inspector-request-lines
                  class="ml-11 mr-3 block" [class.mb-2]="row.requests.length > 0"
                  [requests]="row.requests"
                  [ownerName]="row.name"
                  [ownerKindLabel]="kindLabel(row)"
                  [tabId]="tabId()"
                  [hasLaneSurface]="hasLaneSurface()"
                  (answerRequested)="answerRequested.emit($event)"
                  (laneRequested)="laneRequested.emit($event)"
                  (announced)="announced.emit($event)"
                  (focusReleased)="focusRow(row.key)"
                />
                <div [id]="rowId" role="region" [attr.aria-label]="row.agent.name + ' details'" [hidden]="!expanded">
                  @if (expanded) {
                    @let metrics = presentation.metrics();
                    <dl class="mb-2 ml-11 mr-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]">
                      <div><dt class="sr-only">Tokens</dt><dd>{{ metrics.tokenDetails }}</dd></div>
                      <div><dt class="sr-only">Cost</dt><dd>{{ metrics.costDetails }}</dd></div>
                      <div><dt class="sr-only">Time</dt><dd>{{ metrics.time }}</dd></div>
                      <div><dt class="text-base-content-muted">Status</dt><dd>{{ row.statusText }}</dd></div>
                      @if (role) {
                        <div><dt class="text-base-content-muted">Role</dt><dd>{{ role }}</dd></div>
                      }
                      @if (row.startedAtTitle) {
                        <div><dt class="sr-only">Start time</dt><dd>{{ row.startedAtTitle }}</dd></div>
                      }
                      @if (row.tokensTitle !== notReported) {
                        <div><dt class="sr-only">Token split</dt><dd>{{ row.tokensTitle }}</dd></div>
                      }
                      @if (row.agent.kind === 'orchestrator') {
                        <div><dt class="sr-only">Context</dt><dd>{{ context().description }}</dd></div>
                        @if (compactionCount() !== null) {
                          <div><dt class="text-base-content-muted">Compactions</dt><dd>{{ compactionCount() }}</dd></div>
                        }
                        @if (cache(); as shownCache) {
                          <div class="basis-full">
                            <dt class="sr-only">Prompt cache</dt>
                            <dd><ptah-inspector-cache-tile [cache]="shownCache" variant="detail" /></dd>
                          </div>
                        }
                      }
                    </dl>
                    @if (cliLaneId(row.key); as agentId) {
                      @if (steerOpenKey() === row.key || row.agent.status === 'running') {
                        <ptah-lane-composer class="mb-2 ml-11 mr-3 block"
                          [agentId]="agentId" [laneLabel]="row.agent.name" [cli]="row.agent.cliId || row.secondary"
                          variant="compact" [stopped]="row.agent.status !== 'running'" />
                      }
                    } @else if (steerOpenKey() === row.key && row.tray && row.agent.kind !== 'cli') {
                      <ptah-agent-steer-input
                        class="mb-2 ml-11 mr-3 block"
                        [steerable]="row.tray.entry.steerable"
                        [pending]="pendingSteerId() === row.key"
                        [clearOnSubmit]="false"
                        [placeholder]="'Steer ' + row.name + '...'"
                        (steer)="onSteer(row.key, $event)"
                      />
                      @if (steerErrorKey() === row.key) {
                        <p role="alert" class="mb-2 ml-11 mr-3 text-xs text-state-err">
                          Could not send your message. Try again.
                        </p>
                      }
                    }
                  }
                </div>
              </li>
            }
          </ul>
          @if (showAll() || hiddenCount() > 0) {
            <button
              type="button"
              class="mx-4 mt-1 rounded text-xs text-base-content-muted hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
              data-testid="agents-show-more"
              [attr.aria-expanded]="showAll()"
              [attr.aria-controls]="listId"
              (click)="showAll.set(!showAll())"
            >
              {{ showAll() ? 'Show fewer' : 'Show ' + hiddenCount() + ' more' }}
            </button>
          }
        }
        @if (!hasLanes()) {
          <p class="px-3 py-2 text-xs text-base-content-muted">No subagents or CLI lanes yet</p>
        }
      }
    </section>
  `,
})
export class InspectorAgentsSectionComponent implements OnInit {
  protected cliLaneId(key: string): string | null {
    const lane = parseLaneKey(key);
    return lane?.kind === 'cli' && this.monitoredIds().has(lane.id) ? lane.id : null;
  }
  private readonly tray = inject(SessionAgentTrayService);
  private readonly monitor = inject(AgentMonitorStore);
  private readonly injector = inject(Injector);
  private readonly monitoredIds = computed(() => new Set(this.monitor.agents().map(({ agentId }) => agentId)));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly tabId = input.required<string>();
  /** Lane key selected by the host (canvas), including finished agents. */
  readonly selectedAgentKey = input<string | null>();
  /** Owning session of the shown tab; scopes the tray contexts. */
  readonly sessionId = input<string | null>(null);
  readonly agents = input.required<SectionState<InspectorAgentsData>>();
  readonly laneRuns = input<readonly InspectorLaneRunDetail[]>([]);
  readonly orchestrator = input<OrchestratorCardModel | null>(null);
  readonly projection = input<InspectorAgentRows | null>(null);
  readonly cache = input<NonNullable<SessionStatsEntry['cache']> | null>(null);
  readonly contextUsed = input<number | null>(null);
  readonly compactionCount = input<number | null>(null);
  /** Compatibility with the existing inspector binding until S8 wires the projection. */
  readonly sessionTokens = input<SessionTokenSplit | null>(null);
  /** A lane surface exists in the host (Rail board), so rows open lanes. */
  readonly hasLaneSurface = input<boolean>(false);
  /** Stagger index of the section; rows continue from it. */
  readonly staggerStart = input<number>(0);

  /** "Open thread" (or a request line) asks the host for an agent's lane. */
  readonly laneRequested = output<string>();
  /** The user picked a row, or the host's key was normalized to the roster. */
  readonly agentSelected = output<string>();
  readonly answerRequested = output<string>();
  readonly announced = output<string>();

  protected readonly notReported = NOT_REPORTED_TITLE;
  protected readonly columns = AGENT_ROW_COLUMNS;
  protected readonly skeletonRows = [0, 1, 2];
  private readonly sectionId = ++nextSectionId;
  protected readonly headingId = `ptah-agents-h-${this.sectionId}`;

  protected readonly listId = `ptah-agents-list-${this.sectionId}`;

  private readonly localSelectedKey = signal<string | null>('orchestrator');
  protected readonly showAll = signal(false);
  protected readonly menuOpenKey = signal<string | null>(null);
  protected readonly detailKey = signal<string | null>(null);
  protected readonly steerOpenKey = signal<string | null>(null);
  protected readonly pendingSteerId = signal<string | null>(null);
  protected readonly steerErrorKey = signal<string | null>(null);
  private readonly runDetails = computed(() => new Map(this.laneRuns().map(run => [`cli:${run.runId}`, run])));
  protected runDetail(key: string): InspectorLaneRunDetail | null {
    return this.runDetails().get(key) ?? null;
  }

  private readonly localProjection = signal<InspectorAgentRows | null>(null);
  private readonly source = computed(() => this.projection() ?? this.localProjection());
  private readonly rosterRows = computed(() => this.source()?.rows() ?? null);
  protected readonly list = computed(() => this.rosterRows() ?? []);
  protected readonly tokenTotal = computed(() => this.source()?.totals().tokens ?? null);
  private readonly cliUsage = computed(() => {
    const byKey = new Map<string, UsageContribution>();
    for (const contribution of this.source()?.contributions() ?? []) {
      if (contribution.source === 'cli') byKey.set(`cli:${contribution.id}`, contribution);
    }
    return byKey;
  });

  protected usageAmounts(row: AgentListRow) {
    if (row.agent.kind === 'orchestrator') return this.source()?.orchestratorUsage() ?? null;
    return this.cliUsage().get(row.key) ?? null;
  }

  protected readonly hasLanes = computed(() => this.list().some(row => row.agent.kind !== 'orchestrator'));
  protected readonly hasMenus = computed(() => this.visibleRows().some(row => row.hasActions));
  protected readonly caption = computed(() => {
    const rows = this.rosterRows();
    if (rows === null) return null;
    const running = rows.filter(row => isRunningAgentWord(row.agent.status)).length;
    const asking = rows.filter(row => row.requests.length > 0 || row.agent.openRequestIds.length > 0 || row.agent.status === 'waiting').length;
    const sub = rows.filter(row => row.agent.kind === 'subagent' || row.agent.kind === 'background').length;
    const cli = rows.filter(row => row.agent.kind === 'cli').length;
    return [`${running} running`, asking ? `${asking} asking` : '', `${sub} sub`, `${cli} CLI`].filter(Boolean).join(' · ');
  });

  protected readonly context = computed(() => {
    const card = this.orchestrator();
    const percent = card?.contextPercent ?? null;
    const used = this.contextUsed();
    const capacity = card?.contextWindow ?? null;
    const warning = percent === null || percent < 80 ? null : percent >= 95 ? 'At context limit' : 'Near context limit';
    const text = percent === null ? '—' : `${Math.round(percent)}%`;
    const description = percent === null ? 'Main request context not available' : [
      `Main request context ${text}`,
      used !== null && capacity !== null ? `${used.toLocaleString()} of ${capacity.toLocaleString()} tokens` : null,
      warning,
    ].filter(Boolean).join(' · ');
    return { percent, text, description, warning };
  });

  private readonly clockNow = inject(WallClockService).now('second');
  private readonly cacheNow = injectWallClock('second', () => {
    const cache = this.cache();
    return cache !== null && this.detailKey() !== 'orchestrator' && cache.expiresAt > this.clockNow();
  });
  protected readonly cacheLine = computed(() => {
    const cache = this.cache();
    if (cache === null) return null;
    const ms = cache.expiresAt - this.cacheNow();
    const warning = ms <= 0 ? 'Cache expired' : ms <= 60_000 ? 'Cache expires soon' : null;
    const time = ms <= 0 ? 'Expired' : formatDuration(Math.ceil(ms / 1000) * 1000, 'clock');
    return { time, warning, description: [`Estimated ${cache.ttl} cache · ${time}`, warning].filter(Boolean).join(' · ') };
  });

  protected readonly selectedKey = computed(() => {
    const host = this.selectedAgentKey();
    const key = host === undefined ? this.localSelectedKey() : host;
    return key === null
      ? null
      : normalizeAgentKey(
          key,
          this.list().map((row) => row.key),
        );
  });

  /** First rows, plus the selected one when it sits below the fold. */
  protected readonly visibleRows = computed(() => {
    const rows = this.list();
    if (this.showAll() || rows.length <= AGENTS_VISIBLE_LIMIT) return rows;
    const head = rows.slice(0, AGENTS_VISIBLE_LIMIT);
    const selected = rows.find((row) => row.key === this.selectedKey());
    return selected && !head.includes(selected) ? [...head, selected] : head;
  });

  protected readonly hiddenCount = computed(
    () => this.list().length - this.visibleRows().length,
  );

  ngOnInit(): void {
    if (this.projection() === null) {
      this.localProjection.set(runInInjectionContext(this.injector, () =>
        injectInspectorAgentRows(this.tabId, this.sessionId, this.laneRuns),
      ));
    }
  }

  constructor() {
    // A host key that left the roster (lane gone, sub-agent moved to the
    // background) is reported back in its roster form.
    effect(() => {
      const host = this.selectedAgentKey();
      if (typeof host !== 'string' || this.rosterRows() === null) return;
      const normalized = this.selectedKey();
      if (normalized !== null && normalized !== host) {
        untracked(() => this.agentSelected.emit(normalized));
      }
    });
  }

  private canOpen(row: AgentListRow): boolean {
    if (this.hasLaneSurface()) return true;
    return row.agent.kind !== 'orchestrator' && row.tray !== null;
  }

  protected kindLabel(row: AgentListRow): string {
    return agentKindLine(row.agent);
  }

  /** Select the row and open its thread when it has one. */
  protected select(row: AgentListRow): void {
    if (this.selectedKey() !== row.key) {
      this.localSelectedKey.set(row.key);
      this.agentSelected.emit(row.key);
    }
    this.detailKey.set(this.detailKey() === row.key ? null : row.key);
    if (this.canOpen(row)) this.openThread(row);
  }

  private openThread(row: AgentListRow): void {
    if (this.hasLaneSurface()) {
      this.laneRequested.emit(row.key);
      return;
    }
    const ctx = this.contextOf(row.key);
    if (ctx) this.tray.focus(ctx);
  }

  protected setMenuOpen(key: string, open: boolean): void {
    if (open) this.menuOpenKey.set(key);
    else if (this.menuOpenKey() === key) this.menuOpenKey.set(null);
  }

  protected onAction(key: string, action: AgentTrayAction): void {
    const ctx = this.contextOf(key);
    if (!ctx || !trayEntryHasAction(ctx.entry)) return;
    switch (action) {
      case 'steer':
        this.steerErrorKey.set(null);
        this.steerOpenKey.set(key);
        this.detailKey.set(key);
        break;
      case 'background':
        this.tray.sendToBackground(ctx);
        break;
      case 'stop':
        this.tray.stop(ctx);
        break;
    }
  }

  protected async onSteer(key: string, text: string): Promise<void> {
    const ctx = this.contextOf(key);
    if (!ctx) return;
    this.steerErrorKey.set(null);
    this.pendingSteerId.set(key);
    try {
      const sent = await this.tray.steer(ctx, text);
      if (this.steerOpenKey() !== key) return;
      if (sent) this.steerOpenKey.set(null);
      else this.steerErrorKey.set(key);
    } finally {
      this.pendingSteerId.set(null);
    }
  }

  /** Return focus to a row's button (a closed request panel left none). */
  protected focusRow(key: string): void {
    const buttons =
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-agent-key]');
    for (const button of Array.from(buttons)) {
      if (button.dataset['agentKey'] === key) {
        button.focus();
        return;
      }
    }
  }

  protected closeDetail(key: string, event: Event): void {
    if (this.detailKey() !== key) return;
    event.stopPropagation();
    this.detailKey.set(null);
    this.steerOpenKey.set(null);
    this.focusRow(key);
  }

  private contextOf(key: string): TrayAgentContext | null {
    return this.list().find(row => row.key === key)?.tray ?? null;
  }
}
