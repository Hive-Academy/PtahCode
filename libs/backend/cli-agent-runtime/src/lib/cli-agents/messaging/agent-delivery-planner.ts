import type {
  AgentMessageDelivery,
  AgentMessagePreview,
  AgentProcessInfo,
  EffectiveLaneCapabilities,
  LaneTurnRequest,
  LaneTurnSettings,
} from '@ptah-extension/shared';
import { blockedLaneCommand, blockedLaneCommandReason } from '../cli-adapters/lane-command-filter';
import { LANE_IMAGES_NEED_RUNNING_TEXT } from './agent-effective-capabilities';

export interface AgentDeliveryPlanInput {
  readonly agentId: AgentMessagePreview['agentId'];
  readonly delivery: AgentMessageDelivery;
  readonly info?: AgentProcessInfo;
  readonly effectiveCapabilities: EffectiveLaneCapabilities;
  readonly hasLiveHandle: boolean;
}

/** Pure plan used for both preview and the send-time recheck. */
export function planAgentDelivery(input: AgentDeliveryPlanInput): AgentMessagePreview {
  const { agentId, delivery, info, effectiveCapabilities, hasLiveHandle } = input;
  const messaging = effectiveCapabilities.messaging;
  const has = (key: keyof typeof messaging) => messaging[key].state === 'supported';
  const base = { agentId, delivery, effectiveCapabilities };
  const refuse = (reason: string): AgentMessagePreview => ({ ...base, mode: 'unsupported', supported: false, usesResume: false, reason });
  // Stable code: the message coordinator maps `not_found` to its typed refusal reason.
  if (!info) return refuse('not_found');
  if (info.status === 'starting')
    return refuse('The lane is starting; try again when its handle is ready.');
  const running = info.status === 'running';
  const cold = !hasLiveHandle;
  if (cold) {
    if (!info.cliSessionId || !has('resume')) return refuse('No resumable session is available.');
    if (delivery === 'now') return refuse('This lane has no active turn to steer. Resume it as a new turn.');
    return { ...base, mode: 'start-turn', supported: true, usesResume: true };
  }
  if (delivery === 'queue') {
    if (!has('continuation')) {
      if (!running && info.cliSessionId && has('resume'))
        return { ...base, mode: 'start-turn', supported: true, usesResume: true };
      return refuse('The live handle cannot start another turn.');
    }
    return { ...base, mode: running ? 'queue-next-turn' : 'start-turn', supported: true, usesResume: false };
  }
  if (!running) return refuse('There is no active turn to steer.');
  if (has('steer')) return { ...base, mode: 'steer', supported: true, usesResume: false };
  if (has('interrupt') && has('continuation')) return {
    ...base, mode: 'interrupt-resume', supported: true, usesResume: false,
    lossDisclosure: { kind: 'partial-turn-work-lost', confirmationRequired: true, text: 'Interrupting discards unfinished work from the current turn.' },
  };
  return refuse('The live handle cannot steer or interrupt and continue this turn.');
}

/** Why a turn request cannot go with this plan. Nothing is stored for a refusal. */
export interface TurnInputRefusal {
  readonly code: 'turn-input-unsupported' | 'turn-options-refused';
  readonly reason: string;
}

/** Reason used when the plan carries no resolved turn input yet. */
export const TURN_INPUT_NOT_REPORTED = 'Lane did not report its options.';

/**
 * Refusal for the turn input of one send, checked against the plan's resolved
 * `turnInput`; undefined when everything can go. Settings equal to `current`
 * are not a change and are never refused.
 *
 * Order: a blocked `/command` first (it applies on live and cold plans alike),
 * then images, files, model and effort.
 */
export function turnInputRefusal(
  plan: AgentMessagePreview,
  message: string,
  turn: LaneTurnRequest | undefined,
  current: LaneTurnSettings = {},
): TurnInputRefusal | undefined {
  const input = plan.effectiveCapabilities.turnInput;
  const blocked = blockedLaneCommand(message, input?.commands.blocked ?? []);
  if (blocked) return { code: 'turn-input-unsupported', reason: blockedLaneCommandReason(blocked) };
  if (!turn) return undefined;
  const unsupported = (reason: string): TurnInputRefusal => ({ code: 'turn-input-unsupported', reason });
  const model = turn.model !== undefined && turn.model !== current.model;
  const effort = turn.reasoningEffort !== undefined && turn.reasoningEffort !== current.reasoningEffort;
  const images = (turn.images?.length ?? 0) > 0;
  const files = (turn.files?.length ?? 0) > 0;
  if (!input) return model || effort || images || files ? unsupported(TURN_INPUT_NOT_REPORTED) : undefined;
  if (images) {
    // A cold resume carries images only where the manifest says its first
    // turn does (`images.onResume`); the resolved item then also says
    // whether this lane can (a named-account Claude lane cannot).
    if (plan.usesResume && input.images.onResume !== true) return unsupported(LANE_IMAGES_NEED_RUNNING_TEXT);
    if (input.images.state !== 'supported') return unsupported(input.images.reason ?? 'This lane cannot take images.');
    if (plan.mode === 'steer' && input.images.onSteer !== true)
      return unsupported('Images cannot ride on a steer for this lane; queue the message instead.');
  }
  if (files && input.files.state !== 'supported')
    return unsupported(input.files.reason ?? 'This lane cannot take attached files.');
  if (model && input.model.state !== 'supported')
    return unsupported(input.model.reason ?? 'This lane cannot change its model per turn.');
  if (effort && input.effort.state !== 'supported')
    return unsupported(input.effort.reason ?? 'This lane cannot change its reasoning effort per turn.');
  if ((model || effort) && plan.mode === 'steer') {
    return {
      code: 'turn-options-refused',
      reason: `${model ? 'A model' : 'A reasoning effort'} change applies from the next turn; use Send to queue it.`,
    };
  }
  return undefined;
}
