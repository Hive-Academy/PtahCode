/**
 * Agent Card Component
 *
 * Thin orchestrator that composes header, permission, and output sub-components.
 * Displays a single monitored agent in the agent monitor sidebar.
 */

import {
  Component,
  input,
  output,
  computed,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Check, LucideAngularModule } from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import { AgentMonitorStore, type MonitoredAgent } from '@ptah-extension/chat-streaming';
import { CliAgentOutputComponent } from './cli-agent-output.component';
import { AgentContinueInputComponent } from '../agent-continue-input/agent-continue-input.component';
import {
  AgentCardHeaderComponent,
} from './agent-card-header.component';
import { CliLaneUsageSummaryComponent } from './cli-lane-usage-summary.component';
import { resolveCliLaneUsage } from '../../../utils/lane-stats.adapters';
import {
  createAgentOutputParser,
  createStderrParser,
} from './agent-card.utils';
import {
  PermissionRequestCardComponent,
  QuestionCardComponent,
  type RenderSegment,
  type StderrSegment,
} from '@ptah-extension/chat-ui';
import { PtahBadgeDirective } from '@ptah-extension/ui';
import {
  LANE_WAITING_LABEL,
  LanePermissionView,
} from '../../../services/lane-permission-view';

@Component({
  selector: 'ptah-agent-card',
  standalone: true,
  imports: [
    SlicePipe,
    LucideAngularModule,
    AgentCardHeaderComponent,
    CliLaneUsageSummaryComponent,
    CliAgentOutputComponent,
    AgentContinueInputComponent,
    PermissionRequestCardComponent,
    QuestionCardComponent,
    PtahBadgeDirective,
  ],
  providers: [LanePermissionView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="border border-base-content/10 rounded-lg overflow-hidden bg-base-100 flex flex-col h-full"
      [class.!h-auto]="presentation() === 'flat'"
      [class.!border-0]="presentation() === 'flat'"
      [class.!rounded-none]="presentation() === 'flat'"
      [class.!bg-transparent]="presentation() === 'flat'"
      [class.!overflow-visible]="presentation() === 'flat'"
      [class.text-[13px]]="presentation() === 'flat'"
      [class.leading-[1.6]]="presentation() === 'flat'"
    >
      @if (presentation() === 'card') {
        <!-- Card header -->
        <ptah-agent-card-header
          class="block flex-shrink-0"
          [agent]="agent()"
          [isStopping]="isStopping()"
          [isResuming]="isResuming()"
          [closable]="closable()"
          presentation="card"
          (toggleExpanded)="toggleExpanded.emit()"
          (stopAgent)="stopAgent($event)"
          (resumeAgent)="resumeAgent($event)"
          (closeLane)="closeLane.emit(agent().agentId)"
        />

        <ptah-cli-lane-usage-summary
          class="block px-2 pt-1.5 flex-shrink-0"
          [agent]="agent()"
        />
      }

      @if (presentation() === 'flat' || agent().expanded) {
        <!-- Task description (collapsible, default collapsed) -->
        @if (presentation() === 'card') {
          <details class="border-t border-base-content/10 flex-shrink-0">
            <summary
              class="px-2 py-0.5 cursor-pointer select-none hover:bg-base-200/30 transition-colors flex items-center gap-1.5"
              [class.!px-0]="presentation() === 'flat'"
            >
              <span class="text-[10px] font-medium text-base-content-muted"
                >Task</span
              >
              @if (agent().parentSessionId) {
                <span
                  class="text-[9px] text-base-content-muted ml-auto"
                  [title]="'Parent session: ' + agent().parentSessionId!"
                  >Parent:
                  {{ agent().parentSessionId! | slice: 0 : 8 }}&hellip;</span
                >
              }
            </summary>
            <div class="px-2 pb-1" [class.!px-0]="presentation() === 'flat'">
              <p
                class="text-[11px] leading-snug text-base-content-muted line-clamp-3"
              >
                {{ agent().task }}
              </p>
            </div>
          </details>
        }

        <!-- Output -->
        @if (
          agent().stdout ||
          agent().stderr ||
          agent().segments.length > 0 ||
          agent().streamEvents.length > 0
        ) {
          <ptah-cli-agent-output
            class="block flex-1 min-h-0 overflow-hidden"
            [class.!overflow-visible]="presentation() === 'flat'"
            [agentId]="agent().agentId"
            [usage]="laneUsage()"
            [segments]="agent().segments"
            [stdoutSegments]="parsedOutput()"
            [streamEvents]="agent().streamEvents"
            [streamRevision]="agent().streamRevision"
            [stderrSegments]="parsedStderr()"
            [isStreaming]="
              agent().status === 'running' || agent().status === 'starting'
            "
            [endedAt]="agent().completedAt"
            [scrollTrigger]="scrollTrigger()"
            [presentation]="presentation()"
          />
        }
        @if (presentation() === 'card') {
          @if (
            prompts.waiting() || prompts.notice() || prompts.resolvedStatus()
          ) {
            <div
              class="flex flex-col gap-1.5 px-2 pt-1.5 flex-shrink-0"
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
              @if (!prompts.waiting() && prompts.resolvedStatus(); as status) {
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
          <ptah-agent-continue-input class="block px-2 pb-2" [agent]="agent()" variant="panel" />
        }
      }
    </div>
  `,
})
export class AgentCardComponent {
  readonly showStats = input(true);
  readonly agent = input.required<MonitoredAgent>();
  readonly closable = input(false);
  readonly presentation = input<'card' | 'flat'>('card');
  readonly toggleExpanded = output<void>();
  readonly closeLane = output<string>();

  constructor() {
    this.prompts.connect({ agent: this.agent });
  }

  private readonly rpcService = inject(ClaudeRpcService);
  /** Records a user Stop so the lane reads "Stopping…", then stopped (never failed). */
  private readonly monitor = inject(AgentMonitorStore, { optional: true });
  /** This lane's approval and question prompts (Req 5), card presentation only. */
  protected readonly prompts = inject(LanePermissionView);
  protected readonly waitingLabel = LANE_WAITING_LABEL;
  protected readonly CheckIcon = Check;
  readonly isStopping = signal(false);
  readonly isResuming = signal(false);

  protected readonly laneUsage = computed(() => resolveCliLaneUsage(this.agent()));
  /**
   * Per-card parsers. Output only grows by appending between trims, so each
   * update re-parses the tail instead of the whole 50-100 KB buffer.
   */
  private readonly parseStdout = createAgentOutputParser();
  private readonly parseStderrBuffer = createStderrParser();

  /** The raw buffers, so a change to any other agent field does not re-parse. */
  private readonly stdout = computed(() => this.agent().stdout);
  private readonly stderr = computed(() => this.agent().stderr);

  /** Keep raw stdout available alongside structured output. */
  readonly parsedOutput = computed((): RenderSegment[] => {
    const stdout = this.stdout();
    return stdout ? this.parseStdout(stdout) : [];
  });

  /**
   * Parse stderr into informational vs error segments.
   */
  readonly parsedStderr = computed((): StderrSegment[] => {
    const stderr = this.stderr();
    return stderr ? this.parseStderrBuffer(stderr) : [];
  });

  /** Trigger for auto-scroll in the output component */
  readonly scrollTrigger = computed(() => {
    const a = this.agent();
    return (
      a.stdout.length +
      a.stderr.length +
      a.segments.length +
      a.streamEvents.length
    );
  });

  /** Stop a running agent via RPC */
  async stopAgent(event: Event): Promise<void> {
    event.stopPropagation();
    const agentId = this.agent().agentId;
    this.isStopping.set(true);
    this.monitor?.markStopRequested(agentId);
    // `result.success` is only the transport: the host reports a refused or
    // failed stop as `{ success: false, error }` inside a successful call.
    let error: string | undefined = 'The lane could not be stopped.';
    try {
      const result = await this.rpcService.call('agent:stop', { agentId });
      if (result.isSuccess() && result.data.success) error = undefined;
      else error = (result.isSuccess() ? result.data.error : result.error) ?? error;
    } catch (caught: unknown) {
      // degradation-audit: reported - the reason is shown in the lane footer.
      error = caught instanceof Error ? caught.message : error;
    } finally {
      this.isStopping.set(false);
      // A refused or failed stop leaves the lane as it was: no "Stopping…".
      if (error === undefined) this.monitor?.confirmStopRequest(agentId);
      else this.monitor?.cancelStopRequest(agentId, error);
    }
  }

  /** Resume a completed/failed CLI agent session via RPC */
  async resumeAgent(event: Event): Promise<void> {
    event.stopPropagation();
    const agent = this.agent();
    if (!agent.cliSessionId) return;

    this.isResuming.set(true);
    try {
      await this.rpcService.call('agent:resumeCliSession', {
        cliSessionId: agent.cliSessionId,
        cli: agent.cli,
        task: agent.task,
        parentSessionId: agent.parentSessionId,
        ptahCliId: agent.ptahCliId,
        previousAgentId: agent.agentId,
      });
    } finally {
      this.isResuming.set(false);
    }
  }
}
