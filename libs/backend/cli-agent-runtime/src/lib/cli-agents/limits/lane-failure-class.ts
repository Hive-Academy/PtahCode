import {
  LANE_USER_STOP_CLASS,
  type AgentStatus,
  type LaneCompletionVerdict,
  type LaneFailureClass,
} from '@ptah-extension/shared';

export interface LaneFailureClassInput {
  readonly verdict: LaneCompletionVerdict;
  readonly failureKind?: string | null;
  readonly status: AgentStatus;
  readonly authMatched: boolean;
  /** API rate-limit wording matched this turn's bounded output; not quota. */
  readonly rateLimited?: boolean;
}

/**
 * Fixed precedence: successful evidence, a caller stop, quota, rate limit,
 * timeout, auth, crash, output. A caller stop (`stopped` verdict) is
 * `user-stop`, which routing statistics leave out.
 */
export function classifyLaneFailureClass(
  input: LaneFailureClassInput,
): LaneFailureClass | null {
  if (input.verdict === 'delivered' || input.verdict === 'unverified')
    return null;
  if (input.verdict === 'stopped') return LANE_USER_STOP_CLASS;
  if (input.failureKind === 'quota') return 'usage-limit';
  if (input.rateLimited) return 'usage-limit';
  if (input.status === 'timeout') return 'timeout';
  if (input.authMatched) return 'auth';
  if (input.status === 'failed') return 'crash';
  if (input.status === 'completed' && input.verdict === 'no-deliverable')
    return 'bad-output';
  return null;
}
