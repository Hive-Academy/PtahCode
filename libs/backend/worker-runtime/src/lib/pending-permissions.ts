import type {
  ISdkPermissionHandler,
  PermissionRequest,
  PermissionResponse,
} from '@ptah-extension/shared';
import { SessionLogWriter } from './session-log-writer';

export class PermissionAnswerError extends Error {
  readonly code = 'ALREADY_ANSWERED';
  constructor() {
    super('The permission request was already answered or expired.');
  }
}

export function assertManualApproval(
  argv: readonly string[],
  autoApprove: string | undefined,
): void {
  if (argv.includes('--auto-approve') || autoApprove === 'true')
    throw new Error(
      'The worker requires manual approval for remote permission requests.',
    );
}

/** Persisted autopilot levels that approve some tool calls with no prompt. */
const AUTO_APPROVING_LEVELS: ReadonlySet<string> = new Set([
  'yolo',
  'auto-edit',
]);

/**
 * Refuses a persisted autopilot setting that skips manual approval. The
 * engine applies `autopilot.permissionLevel` whenever `autopilot.enabled` is
 * true: `yolo` approves every tool and `auto-edit` approves file edits.
 * `ask` and `plan` keep every executed tool behind a prompt.
 */
export function assertManualApprovalSettings(autopilot: {
  enabled: boolean;
  permissionLevel: string;
}): void {
  if (autopilot.enabled && AUTO_APPROVING_LEVELS.has(autopilot.permissionLevel))
    throw new Error(
      `The worker requires manual approval for remote permission requests, but autopilot is enabled at level "${autopilot.permissionLevel}". Turn autopilot off or set it to "ask" in Ptah settings, then start the worker again.`,
    );
}

/**
 * How long a remote session's permission request waits for the controller
 * before the worker denies it (decision 27; supersedes `timeoutAt: 0` for
 * sessions a worker serves). Local, non-worker sessions keep their own policy.
 */
export const REMOTE_PERMISSION_TIMEOUT_MS = 60_000;

/** Deny reason passed to the SDK when the controller did not answer in time. */
export const REMOTE_PERMISSION_TIMEOUT_REASON =
  'No answer from the controller within 60 s';

/** `by` of the `worker:permission.answered` record an expiry writes. */
export const REMOTE_PERMISSION_TIMEOUT_BY = 'Worker timeout';

/**
 * The deadline a worker enforces for `request`: 60 s after it was raised, or
 * the engine's own deadline when that is earlier. A request without a usable
 * timestamp counts from `now`.
 */
export function remotePermissionDeadline(
  request: Pick<PermissionRequest, 'timestamp' | 'timeoutAt'>,
  now: number = Date.now(),
): number {
  const createdAt =
    Number.isFinite(request.timestamp) && request.timestamp > 0
      ? request.timestamp
      : now;
  const deadline = createdAt + REMOTE_PERMISSION_TIMEOUT_MS;
  return Number.isFinite(request.timeoutAt) && request.timeoutAt > 0
    ? Math.min(request.timeoutAt, deadline)
    : deadline;
}

/**
 * The forwarded copy of a `permission:request` payload, carrying the worker's
 * deadline as `timeoutAt` so the controller can show a countdown. Anything
 * that is not a request record passes through unchanged.
 */
export function withRemotePermissionDeadline(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  if (typeof record['timestamp'] !== 'number') return payload;
  const timeoutAt =
    typeof record['timeoutAt'] === 'number' ? record['timeoutAt'] : 0;
  return {
    ...record,
    timeoutAt: remotePermissionDeadline({
      timestamp: record['timestamp'],
      timeoutAt,
    }),
  };
}

export interface PendingPermissionOptions {
  /** The session log that receives the expiry's `worker:permission.answered`. */
  findWriter?: (sessionId: string) => SessionLogWriter | undefined;
  /** Runs after a request expired, so the caller can drop its own routing. */
  onExpired?: (requestId: string, sessionId: string) => void;
}

