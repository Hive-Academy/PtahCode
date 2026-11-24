import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import {
  AgentCardComponent,
  AgentContinueInputComponent,
  ChatSessionLayoutComponent,
  ChatStore,
  LANE_COLUMN_CLASS,
  LANE_WAITING_LABEL,
  LanePermissionView,
  SubagentLaneComponent,
  ownedBySession,
  parseLaneKey,
  questionBelongsToTab,
} from '@ptah-extension/chat';
import {
  BackgroundAgentStore,
  AgentMonitorStore,
} from '@ptah-extension/chat-streaming';
import { NgTemplateOutlet } from '@angular/common';
import {
  BackgroundAgentStripComponent,
  PermissionRequestCardComponent,
  QuestionCardComponent,
} from '@ptah-extension/chat-ui';
import { PtahBadgeDirective } from '@ptah-extension/ui';
import { Check, LucideAngularModule } from 'lucide-angular';
import { CanvasDetailTranscriptComponent } from './canvas-detail-transcript.component';
import { CanvasDetailService } from './canvas-detail.service';

/** Resolve the displayed lane, including a stored lane whose agent has gone away. */
export function effectiveCanvasLaneKind(
  laneKey: string,
  sessionId: string | null,
  monitor: AgentMonitorStore,
  background: BackgroundAgentStore,
): 'orchestrator' | 'cli' | 'subagent' | 'background' {
  const parsed = parseLaneKey(laneKey);
  if (!parsed) return 'orchestrator';
  if (parsed.kind === 'cli') {
    return ownedBySession(
      monitor.agents(),
      sessionId,
      (agent) => agent.parentSessionId,
    ).some((agent) => agent.agentId === parsed.id)
      ? 'cli'
      : 'orchestrator';
  }
  const subagentExists = ownedBySession(
    [...monitor.subagents().values()],
    sessionId,
    (agent) => agent.parentSessionId,
  ).some((agent) => agent.parentToolUseId === parsed.id);
  if (parsed.kind === 'subagent')
    return subagentExists ? 'subagent' : 'orchestrator';
  if (parsed.kind === 'background') {
    const backgroundExists = ownedBySession(
      background.agents(),
      sessionId,
      (agent) => agent.sessionId,
    ).some((agent) => agent.toolCallId === parsed.id);
    return subagentExists || backgroundExists ? 'background' : 'orchestrator';
  }
  return 'orchestrator';
}

/**
 * A lane's panel: the main chat view's chrome surface, and the size container
 * that `LANE_COLUMN_CLASS` and the lane transcript measure their column from.
 */
const LANE_PANEL_CLASS =
  'relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto pt-2 [container-type:inline-size]';

/**
 * A CLI lane's panel: the same surface and size container, but it does not
 * scroll. Its session layout scrolls the transcript and keeps the composer
 * below it, as the main chat view does.
 */
const LANE_CLI_PANEL_CLASS =
  'relative flex h-full min-h-0 min-w-0 flex-col pt-2 [container-type:inline-size]';

