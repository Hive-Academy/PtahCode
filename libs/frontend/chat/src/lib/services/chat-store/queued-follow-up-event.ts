import type {
  ChatQueuedMessageStateEvent,
  QueuedFollowUpSnapshot,
} from '@ptah-extension/shared';
import { rpcUserErrorCodeSchema } from '@ptah-extension/shared';
import { z } from 'zod';

const MAX_REASON_LENGTH = 300;
const queuedStateSchema = z.object({
  sessionId: z.string().min(1),
  tabId: z.string().min(1),
  clientMessageId: z.string().min(1),
  state: z.enum(['queued', 'delivered', 'withdrawn', 'failed', 'steered']),
  reason: z.string().optional(),
  errorCode: rpcUserErrorCodeSchema.optional(),
});

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validate a `chat:queued-message-state` push (external input) before it
 * reaches view state. Returns `null` for anything malformed.
 */
export function parseQueuedMessageStateEvent(
  payload: unknown,
): ChatQueuedMessageStateEvent | null {
  const parsed = queuedStateSchema.safeParse(payload);
  if (!parsed.success) return null;
  const raw = parsed.data;
  const reason = raw.reason;
  return {
    sessionId: raw.sessionId as ChatQueuedMessageStateEvent['sessionId'],
    tabId: raw.tabId,
    clientMessageId: raw.clientMessageId,
    state: raw.state,
    ...(raw.errorCode ? { errorCode: raw.errorCode } : {}),
    ...(typeof reason === 'string' && reason.trim()
      ? { reason: reason.trim().slice(0, MAX_REASON_LENGTH) }
      : {}),
  };
}

/** Keep only well-formed held items of a `chat:queued-list` / `chat:abort` reply. */
export function validSnapshots(
  items: unknown,
): readonly QueuedFollowUpSnapshot[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is QueuedFollowUpSnapshot =>
      !!item &&
      typeof item === 'object' &&
      isNonEmptyString((item as QueuedFollowUpSnapshot).clientMessageId) &&
      typeof (item as QueuedFollowUpSnapshot).content === 'string',
  );
}