interface Pending {
  /** Unset while the request is held for a start whose session is unknown. */
  sessionId?: string;
  /** Tab of the start a held request waits on. */
  tabId?: string;
  request: PermissionRequest;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Consumes the request before invoking the SDK, so concurrent replies cannot
 * both win. Each request is denied when its deadline passes unanswered.
 */
export class PendingPermissionIndex {
  private readonly pending = new Map<string, Pending>();
  constructor(
    private readonly handler: ISdkPermissionHandler,
    private readonly options: PendingPermissionOptions = {},
  ) {}

  add(request: PermissionRequest, sessionFromTab?: string): void {
    const sessionId = request.sessionId ?? sessionFromTab;
    if (!sessionId) return;
    this.take(request.id);
    this.pending.set(request.id, {
      sessionId,
      request,
      timer: this.startTimer(request),
    });
  }

  /**
   * Holds a request raised by a start whose session ID is not resolved yet.
   * Its deadline runs from now on; `bindTab` attaches it to the session
   * without restarting the clock.
   */
  hold(request: PermissionRequest, tabId: string): void {
    this.take(request.id);
    this.pending.set(request.id, {
      tabId,
      request,
      timer: this.startTimer(request),
    });
  }

  /** Number of requests held for `tabId`. */
  heldCount(tabId: string): number {
    let count = 0;
    for (const entry of this.pending.values())
      if (!entry.sessionId && entry.tabId === tabId) count++;
    return count;
  }

  /** Binds the requests held for `tabId` to its session; returns their IDs. */
  bindTab(tabId: string, sessionId: string): string[] {
    const bound: string[] = [];
    for (const [id, entry] of this.pending)
      if (!entry.sessionId && entry.tabId === tabId) {
        entry.sessionId = sessionId;
        bound.push(id);
      }
    return bound;
  }

  /**
   * Denies now the requests held for `tabId`: its start ended without a
   * session, so no controller can answer them.
   */
  denyHeld(tabId: string): void {
    for (const [id, entry] of [...this.pending])
      if (!entry.sessionId && entry.tabId === tabId) this.expire(id);
  }

  remove(requestId: string): void {
    this.take(requestId);
  }
  clearSession(sessionId: string): void {
    for (const [id, entry] of this.pending)
      if (entry.sessionId === sessionId) this.take(id);
  }
  /** Worker shutdown: stops every timer without answering. */
  dispose(): void {
    for (const id of [...this.pending.keys()]) this.take(id);
  }

  async answer(
    sessionId: string,
    response: PermissionResponse,
    by: string,
    writer: Pick<SessionLogWriter, 'enqueue'>,
  ): Promise<void> {
    if (response.decision !== 'allow' && response.decision !== 'deny')
      throw new PermissionAnswerError();
    const entry = this.pending.get(response.id);
    if (!entry || entry.sessionId !== sessionId)
      throw new PermissionAnswerError();
    this.take(response.id);
    if (!this.handler.handleResponse(response.id, response))
      throw new PermissionAnswerError();
    await writer.enqueue('worker:permission.answered', {
      requestId: response.id,
      decision: response.decision,
      by,
    });
  }

  private startTimer(
    request: PermissionRequest,
  ): ReturnType<typeof setTimeout> {
    const delay = Math.max(0, remotePermissionDeadline(request) - Date.now());
    const timer = setTimeout(() => this.expire(request.id), delay);
    // A pending prompt must not keep the worker process alive on its own.
    timer.unref?.();
    return timer;
  }

  /** Removes a request and stops its timer; returns what was pending. */
  private take(requestId: string): Pending | undefined {
    const entry = this.pending.get(requestId);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    return entry;
  }

  private expire(requestId: string): void {
    const entry = this.take(requestId);
    if (!entry) return;
    this.handler.handleResponse(requestId, {
      id: requestId,
      decision: 'deny',
      reason: REMOTE_PERMISSION_TIMEOUT_REASON,
    });
    // A held request has no session: no routing and no log to write to.
    if (!entry.sessionId) return;
    this.options.onExpired?.(requestId, entry.sessionId);
    const writer = this.options.findWriter?.(entry.sessionId);
    // degradation-audit: reported - an append failure degrades the writer,
    // which aborts the turn and sends subscribers ctl session-state.
    writer
      ?.enqueue('worker:permission.answered', {
        requestId,
        decision: 'deny',
        by: REMOTE_PERMISSION_TIMEOUT_BY,
      })
      .catch(() => undefined);
  }
}
