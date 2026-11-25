import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule, Play, Square } from 'lucide-angular';
import type { MonitoredAgent } from '@ptah-extension/chat-streaming';
import { isAgentBudgetStopReason, type CliAdapterManifest } from '@ptah-extension/shared';
import { COMPOSER_STOP_BUTTON_CLASS } from '@ptah-extension/chat-ui';
import { laneGuardStopText } from '../agent-card/agent-card-header.component';
import { LaneComposerComponent } from '../lane-composer/lane-composer.component';
import type { LaneStateChip } from '../lane-composer/lane-composer-labels';
import { PtahTooltipDirective } from '@ptah-extension/ui';

/**
 * Hosts the lane composer for the agent card panel and the canvas lane view.
 * It owns the visibility rules (no field while starting or without a way to
 * continue; Stop alone then) and the lane state (Stopping…, Stopped,
 * Interrupted, Stop failed). The state is a chip inside the composer's
 * toolbar, never a line under it: main chat has no lines under its input,
 * and lines there pushed the lane panel past its height (two scrollbars).
 * The canvas (`composer`) mount puts Stop / Resume session into the toolbar.
 */
@Component({
  selector: 'ptah-agent-continue-input',
  standalone: true,
  imports: [LaneComposerComponent, LucideAngularModule, PtahTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (
      visible() || agent().status === 'starting' ||
      (variant() === 'composer' &&
        (agent().status === 'running' ||
          agent().status === 'starting' ||
          laneState()))
    ) {
      <div class="flex items-center gap-2 pb-2">
        @if (visible()) {
          <ptah-lane-composer
            class="min-w-0 flex-1"
            [agentId]="agent().agentId"
            [laneLabel]="agent().displayName || agent().cli"
            [cli]="agent().displayName || agent().cli"
            [stopped]="!active()"
            [showLaneControls]="variant() === 'composer'"
            [resumable]="!!agent().cliSessionId"
            [stopPending]="stopBusy()"
            [resumePending]="resumePending()"
            [laneState]="laneState()"
            (stopRequested)="stopRequested.emit($event)"
            (resumeRequested)="resumeRequested.emit($event)"
            (accepted)="messageAccepted.emit()"
          />
        } @else if (variant() === 'composer' || agent().status === 'starting') {
          <!-- No message field: Stop (or Resume session) stands alone. -->
          @if (active()) {
            <button type="button" [class]="stopButtonClass" aria-label="Stop generating" title="Stop generating"
              [disabled]="stopBusy()" (click)="stopRequested.emit($event)">
              @if (stopBusy()) { <span class="loading loading-spinner loading-xs"></span> }
              @else { <lucide-angular [img]="SquareIcon" class="w-3.5 h-3.5" aria-hidden="true" /> }
            </button>
          } @else if (agent().cliSessionId) {
            <button type="button" [class]="stopButtonClass" [attr.aria-label]="'Resume ' + agent().cli + ' session'"
              title="Resume session" [disabled]="resumePending()" (click)="resumeRequested.emit($event)">
              @if (resumePending()) { <span class="loading loading-spinner loading-xs"></span> }
              @else { <lucide-angular [img]="PlayIcon" class="w-3.5 h-3.5" aria-hidden="true" /> }
            </button>
          }
          <!-- No composer card here: the state chip sits beside the button, on the same row. -->
          @if (laneState(); as state) {
            <span class="min-w-0 truncate text-xs" [class.text-state-idle]="state.tone === 'idle'"
              [class.text-state-need]="state.tone === 'need'" [class.text-state-err]="state.tone === 'err'"
              tabindex="0" [attr.role]="state.tone === 'err' ? 'alert' : 'status'" [ptahTooltip]="state.detail"
              data-testid="lane-state-chip">{{ state.label }}@if (state.detail !== state.label) {<span class="sr-only">: {{ state.detail }}</span>}</span>
          }
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
  /** The lane accepted a message the user sent from this composer. */
  readonly messageAccepted = output<void>();
  readonly resumeRequested = output<Event>();
  protected readonly SquareIcon = Square;
  protected readonly PlayIcon = Play;
  protected readonly stopButtonClass = COMPOSER_STOP_BUTTON_CLASS;
  protected readonly active = computed(() => {
    const status = this.agent().status;
    return status === 'running' || status === 'starting';
  });
  /** The user pressed Stop and the lane's process has not exited yet. */
  protected readonly stopping = computed(() => this.agent().stopRequestedAt !== undefined);
  protected readonly stopBusy = computed(() => this.stopPending() || this.stopping());
  /** The lane state chip, or null while the lane runs normally. */
  protected readonly laneState = computed((): LaneStateChip | null => laneStateChip(this.agent()));
  protected readonly visible = computed(() => {
    const agent = this.agent();
    if (agent.status === 'starting') return false;
    if (agent.supportsContinuation === true || !!agent.cliSessionId) return true;
    // A running lane takes a message when it steers or continues. The host's
    // effective snapshot is taken at spawn, before an ACP (Grok) session is
    // set up, so it says `continuation: unsupported` and `supportsContinuation`
    // is false until the first turn ends. The adapter's declared manifest says
    // what the lane can do once the session exists, so either set counts (F3).
    // The composer's delivery previews still decide what a send does.
    return agent.status === 'running' &&
      (takesMessages(agent.effectiveCapabilities?.messaging) || takesMessages(agent.potentialCapabilities?.messaging));
  });
}

/**
 * The lane state as the composer chip. Order: a failed Stop (announced), a
 * pending stop, then the terminal status with the host's reason. A running
 * lane has no chip.
 */
export function laneStateChip(agent: MonitoredAgent): LaneStateChip | null {
  if (agent.stopError) {
    return { label: 'Stop failed', detail: `Stop failed: ${agent.stopError}`, tone: 'err' };
  }
  // Same words as the dock pill: "Stopping…" until the process exits.
  if (agent.stopRequestedAt !== undefined) {
    return { label: 'Stopping…', detail: 'Stopping: waiting for the lane process to exit.', tone: 'idle' };
  }
  if (agent.status === 'running' || agent.status === 'starting' || agent.status === 'completed') return null;
  // A user stop reads stopped even when an older host reports it as failed.
  const failed = agent.status === 'failed' && !agent.stoppedByUser;
  const budget = isAgentBudgetStopReason(agent.stopReason);
  const status = failed ? 'Failed' : agent.status === 'timeout' ? 'Timed out'
    : budget ? 'Stopped by Ptah budget monitor'
      : agent.stoppedByUser ? 'Stopped by you' : 'Stopped';
  const reason = laneGuardStopText(agent.stopReason);
  const detail = [status, reason].filter(Boolean).join(' · ');
  const label = failed ? 'Failed' : agent.status === 'timeout' ? 'Timed out'
    : budget ? 'Budget stop'
      : agent.stopReason === 'host-restart' ? 'Interrupted'
        : 'Stopped';
  return { label, detail, tone: failed || agent.status === 'timeout' ? 'err' : budget ? 'need' : 'idle' };
}

/** A lane that steers or continues can take a message while it runs. */
function takesMessages(messaging: CliAdapterManifest['messaging'] | undefined): boolean {
  return messaging?.steer.state === 'supported' || messaging?.continuation.state === 'supported';
}
