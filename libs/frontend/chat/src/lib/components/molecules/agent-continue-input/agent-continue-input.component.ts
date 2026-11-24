import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule, Play, Square } from 'lucide-angular';
import type { MonitoredAgent } from '@ptah-extension/chat-streaming';
import { isAgentBudgetStopReason } from '@ptah-extension/shared';
import { COMPOSER_STOP_BUTTON_CLASS } from '@ptah-extension/chat-ui';
import { laneGuardStopText } from '../agent-card/agent-card-header.component';
import { LaneComposerComponent } from '../lane-composer/lane-composer.component';

/**
 * Hosts the lane composer for the agent card panel and the canvas lane view.
 * It owns the visibility rules (no field while starting or without a way to
 * continue; Stop alone then) and the terminal status line. The canvas
 * (`composer`) mount puts Stop / Resume session into the composer toolbar.
 */
@Component({
  selector: 'ptah-agent-continue-input',
  standalone: true,
  imports: [LaneComposerComponent, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (
      visible() || agent().status === 'starting' ||
      (variant() === 'composer' &&
        (agent().status === 'running' ||
          agent().status === 'starting' ||
          terminalStatus()))
    ) {
      <div class="flex flex-col gap-1 pb-2">
        @if (visible()) {
          <ptah-lane-composer
            [agentId]="agent().agentId"
            [laneLabel]="agent().displayName || agent().cli"
            [cli]="agent().cli"
            [stopped]="!active()"
            [resumePath]="resumePath()"
            [showLaneControls]="variant() === 'composer'"
            [resumable]="!!agent().cliSessionId"
            [stopPending]="stopPending()"
            [resumePending]="resumePending()"
            (stopRequested)="stopRequested.emit($event)"
            (resumeRequested)="resumeRequested.emit($event)"
          />
        } @else if (variant() === 'composer' || agent().status === 'starting') {
          <!-- No message field: Stop (or Resume session) stands alone. -->
          @if (active()) {
            <button type="button" [class]="stopButtonClass" aria-label="Stop generating" title="Stop generating"
              [disabled]="stopPending()" (click)="stopRequested.emit($event)">
              @if (stopPending()) { <span class="loading loading-spinner loading-xs"></span> }
              @else { <lucide-angular [img]="SquareIcon" class="w-3.5 h-3.5" aria-hidden="true" /> }
            </button>
          } @else if (agent().cliSessionId) {
            <button type="button" [class]="stopButtonClass" [attr.aria-label]="'Resume ' + agent().cli + ' session'"
              title="Resume session" [disabled]="resumePending()" (click)="resumeRequested.emit($event)">
              @if (resumePending()) { <span class="loading loading-spinner loading-xs"></span> }
              @else { <lucide-angular [img]="PlayIcon" class="w-3.5 h-3.5" aria-hidden="true" /> }
            </button>
          }
        }
        @if (variant() === 'composer' && terminalStatus(); as message) {
          <span class="px-1 text-[11px] text-warning">{{ message }}</span>
        }
      </div>
    }
  `,
})
export class AgentContinueInputComponent {
  readonly agent = input.required<MonitoredAgent>();
  /** `composer`: the canvas lane view (Stop / Resume in the toolbar, terminal status). */
  readonly variant = input<'panel' | 'composer'>('panel');
  readonly stopPending = input(false);
  readonly resumePending = input(false);
  readonly stopRequested = output<Event>();
  readonly resumeRequested = output<Event>();
  protected readonly SquareIcon = Square;
  protected readonly PlayIcon = Play;
  protected readonly stopButtonClass = COMPOSER_STOP_BUTTON_CLASS;
  protected readonly active = computed(() => {
    const status = this.agent().status;
    return status === 'running' || status === 'starting';
  });
  protected readonly terminalStatus = computed(() => {
    const agent = this.agent();
    const status = agent.status === 'failed' ? 'Failed' : agent.status === 'timeout' ? 'Timed out'
      : agent.status === 'stopped'
        ? (isAgentBudgetStopReason(agent.stopReason) ? 'Stopped by Ptah budget monitor' : 'Stopped')
        : '';
    const reason = laneGuardStopText(agent.stopReason);
    return this.active() ? '' : [status, reason].filter(Boolean).join(' · ');
  });
  protected readonly visible = computed(() => {
    const agent = this.agent();
    if (agent.status === 'starting') return false;
    const messaging = agent.effectiveCapabilities?.messaging;
    return agent.supportsContinuation === true || !!agent.cliSessionId ||
      (agent.status === 'running' && (
        messaging?.steer.state === 'supported' || messaging?.continuation.state === 'supported'
      ));
  });
  protected readonly resumePath = computed(() => {
    const agent = this.agent();
    if (this.active()) return null;
    if (
      agent.supportsContinuation === true &&
      agent.continuationExpired !== true
    )
      return 'Continue warm session';
    if (agent.cliSessionId)
      return `Resume CLI session ${agent.cliSessionId.slice(0, 8)}`;
    return 'Start fresh handoff';
  });
}
