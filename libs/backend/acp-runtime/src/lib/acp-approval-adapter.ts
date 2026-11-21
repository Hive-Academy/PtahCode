/**
 * The approval adapter: an ACP `session/request_permission` request asked of a
 * {@link ProviderApprovalSink} (the chat's approval UI), and the sink's
 * decision turned back into the ACP answer.
 *
 * Options are chosen by `kind`, never by id or position (ids and order differ
 * per agent):
 * - `accept` -> `allow_once`;
 * - `acceptForSession` -> `allow_once` only. ACP `allow_always` asks the agent
 *   to remember the grant with a scope and duration the agent chooses, which
 *   can outlive this session; a session-scoped approval must not widen into
 *   that (PR #1445 review). Ptah keeps no allow-list of its own (A17), so the
 *   agent asks again next time;
 * - `decline` -> `reject_once`;
 * - `cancel`, an abort, a sink that rejects, or a decision with no matching
 *   option -> `cancelled`. Nothing but an explicit accept ever allows.
 */
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type {
  ProviderApprovalDecision,
  ProviderApprovalRequest,
  ProviderApprovalSink,
} from '@ptah-extension/provider-session-contracts';
import {
  cancelledResponse,
  firstOptionIdOfKind,
  offeredOptions,
  selectedResponse,
  toolTitleOf,
} from './acp-permission-policy';
import { isRecord } from './acp-session-helpers';

const FALLBACK_TITLE = 'a tool call';

/** The option kinds tried for a decision, in order. */
const KIND_LADDER: Readonly<Record<ProviderApprovalDecision, readonly string[]>> = {
  accept: ['allow_once'],
  acceptForSession: ['allow_once'],
  decline: ['reject_once'],
  cancel: [],
};

export interface AcpApprovalOutcome {
  readonly decision: ProviderApprovalDecision;
  readonly response: RequestPermissionResponse;
  /** True unless an allow option was selected. */
  readonly refused: boolean;
}

/** The neutral request a sink is shown. Never throws. */
export function toProviderApprovalRequest(
  request: RequestPermissionRequest,
  requestId: string,
): ProviderApprovalRequest {
  const toolCall: unknown = isRecord(request) ? request.toolCall : undefined;
  const call = isRecord(toolCall) ? toolCall : {};
  return {
    requestId,
    ...(typeof call['toolCallId'] === 'string'
      ? { toolCallId: call['toolCallId'] }
      : {}),
    title: toolTitleOf(request) ?? FALLBACK_TITLE,
    ...(typeof call['kind'] === 'string' ? { kind: call['kind'] } : {}),
    ...(call['rawInput'] !== undefined ? { input: call['rawInput'] } : {}),
  };
}

/** The ACP answer for a decision. Never throws. */
export function acpResponseForDecision(
  request: RequestPermissionRequest,
  decision: ProviderApprovalDecision,
): { response: RequestPermissionResponse; refused: boolean } {
  const offered = offeredOptions(request);
  const ladder = Object.prototype.hasOwnProperty.call(KIND_LADDER, decision)
    ? KIND_LADDER[decision]
    : [];
  for (const kind of ladder) {
    const optionId = firstOptionIdOfKind(offered, kind);
    if (optionId !== undefined) {
      return {
        response: selectedResponse(optionId),
        refused: !kind.startsWith('allow_'),
      };
    }
  }
  return { response: cancelledResponse(), refused: true };
}

/**
 * Ask the sink and map its answer. Resolves `cancel` when `signal` aborts
 * first or the sink rejects; never rejects itself.
 */
export async function requestAcpApproval(
  sink: ProviderApprovalSink,
  request: RequestPermissionRequest,
  approval: ProviderApprovalRequest,
  signal: AbortSignal,
): Promise<AcpApprovalOutcome> {
  let decision: ProviderApprovalDecision = 'cancel';
  if (!signal.aborted) {
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<'cancel'>((resolve) => {
      onAbort = () => resolve('cancel');
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      decision = await Promise.race([sink.request(approval, signal), aborted]);
    } catch {
      // degradation-audit: optional-capability - a failing sink never authorizes;
      // the request is answered `cancelled`.
      decision = 'cancel';
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
    // A sink that aborted synchronously and then returned an already settled
    // `accept` can win the race above; an abort always wins (PR #1445 review).
    if (signal.aborted) decision = 'cancel';
  }
  // Own keys only: a sink answer such as `toString` is no decision.
  if (!Object.prototype.hasOwnProperty.call(KIND_LADDER, decision)) decision = 'cancel';
  return { decision, ...acpResponseForDecision(request, decision) };
}
