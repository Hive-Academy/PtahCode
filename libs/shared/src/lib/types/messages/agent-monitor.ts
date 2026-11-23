import type { AgentActionNotice } from '../agent-action.types';
import type {
  AgentDeliveryReceipt,
  AgentId,
  LaneCompletionVerdict,
  LaneStopReason,
  ParentDeliveryState,
} from '../agent-process.types';

/** Payload for `agent-monitor:message-receipt`. */
export interface AgentMonitorMessageReceiptPayload {
  readonly receipt: AgentDeliveryReceipt;
}

/** Delivery state for a completion or report envelope sent to the parent. */
export interface AgentMonitorParentDeliveryPayload {
  readonly agentId: AgentId;
  readonly kind: 'completion' | 'report';
  readonly state: ParentDeliveryState;
  readonly deliveryId?: string;
  readonly parentSessionId?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
  readonly attempts?: number;
  readonly lastError?: string;
  readonly nextRetryAt?: number;
  readonly waitingReason?: 'parent-offline';
  readonly everDispatched?: boolean;
  /** Set on a view-only `not-saved` push that withdraws the earlier notice. */
  readonly removed?: true;
  readonly preview?: string;
  readonly verdict?: LaneCompletionVerdict;
  readonly stopReason?: LaneStopReason;
}

/**
 * Payload for `agent-monitor:reparented` (TASK_2026_876).
 *
 * Sent once when a kept handoff settles lane adoption. `parentSessionId` is
 * the successor tab id. The existing resolve path later rewrites it to the
 * successor SDK id.
 */
export interface AgentMonitorReparentedPayload {
  readonly agentIds: readonly string[];
  readonly parentSessionId: string;
}

/**
 * Payload for `agent-monitor:action-notice` (TASK_2026_2297_920a, P5).
 *
 * A Ptah monitor asked a live lane for a handoff or paused its new work, or released it. The lane
 * stays alive. `notice` is the notice that now holds, or `null` when none holds any more.
 * `text` is the host-rendered Ptah sentence for the parent and the card; it holds only trusted
 * values and is empty with a `null` notice. Later `agent-monitor:spawned` and
 * `agent-monitor:exited` payloads carry the current notice in `AgentProcessInfo.actionNotice`,
 * and a payload without it clears the card state.
 */
export interface AgentMonitorActionNoticePayload {
  readonly agentId: string;
  readonly notice: AgentActionNotice | null;
  readonly text: string;
}