@Component({
  selector: 'ptah-canvas-lane-view',
  standalone: true,
  imports: [
    ChatSessionLayoutComponent,
    AgentCardComponent,
    AgentContinueInputComponent,
    SubagentLaneComponent,
    BackgroundAgentStripComponent,
    QuestionCardComponent,
    PermissionRequestCardComponent,
    PtahBadgeDirective,
    LucideAngularModule,
    CanvasDetailTranscriptComponent,
    NgTemplateOutlet,
  ],
  providers: [LanePermissionView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0',
    '[class.overflow-hidden]': "selectedKind() === 'orchestrator'",
    '[class.overflow-auto]': "selectedKind() !== 'orchestrator'",
    '(keydown.escape)': 'onEscape($event)',
  },
  styles: [
    `
      @keyframes rail-lane-enter {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (prefers-reduced-motion: no-preference) {
        .rail-lane-enter {
          animation: rail-lane-enter 180ms var(--ptah-ease-soft);
        }
      }
    `,
  ],
  template: `
    <div
      [id]="panelId()"
      role="tabpanel"
      tabindex="-1"
      [attr.aria-labelledby]="panelId() + '-tab-' + laneKey()"
      class="h-full min-h-0"
      [class.flex]="selectedKind() === 'orchestrator'"
      [class.flex-col]="selectedKind() === 'orchestrator'"
    >
      <div
        [class.hidden]="selectedKind() !== 'orchestrator'"
        class="min-h-0 flex-1"
      >
        <ptah-canvas-detail-transcript
          [tabId]="tabId()"
          [visible]="selectedKind() === 'orchestrator'"
          [paneFocused]="paneFocused()"
          [splitDisplayed]="splitDisplayed()"
        />
      </div>
      @for (block of laneBlocks(); track block.key) {
        <!-- Hidden for the orchestrator: an empty full-height block would take the transcript's height. -->
        <div
          class="rail-lane-enter h-full min-h-0 flex-col"
          [class.flex]="selectedKind() !== 'orchestrator'"
          [class.hidden]="selectedKind() === 'orchestrator'"
        >
          @for (request of pendingQuestions(); track request.id) {
            <div class="mx-auto w-full max-w-[758px] px-2 pb-2">
              <ptah-question-card [request]="request" (answered)="chatStore.handleQuestionResponse($event, tabId())" />
            </div>
          }
          @switch (selectedKind()) {
            @case ('cli') {
              @if (selectedCli(); as agent) {
                <!-- The main chat shell: the chrome panel, the session layout
                     (column width) and one centered column for every row. -->
                <div
                  [class]="cliPanelClass"
                  data-glass-surface="chrome"
                  data-testid="lane-panel"
                >
                  <!-- Main chat's layout: the transcript scrolls in its own
                       region and the composer sits below it, so no transcript
                       row ever scrolls under the composer (B1). -->
                  <ptah-chat-session-layout>
                    <div
                      sessionTranscript
                      class="flex min-h-0 flex-1 flex-col overflow-y-auto"
                      data-testid="lane-scroller"
                    >
                    <!-- The lane's approvals and questions, as main chat's cards (Req 5). -->
                    @if (
                      prompts.waiting() ||
                      prompts.notice() ||
                      prompts.resolvedStatus()
                    ) {
                      <div
                        [class]="
                          laneColumnClass + ' mb-2 flex shrink-0 flex-col gap-1.5'
                        "
                        data-testid="lane-prompts"
                      >
                        @if (prompts.waiting()) {
                          <span
                            ptahBadge
                            tone="warn"
                            size="xs"
                            class="self-start"
                            role="status"
                            >{{ waitingLabel }}</span
                          >
                        }
                        @if (prompts.notice(); as notice) {
                          <p class="text-[11px] text-state-need" role="status">
                            {{ notice }}
                          </p>
                        }
                        @for (request of prompts.permissions(); track request.id) {
                          <ptah-permission-request-card
                            [request]="request"
                            [laneLabel]="prompts.laneLabel()"
                            (responded)="prompts.respond($event)"
                          />
                        }
                        @for (request of prompts.questions(); track request.id) {
                          <ptah-question-card
                            [request]="request"
                            [laneLabel]="prompts.laneLabel()"
                            (answered)="prompts.answer($event)"
                          />
                        }
                        @if (
                          !prompts.waiting() && prompts.resolvedStatus();
                          as status
                        ) {
                          <p
                            class="flex items-center gap-1 text-[11px] text-base-content-muted"
                            role="status"
                          >
                            <lucide-angular
                              [img]="CheckIcon"
                              class="w-3 h-3 flex-shrink-0 text-success"
                              aria-hidden="true"
                            />
                            {{ status }}
                          </p>
                        }
                      </div>
                    }
                    <ptah-agent-card
                      [showStats]="false"
                      #laneCard
                      class="block flex-1 min-h-fit"
                      [agent]="agent"
                      presentation="flat"
                      (toggleExpanded)="
                        monitor.toggleAgentExpanded(agent.agentId)
                      "
                    />
                    </div>
                    <div sessionComposer class="flex-shrink-0 pt-2">
                      <ptah-agent-continue-input
                        [class]="laneColumnClass + ' block'"
                        variant="composer"
                        [agent]="agent"
                        [stopPending]="laneCard.isStopping()"
                        [resumePending]="laneCard.isResuming()"
                        (stopRequested)="laneCard.stopAgent($event)"
                        (resumeRequested)="laneCard.resumeAgent($event)"
                      />
                    </div>
                  </ptah-chat-session-layout>
                </div>
              }
            }
            @case ('subagent') {
              <ng-container [ngTemplateOutlet]="subagentLane" />
            }
            @case ('background') {
              @if (selectedSubagent(); as sub) {
                <ng-container [ngTemplateOutlet]="subagentLane" />
              } @else if (selectedBackground(); as agent) {
                <ptah-background-agent-strip
                  [entries]="[
                    {
                      id: agent.toolCallId,
                      name: agent.teammateName || agent.agentType,
                      origin: 'background',
                      description: agent.agentDescription,
                      status: agent.status,
                      steerable: false,
                      stoppable: false,
                      canBackground: false,
                    },
                  ]"
                />
              }
            }
            @default {}
          }
        </div>
      }
      <ng-template #subagentLane>
        @if (selectedSubagent(); as sub) {
          <div
            [class]="lanePanelClass"
            data-glass-surface="chrome"
            data-testid="lane-panel"
          >
            <ptah-chat-session-layout class="!flex-none min-h-full">
              <ptah-subagent-lane
                [showStats]="false"
                class="flex-1 min-h-fit"
                presentation="flat"
                [record]="sub"
                [sessionId]="sessionId()"
                [getPermissionForTool]="getPermissionForTool"
                (permissionResponded)="
                  chatStore.handlePermissionResponse($event)
                "
              />
            </ptah-chat-session-layout>
          </div>
        }
      </ng-template>
    </div>
  `,
})
export class CanvasLaneViewComponent {
  protected readonly lanePanelClass = LANE_PANEL_CLASS;
  protected readonly cliPanelClass = LANE_CLI_PANEL_CLASS;
  protected readonly laneColumnClass = LANE_COLUMN_CLASS;
  readonly monitor = inject(AgentMonitorStore);
  readonly chatStore = inject(ChatStore);
  private readonly detail = inject(CanvasDetailService);
  private readonly background = inject(BackgroundAgentStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private opener: HTMLElement | null = null;
  readonly tabId = input.required<string>();
  readonly paneFocused = input(true);
  readonly splitDisplayed = input(false);
  readonly panelId = input('canvas-lane-panel');
  readonly sessionId = input<string | null>(null);
  readonly laneKey = input('orchestrator');
  /** The selected CLI lane's approvals and questions; empty for other lanes. */
  protected readonly prompts = inject(LanePermissionView);
  protected readonly waitingLabel = LANE_WAITING_LABEL;
  protected readonly CheckIcon = Check;
  /**
   * Tab questions shown above a non-orchestrator lane, which covers the
   * transcript. A question asked by a CLI lane (`agentId` set) is left out: it
   * shows only in that lane's own card list, never in another lane.
   */
  readonly pendingQuestions = computed(() => {
    if (this.selectedKind() === 'orchestrator') return [];
    const questions = this.chatStore.questionRequests();
    if (questions.length === 0) return [];
    this.chatStore.routingTargetRevision();
    const sessionId = this.sessionId();
    const tabId = this.tabId();
    return questions.filter(request => !request.agentId && questionBelongsToTab(
      request,
      this.chatStore.questionTargetTabsFor(request.id),
      this.chatStore.isQuestionClaimedByWorkflow(request),
      tabId,
      sessionId,
    ));
  });
  readonly laneBlocks = computed(() => [
    { key: this.tabId() + ':' + this.laneKey() },
  ]);
  private readonly parsed = computed(() => parseLaneKey(this.laneKey()));
  readonly selectedCli = computed(() =>
    this.parsed()?.kind === 'cli'
      ? ownedBySession(
          this.monitor.agents(),
          this.sessionId(),
          (a) => a.parentSessionId,
        ).find((a) => a.agentId === this.parsed()?.id)
      : undefined,
  );
  readonly selectedSubagent = computed(() => {
    const parsed = this.parsed();
    if (parsed?.kind !== 'subagent' && parsed?.kind !== 'background')
      return undefined;
    return ownedBySession(
      [...this.monitor.subagents().values()],
      this.sessionId(),
      (a) => a.parentSessionId,
    ).find((a) => a.parentToolUseId === parsed.id);
  });
  readonly selectedBackground = computed(() =>
    this.parsed()?.kind === 'background'
      ? ownedBySession(
          this.background.agents(),
          this.sessionId(),
          (a) => a.sessionId,
        ).find((a) => a.toolCallId === this.parsed()?.id)
      : undefined,
  );
  readonly selectedKind = computed(() =>
    effectiveCanvasLaneKind(
      this.laneKey(),
      this.sessionId(),
      this.monitor,
      this.background,
    ),
  );
  readonly getPermissionForTool = (id: string) =>
    this.chatStore.getPermissionForTool(id);

  constructor() {
    this.prompts.connect({ agent: this.selectedCli });
    let previousTabId: string | undefined;
    let previousKind: string | undefined;
    effect(() => {
      const tabId = this.tabId();
      const kind = this.selectedKind();
      if (previousTabId !== tabId) {
        this.opener = null;
        previousTabId = tabId;
        previousKind = kind;
        return;
      }
      if (previousKind === 'orchestrator' && kind !== 'orchestrator') {
        const focused = this.host.nativeElement.ownerDocument.activeElement;
        if (
          focused instanceof HTMLElement &&
          this.host.nativeElement.contains(focused)
        ) {
          this.opener = focused;
          afterNextRender(
            () => {
              if (
                this.tabId() === tabId &&
                this.selectedKind() !== 'orchestrator'
              ) {
                this.host.nativeElement
                  .querySelector<HTMLElement>('[role="tabpanel"]')
                  ?.focus();
              }
            },
            { injector: this.injector },
          );
        }
      }
      previousKind = kind;
    });
    let previousCliId: string | null = null;
    effect(() => {
      const agent = this.selectedCli();
      const id = agent?.agentId ?? null;
      if (id === previousCliId) return;
      previousCliId = id;
      if (agent && !agent.expanded)
        this.monitor.toggleAgentExpanded(agent.agentId);
    });
  }

  back(): void {
    this.detail.selectLaneFor(this.tabId(), 'orchestrator');
    afterNextRender(
      () => {
        const target = this.opener?.isConnected
          ? this.opener
          : ((this.host.nativeElement.querySelector(
              'ptah-canvas-detail-transcript textarea, ptah-canvas-detail-transcript [contenteditable="true"]',
            ) as HTMLElement | null) ??
            (this.host.nativeElement.querySelector(
              'ptah-canvas-detail-transcript',
            ) as HTMLElement | null));
        target?.focus();
        this.opener = null;
      },
      { injector: this.injector },
    );
  }

  onEscape(event: Event): void {
    if (event.defaultPrevented || this.selectedKind() === 'orchestrator')
      return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      )
    )
      return;
    event.preventDefault();
    this.back();
  }
}
