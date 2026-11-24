import type { AgentMessageOutcome } from '@ptah-extension/shared';

type OutcomeReason = NonNullable<AgentMessageOutcome['reasonCode']>;

/**
 * User text for every refusal code a lane send, retry or cancel can return
 * (`AgentMessageOutcome.reasonCode`). The one place that maps the codes, so a
 * composer never shows a raw code such as `attachments-capacity`.
 */
const OUTCOME_TEXT: Readonly<Record<OutcomeReason, string>> = {
  'host-restarted': 'The host restarted before delivery.',
  'awaiting-resume': 'The lane must resume before it can take this message.',
  'resume-failed': 'The lane could not be resumed.',
  'queue-full': 'The lane queue is full. Try again when a queued message has started.',
  continuation_transient: 'The lane could not take the message right now. Try again.',
  continuation_rejected: 'The lane refused the message.',
  session_changed: 'The lane session changed before delivery.',
  agent_stopped: 'The lane stopped before receiving this message.',
  subprocess_released: 'The lane process was released.',
  agent_expired: 'The lane is gone.',
  'lane-at-limit': 'The lane is at its usage limit.',
  account_refused: 'The lane account refused the message.',
  'interrupted-undelivered': 'The turn was interrupted before the message was sent.',
  'cancelled-by-user': 'The message was cancelled.',
  'cancelled-by-sender': 'The sender cancelled the message.',
  'parent-session-deleted': 'The parent session is being deleted.',
  'dispatch-interrupted': 'Sending was interrupted.',
  'idempotency-key-requires-identity': 'The sender has no session identity for a repeatable send.',
  'storage-unavailable': 'Message storage is unavailable. Try again.',
  'storage-capacity': 'Message storage is full. Wait for earlier messages to finish.',
  'index-lost': 'Message storage lost its index. Try again.',
  'body-unavailable': 'The message text is no longer available.',
  'body-too-large': 'The message is too large to send.',
  not_found: 'The lane was not found.',
  capability_metadata_unavailable: 'The lane did not report what it can take.',
  'delivery-refused': 'The lane refused the message.',
  'delivery-failed': 'The message could not be delivered.',
  'identity-missing': 'The sender could not be verified.',
  'sender-unknown': 'The sender lane is unknown.',
  'self-target': 'A lane cannot message itself.',
  'parent-missing': 'The lane has no parent session.',
  'different-parent': 'The lanes belong to different parent sessions.',
  'workspace-missing': 'The lane has no workspace.',
  'different-workspace': 'The lanes are in different workspaces.',
  'rate-limited': 'Too many messages in a short time. Wait a moment.',
  'turn-options-refused': 'The lane refused the model or effort. Change the setting and send again.',
  'turn-input-unsupported': 'The lane cannot take this attachment or command.',
  'attachments-unavailable': 'The attachments are no longer held. Add them again.',
  'attachments-capacity':
    'Held attachments are using all attachment storage. Remove an image or wait for earlier messages to finish.',
  'no-session': 'The lane has no session to take the message.',
  'steer-rejected': 'The lane refused the message into the running turn.',
  'steer-unavailable': 'Send now is not available for this lane.',
  'interrupt-failed': 'The running turn could not be interrupted.',
  'confirmation-required': 'Confirm before sending: this may discard the running turn or run the work twice.',
  'immediate-unavailable': 'Send now is not available for this lane.',
  'continuation-unavailable': 'The lane cannot take a follow-up message.',
  'start-turn-failed': 'The lane could not start a turn.',
};

/** A `detail` that is a bare code (no spaces), never text meant for a person. */
const CODE_LIKE = /^[a-z][a-z0-9_-]*$/;

/**
 * The text to show for a refused or failed outcome. Host text in `detail`
 * (an adapter reason, a turn-input refusal) wins; a bare code in `detail` or
 * `reasonCode` is mapped; anything else falls back to `fallback`.
 */
export function messageOutcomeText(outcome: Pick<AgentMessageOutcome, 'detail' | 'reasonCode'>, fallback: string): string {
  const detail = outcome.detail?.trim();
  if (detail && !CODE_LIKE.test(detail)) return detail;
  const code = (detail ?? outcome.reasonCode) as OutcomeReason | undefined;
  return (code && OUTCOME_TEXT[code]) ?? (outcome.reasonCode && OUTCOME_TEXT[outcome.reasonCode]) ?? fallback;
}
