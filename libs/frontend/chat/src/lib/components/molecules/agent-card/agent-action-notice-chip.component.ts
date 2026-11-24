/**
 * Agent Action Notice Chip
 *
 * Short chip for the latest Ptah ask or pause notice of an agent that is still running: a CLI
 * lane card or an SDK subagent card. The full Ptah sentence is the tooltip and sr-only text.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  LIVE_SUBAGENT_STATUSES,
  type MonitoredAgent,
  type SubagentRecord,
} from '@ptah-extension/chat-streaming';
import {
  formatAgentActionReason,
  formatAgentActorLabel,
  formatBudgetPauseNotice,
  type AgentActionNotice,
} from '@ptah-extension/shared';

/** A live agent's Ptah notice as a card shows it. */
export interface LaneActionNoticeView {
  /** Short chip text. */
  readonly label: string;
  /** Full Ptah sentence: who acted, why and what happens next. */
  readonly text: string;
  readonly paused: boolean;
}

/**
 * Reader copy for a notice whose host text did not arrive (a card built from a spawn or exit
 * payload). It speaks to the person, not to the agent, and keeps the agent live.
 */
function noticeFallbackText(notice: AgentActionNotice, id: string): string {
  if (notice.action === 'paused') return formatBudgetPauseNotice(notice, id);
  return `${formatAgentActorLabel(notice)} asked ${id} for a handoff because ${formatAgentActionReason(notice)}. The execution remains live.`;
}

function noticeView(
  notice: AgentActionNotice,
  hostText: string | undefined,
  id: string,
): LaneActionNoticeView | null {
  if (notice.action === 'ended') return null;
  const text = hostText || noticeFallbackText(notice, id);
  return notice.action === 'paused'
    ? { label: 'Paused · still running', text, paused: true }
    : { label: 'Handoff requested', text, paused: false };
}

/**
 * Chip view for a lane that is still running. A pause only holds new work: the lane stays alive,
 * so the chip says so. A lane that has left `running` shows nothing, because its completion
 * result already carries the notice as past-tense context.
 */
export function laneActionNoticeView(
  agent: Pick<MonitoredAgent, 'agentId' | 'status' | 'actionNotice' | 'actionNoticeText'>,
): LaneActionNoticeView | null {
  const notice = agent.actionNotice;
  if (!notice || (agent.status !== 'running' && agent.status !== 'starting')) return null;
  return noticeView(notice, agent.actionNoticeText, String(agent.agentId));
}

/** Chip view for an SDK subagent that is still live (pending, running or in background). */
export function subagentActionNoticeView(
  record: Pick<
    SubagentRecord,
    'agentId' | 'teammateName' | 'status' | 'actionNotice' | 'actionNoticeText'
  >,
): LaneActionNoticeView | null {
  const notice = record.actionNotice;
  if (!notice || !LIVE_SUBAGENT_STATUSES.has(record.status)) return null;
  return noticeView(
    notice,
    record.actionNoticeText,
    record.teammateName || record.agentId || 'the subagent',
  );
}

@Component({
  selector: 'ptah-agent-action-notice-chip',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'min-w-0 truncate text-[10px] flex-shrink',
    '[class.text-warning]': 'view().paused',
    '[class.text-info]': '!view().paused',
    '[attr.data-testid]': 'testId()',
    '[attr.title]': 'view().text',
  },
  template: `<span class="sr-only">Notice: </span>{{ view().label
    }}<span class="sr-only">. {{ view().text }}</span>`,
})
export class AgentActionNoticeChipComponent {
  readonly view = input.required<LaneActionNoticeView>();
  readonly testId = input('lane-action-notice');
}
