/**
 * Classifies why a queued continuation was refused (Component 7).
 *
 * Only a refusal the lane can recover from by itself is transient: the
 * manager's `AgentContinueError` with code `busy` (the previous turn has not
 * torn down yet). Every other code — and every error this file does not
 * recognise — is permanent, the safe default: a permanent rejection keeps the
 * body for a manual Retry, while a wrongly-transient one would be re-sent
 * automatically.
 *
 * The error is matched by shape, not `instanceof`, so this file does not import
 * the manager module at runtime (the manager imports the router, which imports
 * this classifier).
 */
import type { AgentContinueErrorCode } from '../agent-process-manager.service';

export type ContinuationFailureReason =
  | 'continuation_transient'
  | 'continuation_rejected';

/** The refusal of per-turn settings (model / effort) a lane would not accept. */
const TURN_OPTIONS_REFUSED = 'turn-options-refused';
type ClassifiedCode = AgentContinueErrorCode | typeof TURN_OPTIONS_REFUSED;

/** `lastError` is stored on the envelope, whose schema caps it at 200 chars. */
const MAX_LAST_ERROR = 200;

const KNOWN_CODES: ReadonlySet<string> = new Set<ClassifiedCode>([
  'not_found', 'invalid_params', 'unsupported', 'busy', 'released', 'account_refused',
  TURN_OPTIONS_REFUSED, 'unknown',
]);

const TRANSIENT_CODES: ReadonlySet<ClassifiedCode> = new Set<ClassifiedCode>([
  'busy',
]);

function isContinueErrorCode(value: unknown): value is ClassifiedCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

function continueErrorCode(error: unknown): ClassifiedCode | undefined {
  if (!(error instanceof Error) || error.name !== 'AgentContinueError') return undefined;
  if (!('code' in error)) return undefined;
  return isContinueErrorCode(error.code) ? error.code : undefined;
}

export function classifyContinuationFailure(error: unknown): ContinuationFailureReason {
  const code = continueErrorCode(error);
  return code !== undefined && TRANSIENT_CODES.has(code)
    ? 'continuation_transient'
    : 'continuation_rejected';
}

/** A permanent failure with the receipt code and the text to keep as `lastError`. */
export interface ContinuationFailureDetail {
  readonly reason: ContinuationFailureReason;
  /** Set for a settings refusal: the envelope fails with this reason code. */
  readonly reasonCode?: typeof TURN_OPTIONS_REFUSED;
  /** The refusal text (≤ 200 chars), only for a settings refusal. */
  readonly lastError?: string;
}

/**
 * {@link classifyContinuationFailure} plus what a settings refusal needs:
 * `turn-options-refused` is terminal and never retried (the provider would
 * refuse the same settings again), and its message — fixed refusal text from
 * the adapter — becomes the envelope's `lastError`.
 */
export function classifyContinuationFailureDetail(error: unknown): ContinuationFailureDetail {
  const reason = classifyContinuationFailure(error);
  if (continueErrorCode(error) !== TURN_OPTIONS_REFUSED || !(error instanceof Error)) return { reason };
  return {
    reason,
    reasonCode: TURN_OPTIONS_REFUSED,
    lastError: error.message.slice(0, MAX_LAST_ERROR),
  };
}
