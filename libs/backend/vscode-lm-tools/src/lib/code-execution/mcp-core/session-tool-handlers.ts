/**
 * Case bodies for the `ptah_session_*` tools (TASK_2026_584, plan
 * Component 7; pattern `surface-tool-handlers.ts`).
 *
 * The dispatcher turns the reply into a JSON-RPC response; this file
 * validates the arguments, calls the session namespace and maps its outcome
 * to agent-facing text. It never reads a caller from the arguments: the
 * namespace takes the caller from the MCP request context, and the strict
 * schemas reject any caller or parent key an agent adds.
 *
 * Failure mapping (plan "Failure behaviour"): a zod failure and a
 * `session-start-failed` / `worktree-failed` start are `isError` (the latter
 * with the rollback table); every other refusal is a plain-text answer with
 * its code and detail, because it is an answer the agent acts on, not a
 * fault. Every reply, error or not, ends with the caller's held completions.
 *
 * `ptah_session_handoff` (TASK_2026_655) follows the same mapping: only
 * `session-start-failed` is `isError`. Its prompt is never logged or echoed:
 * no reply or log line here interpolates an argument value.
 */
import type { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  EFFORT_LEVELS,
  SESSION_CHILD_OUTCOME_KINDS,
  SESSION_CHILD_OUTCOME_LABELS,
  SESSION_CHILD_OUTCOME_UNKNOWN_REASON,
  type SessionChildOutcome,
  type SessionChildOutcomeKind,
} from '@ptah-extension/shared';
import {
  childSettingSources,
  safeErrorKind,
  type SessionChildClearSkipReason,
  type SessionChildCompletionEnvelope,
  type SessionChildLookupRefusal,
  type SessionChildRollbackStep,
  type SessionChildSendResult,
  type SessionChildSnapshot,
  type SessionChildStartResult,
  type SessionHandoffResult,
} from '@ptah-extension/cli-agent-runtime';
import {
  SESSION_HANDOFF_UNAVAILABLE_MESSAGE,
  type SessionClearFinishedOutcome,
  type SessionNamespace,
  type SessionReadOutcome,
  type SessionStatusOutcome,
  type SessionStopOutcome,
} from '../namespace-builders/session-namespace.builder';
import {
  SessionClearFinishedArgsSchema,
  SessionHandoffArgsSchema,
  SessionReadArgsSchema,
  SessionSendArgsSchema,
  SessionStartArgsSchema,
  SessionStatusArgsSchema,
  SessionStopArgsSchema,
} from './session-tool-args.schema';
import {
  SESSION_CLEAR_FINISHED_TOOL_NAME,
  SESSION_HANDOFF_TOOL_NAME,
  SESSION_READ_TOOL_NAME,
  SESSION_SEND_TOOL_NAME,
  SESSION_START_TOOL_NAME,
  SESSION_STATUS_TOOL_NAME,
  SESSION_STOP_TOOL_NAME,
  type SessionToolName,
} from './session-tools';

/** What the dispatcher needs to build a success or an `isError` result. */
export interface SessionToolReply {
  readonly isError: boolean;
  readonly text: string;
}

export const HELD_COMPLETIONS_HEADING = 'Held while this session was not live:';

/** The start refusals that are faults (with a rollback), not answers. */
const START_FAULTS: ReadonlySet<string> = new Set([
  'session-start-failed',
  'worktree-failed',
]);

/** The required keys per tool, named in a validation error. */
const REQUIRED_KEYS: Readonly<Record<SessionToolName, string>> = {
  [SESSION_START_TOOL_NAME]: 'Required: "task" and "branch".',
  [SESSION_SEND_TOOL_NAME]: 'Required: "sessionId" and "message".',
  [SESSION_STATUS_TOOL_NAME]: 'No argument is required.',
  [SESSION_READ_TOOL_NAME]: 'Required: "sessionId".',
  [SESSION_STOP_TOOL_NAME]: 'Required: "sessionId".',
  [SESSION_CLEAR_FINISHED_TOOL_NAME]: 'No argument is required.',
  [SESSION_HANDOFF_TOOL_NAME]:
    'Required: "handoffPath" (absolute) and a non-empty "prompt".',
};

/** Render a zod failure as one line naming each offending field. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

function argsObject(args: unknown): unknown {
  return args !== null && typeof args === 'object' ? args : {};
}

/** The held-completion block, or '' when nothing was held. */
export function renderHeldCompletions(
  envelopes: readonly SessionChildCompletionEnvelope[],
): string {
  if (envelopes.length === 0) return '';
  return `${HELD_COMPLETIONS_HEADING}\n\n${envelopes
    .map((envelope) => envelope.text)
    .join('\n\n')}`;
}

function joinBlocks(...blocks: readonly string[]): string {
  return blocks.filter((block) => block.length > 0).join('\n\n');
}

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

/** ` (detail)`, or '' when there is no detail. */
function parenthesised(detail: string | undefined): string {
  return detail ? ` (${detail})` : '';
}

/** The end time and reason of a terminal child that carries no outcome. */
function endedSuffix(child: SessionChildSnapshot): string {
  if (!child.endedAt || child.outcome) return '';
  return `; ended ${child.endedAt}${parenthesised(child.endReason)}`;
}

/**
 * The status as an agent should read it. A child that is `idle` before its
 * first settled turn has not run yet (TASK_2026_932 E): it is never shown as
 * idle or done until the first-turn watchdog decides.
 */
export function displayStatus(child: SessionChildSnapshot): string {
  if (child.status === 'idle' && child.turnsSettled === 0) {
    return 'starting (first turn not started)';
  }
  return child.status;
}

function deliveryText(
  last: NonNullable<SessionChildSnapshot['lastCompletion']>,
): string {
  if (last.delivered) return 'delivered';
  return `not delivered${parenthesised(last.refusal)}`;
}

function readStatusSuffix(available: boolean, truncated: boolean): string {
  if (!available) return '; not available.';
  return truncated ? '; the tail is shown, earlier turns are cut.' : '.';
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'failed',
  'stopped',
  'timed-out',
  'handed-off',
  'ended',
]);

function isFinishedChild(child: SessionChildSnapshot): boolean {
  return child.outcome !== undefined || TERMINAL_STATUSES.has(child.status);
}

/**
 * The outcome of a finished child. The registry sets `outcome` on every
 * terminal snapshot. A snapshot without one maps its terminal status the
 * way the registry mapper does, and an `ended` status (no end cause known)
 * is `unknown`: never a guessed kind.
 */
function outcomeOf(child: SessionChildSnapshot): SessionChildOutcome {
  if (child.outcome) return child.outcome;
  const endedAt = child.endedAt ?? '';
  const kind = statusOutcomeKind(child);
  if (kind === 'unknown') {
    return { kind, reason: SESSION_CHILD_OUTCOME_UNKNOWN_REASON, endedAt };
  }
  return {
    kind,
    reason: child.endReason ?? 'no reason recorded',
    endedAt,
    ...(child.succeededBy ? { successorId: child.succeededBy } : {}),
  };
}

function statusOutcomeKind(
  child: SessionChildSnapshot,
): SessionChildOutcomeKind {
  switch (child.status) {
    case 'handed-off':
    case 'stopped':
    case 'timed-out':
    case 'failed':
      return child.status;
    default:
      return 'unknown';
  }
}

/**
 * One outcome as text: `Stopped (stopped) — <reason> [cause parent-stop];
 * ended <time>; successor <id>`. The cause and the successor appear only
 * when they were recorded. `unknown` always reads with the fixed reason.
 */
export function formatOutcome(outcome: SessionChildOutcome): string {
  const label = SESSION_CHILD_OUTCOME_LABELS[outcome.kind];
  const reason =
    outcome.kind === 'unknown'
      ? SESSION_CHILD_OUTCOME_UNKNOWN_REASON
      : outcome.reason;
  const cause =
    outcome.kind !== 'unknown' && outcome.cause
      ? ` [cause ${outcome.cause}]`
      : '';
  const ended = outcome.endedAt ? `; ended ${outcome.endedAt}` : '';
  const successor = outcome.successorId
    ? `; successor ${outcome.successorId}`
    : '';
  return `${label} (${outcome.kind}) — ${reason}${cause}${ended}${successor}`;
}

/** Finished count per outcome kind; every kind is counted, `unknown` too. */
function finishedCounts(finished: readonly SessionChildSnapshot[]): string {
  return SESSION_CHILD_OUTCOME_KINDS.map((kind) => ({
    kind,
    count: finished.filter((child) => outcomeOf(child).kind === kind).length,
  }))
    .filter((entry) => entry.count > 0)
    .map(
      (entry) => `${SESSION_CHILD_OUTCOME_LABELS[entry.kind]} ${entry.count}`,
    )
    .join(', ');
}

function formatFinishedShort(child: SessionChildSnapshot): string {
  return `- ${child.label} (${child.childSessionId}): ${formatOutcome(outcomeOf(child))}`;
}

/**
 * A start still in progress (status `starting`): its id, branch and start
 * time, so a parent whose start call timed out finds its own start here.
 */
function formatStarting(child: SessionChildSnapshot): string {
  const lines = [
    `- ${child.label} (${child.childSessionId}): starting`,
    `  branch ${child.branch}; started ${child.startedAt}`,
  ];
  if (child.worktreePath) lines.push(`  worktree ${child.worktreePath}`);
  if (child.taskId) lines.push(`  task ${child.taskId}`);
  return lines.join('\n');
}

function formatChild(child: SessionChildSnapshot): string {
  if (child.status === 'starting') return formatStarting(child);
  const sources = childSettingSources(child);
  const successor = child.outcome?.successorId ?? child.succeededBy;
  const lines = [
    `- ${child.label} (${child.childSessionId}): ${displayStatus(child)}` +
      (successor ? `; succeededBy ${successor}` : ''),
    `  branch ${child.branch} from ${child.baseRef}; worktree ${child.worktreePath}`,
    `  model ${child.model ?? 'default'} (${sources.modelSource}); effort ${child.effort ?? 'default'} (${sources.effortSource})`,
    `  started ${child.startedAt}${endedSuffix(child)}`,
    `  turns settled ${child.turnsSettled}; reports delivered ` +
      `${child.reportsDelivered}, refused ${child.reportsRefused}`,
  ];
  if (isFinishedChild(child)) {
    lines.push(`  outcome: ${formatOutcome(outcomeOf(child))}`);
  }
  if (child.undeliveredHeldMessages?.length) {
    lines.push(
      `  not delivered: ${child.undeliveredHeldMessages.length} held message(s) lost in the handoff: ` +
        child.undeliveredHeldMessages
          .map((m) => `#${m.index} "${m.preview}"`)
          .join('; ') +
        '. Send them again.',
    );
  }
  if (child.taskId) lines.push(`  task ${child.taskId}`);
  if (child.taskFolder) lines.push(`  task folder ${child.taskFolder}`);
  if (child.deliverables.length > 0) {
    lines.push(`  deliverables: ${child.deliverables.join(', ')}`);
  }
  if (child.pendingPermission) {
    const pending = child.pendingPermission;
    lines.push(
      `  awaiting permission: ${pending.toolName} (${pending.description}); ` +
        `denied at ${pending.deniesAt} unless the user answers in its tab`,
    );
  }
  if (child.lastCompletion) {
    const last = child.lastCompletion;
    lines.push(
      `  last completion: turn ${last.turn}, ${last.verdict}, ` +
        deliveryText(last),
    );
  }
  if (child.heldCompletion) {
    const held = child.heldCompletion;
    lines.push(
      `  held completion: turn ${held.turn}, ${held.verdict}, since ${held.heldSince}`,
    );
  }
  if (child.lastRefusedReport) {
    lines.push(`  last refused report: ${child.lastRefusedReport}`);
  }
  if (child.lastRecap) lines.push(`  last recap: ${child.lastRecap}`);
  lines.push(`  Ptah tools for its subagents: ${child.subagentPtahTools}`);
  return lines.join('\n');
}

function formatRollback(steps: readonly SessionChildRollbackStep[]): string {
  if (steps.length === 0) return 'Rollback: nothing had been created.';
  return [
    'Rollback:',
    '| Step | Result | Detail |',
    '| --- | --- | --- |',
    ...steps.map(
      (step) =>
        `| ${step.step} | ${step.ok ? 'done' : 'FAILED'} | ${step.detail ?? ''} |`,
    ),
  ].join('\n');
}

function lookupRefusal(
  tool: string,
  refusal: Pick<SessionChildLookupRefusal, 'detail'> & {
    readonly reason: string;
  },
): string {
  return `${tool} refused (${refusal.reason}): ${refusal.detail}`;
}

export function sessionStartReply(
  result: SessionChildStartResult,
): SessionToolReply {
  if (result.ok) {
    const child = result.child;
    if (result.alreadyExists) {
      return {
        isError: false,
        text: joinBlocks(
          `Not started again: child session "${child.label}" (sessionId ${child.childSessionId}) ` +
            `already runs on branch ${child.branch} for this caller. No second worktree was created.`,
          formatChild(child),
          'Steer it with ptah_session_send or read it with ptah_session_status.',
        ),
      };
    }
    return {
      isError: false,
      text: joinBlocks(
        `Started child session "${child.label}" (sessionId ${child.childSessionId}). ` +
          "It opened as a tab in the user's window and runs unattended.",
        formatChild(child),
        'Steer it with ptah_session_send. It reports with ptah_agent_report, ' +
          'and a completion turn arrives in this session each time it settles. ' +
          "The worktree and the branch are the user's to merge and clean up.",
      ),
    };
  }
  const head = `${SESSION_START_TOOL_NAME} refused (${result.refusal}): ${result.detail}`;
  if (START_FAULTS.has(result.refusal)) {
    return {
      isError: true,
      text: joinBlocks(head, formatRollback(result.rollback ?? [])),
    };
  }
  return { isError: false, text: head };
}

const SEND_EFFECTS: Readonly<
  Record<Extract<SessionChildSendResult, { delivered: true }>['effect'], string>
> = {
  'started-turn': 'the child was idle; the message started a turn',
  'held-until-turn-end':
    'the child is mid-turn; the message is held and starts its next turn',
  'interrupted-and-started':
    'the turn in flight was interrupted and the message started a new turn',
};

export function sessionSendReply(
  childSessionId: string,
  result: SessionChildSendResult,
): SessionToolReply {
  if (result.delivered) {
    return {
      isError: false,
      text: `Message delivered to ${childSessionId}: ${SEND_EFFECTS[result.effect]}.`,
    };
  }
  return {
    isError: false,
    text:
      `Message NOT delivered to ${childSessionId} (${result.reason}): ` +
      result.detail,
  };
}

export function sessionStatusReply(
  outcome: SessionStatusOutcome,
  options?: {
    readonly sessionId?: string;
    readonly includeFinished?: boolean;
  },
): SessionToolReply {
  if (!outcome.ok) {
    return {
      isError: false,
      text: lookupRefusal(SESSION_STATUS_TOOL_NAME, outcome),
    };
  }
  if (outcome.children.length === 0) {
    return { isError: false, text: 'This session has no child sessions.' };
  }
  const fullRecords =
    options?.sessionId !== undefined || options?.includeFinished === true;
  if (fullRecords) {
    return {
      isError: false,
      text: joinBlocks(
        `Child sessions (${outcome.children.length}):`,
        outcome.children.map(formatChild).join('\n'),
      ),
    };
  }
  const live = outcome.children.filter((child) => !isFinishedChild(child));
  const finished = outcome.children.filter((child) => isFinishedChild(child));
  if (finished.length === 0) {
    return {
      isError: false,
      text: joinBlocks(
        `Child sessions (${outcome.children.length}):`,
        live.map(formatChild).join('\n'),
      ),
    };
  }
  const finishedBlock = [
    `Finished: ${finished.length} (${finishedCounts(finished)})`,
    ...finished.map(formatFinishedShort),
    'Use includeFinished: true for full records, ptah_session_clear_finished to remove them.',
  ].join('\n');
  return {
    isError: false,
    text: joinBlocks(
      `Child sessions (${outcome.children.length}):`,
      live.map(formatChild).join('\n'),
      finishedBlock,
    ),
  };
}

/**
 * The read reply in its two parts. The transcript goes LAST, after the held
 * completions: an over-budget answer is cut to a prefix (the tool is
 * `preformatted`), and a cut must never take a held completion with it.
 */
export function sessionReadReply(outcome: SessionReadOutcome): {
  readonly head: string;
  readonly transcript: string;
} {
  if (!outcome.ok) {
    return {
      head: lookupRefusal(SESSION_READ_TOOL_NAME, outcome),
      transcript: '',
    };
  }
  const { child, transcript, truncated, available } = outcome.result;
  return {
    head:
      `Transcript of "${child.label}" (${child.childSessionId}), ${displayStatus(child)}` +
      readStatusSuffix(available, truncated),
    transcript,
  };
}

export function sessionStopReply(
  outcome: SessionStopOutcome,
): SessionToolReply {
  if (!outcome.ok) {
    if (outcome.reason === 'handed-off') {
      const suffix = outcome.detail.includes(outcome.successorId)
        ? ''
        : ` (successor ${outcome.successorId}, ${outcome.successorStatus})`;
      // An answer the agent acts on (follow or not), not a fault: plain
      // text, like every other refusal (see the file header).
      return {
        isError: false,
        text:
          `${SESSION_STOP_TOOL_NAME} refused (handed-off): nothing was stopped. ` +
          `${outcome.detail}${suffix}`,
      };
    }
    return {
      isError: false,
      text: lookupRefusal(SESSION_STOP_TOOL_NAME, outcome),
    };
  }
  const child = outcome.child;
  const followedSuffix = outcome.followed
    ? ` (followed the handoff from ${outcome.requestedSessionId})`
    : '';
  const kept =
    `Its tab, its transcript, the worktree ${child.worktreePath} and the ` +
    `branch ${child.branch} remain; nothing was merged, pushed or removed.`;
  const outcomeLine = isFinishedChild(child)
    ? `Outcome: ${formatOutcome(outcomeOf(child))}.`
    : '';
  if (outcome.alreadyEnded) {
    return {
      isError: false,
      text: joinBlocks(
        `Session "${child.label}" (${child.childSessionId}) had already ended ` +
          `(${outcomeOf(child).kind}): nothing was stopped${followedSuffix}.`,
        outcomeLine,
        kept,
      ),
    };
  }
  return {
    isError: false,
    text: joinBlocks(
      `Stopped "${child.label}" (${child.childSessionId}): ${child.status}${followedSuffix}.`,
      outcomeLine,
      kept,
    ),
  };
}

/** Plain words for each clear_finished skip reason. */
const CLEAR_SKIP_WORDS: Readonly<Record<SessionChildClearSkipReason, string>> =
  {
    live: 'still live; live sessions are never cleared',
    'held-completion':
      'its completion was not delivered yet; it is in this reply, call again to clear it',
    'unknown-child': 'no such session',
    'not-a-child-of-caller': 'not a child of this session',
  };

export function sessionClearFinishedReply(
  outcome: SessionClearFinishedOutcome,
): SessionToolReply {
  if (!outcome.ok) {
    return {
      isError: true,
      text: `${SESSION_CLEAR_FINISHED_TOOL_NAME} refused (${outcome.reason}): ${outcome.detail}`,
    };
  }
  const clearedLine =
    outcome.cleared.length > 0
      ? `Cleared ${outcome.cleared.length} finished session(s): ${outcome.cleared.join(', ')}.`
      : 'Cleared 0 finished session(s).';
  const skippedLine =
    outcome.skipped.length > 0
      ? `Skipped ${outcome.skipped.length}: ${outcome.skipped
          .map(
            (item) =>
              `${item.childSessionId} (${item.reason}: ${CLEAR_SKIP_WORDS[item.reason]})`,
          )
          .join(', ')}.`
      : '';
  return {
    isError: false,
    text: joinBlocks(clearedLine, skippedLine),
  };
}

/**
 * The handoff reply. It states `tabOpened` verbatim, so the session-handoff
 * skill can branch on it, and every refusal keeps its code and detail (e.g.
 * the start-timeout detail saying the session may still open late). The ids
 * of the lanes and child sessions the new session adopted are listed so the
 * caller can record them in its handoff file.
 */
export function sessionHandoffReply(
  result: SessionHandoffResult,
): SessionToolReply {
  if (result.ok) {
    const where = `"${result.label}" (tab ${result.tabId}) in ${result.cwd}`;
    const adopted = adoptedLine(result);
    if (result.tabOpened) {
      return {
        isError: false,
        text: joinBlocks(
          `Opened a new session ${where}.`,
          adopted,
          'tabOpened: true. Tell the user the new session is open and this ' +
            'session was stopped and its history was kept. Do no further work here.',
        ),
      };
    }
    return {
      isError: false,
      text: joinBlocks(
        `Started a new session ${where}.`,
        adopted,
        'tabOpened: false. The new session started, no tab appeared, and it ' +
          'is in the session list. Tell the user this session was stopped ' +
          'and its history was kept. Do no further work here.',
      ),
    };
  }
  return {
    isError: result.refusal === 'session-start-failed',
    text: `${SESSION_HANDOFF_TOOL_NAME} refused (${result.refusal}): ${result.detail}`,
  };
}

/** `Adopted by the new session: lanes a, b; child sessions c.`, or '' when nothing was adopted. */
function adoptedLine(
  result: Extract<SessionHandoffResult, { ok: true }>,
): string {
  const parts: string[] = [];
  if (result.adoptedLanes.length > 0) {
    parts.push(`lanes ${result.adoptedLanes.join(', ')}`);
  }
  if (result.adoptedChildSessions.length > 0) {
    parts.push(`child sessions ${result.adoptedChildSessions.join(', ')}`);
  }
  return parts.length > 0
    ? `Adopted by the new session: ${parts.join('; ')}.`
    : '';
}

/* ---------------------------------------------------------------------------
 * Routing
 * ------------------------------------------------------------------------- */

/** The tool's own reply, before the held completions are added. */
type Body =
  | { readonly kind: 'reply'; readonly reply: SessionToolReply }
  | {
      readonly kind: 'read';
      readonly head: string;
      readonly transcript: string;
    };

function invalid(name: SessionToolName, error: z.ZodError): Body {
  return {
    kind: 'reply',
    reply: {
      isError: true,
      text:
        `Error: invalid ${name} arguments: ${describeIssues(error)}. ` +
        REQUIRED_KEYS[name],
    },
  };
}

async function runTool(
  name: SessionToolName,
  args: unknown,
  session: SessionNamespace,
): Promise<Body> {
  const input = argsObject(args);
  switch (name) {
    case SESSION_START_TOOL_NAME: {
      if (
        typeof input === 'object' &&
        input !== null &&
        'effort' in input &&
        !EFFORT_LEVELS.some((value) => value === input.effort)
      ) {
        return {
          kind: 'reply',
          reply: sessionStartReply({
            ok: false,
            refusal: 'invalid-effort',
            detail: `accepted effort values: ${EFFORT_LEVELS.join(', ')}`,
          }),
        };
      }
      const parsed = SessionStartArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      return {
        kind: 'reply',
        reply: sessionStartReply(await session.start(parsed.data)),
      };
    }
    case SESSION_SEND_TOOL_NAME: {
      const parsed = SessionSendArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      const { sessionId, message, mode } = parsed.data;
      return {
        kind: 'reply',
        reply: sessionSendReply(
          sessionId,
          await session.send({ childSessionId: sessionId, message, mode }),
        ),
      };
    }
    case SESSION_STATUS_TOOL_NAME: {
      const parsed = SessionStatusArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      const { sessionId, includeFinished } = parsed.data;
      return {
        kind: 'reply',
        reply: sessionStatusReply(await session.status(sessionId), {
          sessionId,
          includeFinished,
        }),
      };
    }
    case SESSION_READ_TOOL_NAME: {
      const parsed = SessionReadArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      return {
        kind: 'read',
        ...sessionReadReply(
          await session.read(parsed.data.sessionId, parsed.data.tailKiB),
        ),
      };
    }
    case SESSION_STOP_TOOL_NAME: {
      const parsed = SessionStopArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      const { sessionId, followHandoff } = parsed.data;
      return {
        kind: 'reply',
        reply: sessionStopReply(
          followHandoff !== undefined
            ? await session.stop(sessionId, { followHandoff })
            : await session.stop(sessionId),
        ),
      };
    }
    case SESSION_CLEAR_FINISHED_TOOL_NAME: {
      const parsed = SessionClearFinishedArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      return {
        kind: 'reply',
        reply: sessionClearFinishedReply(
          await session.clearFinished(parsed.data.sessionIds),
        ),
      };
    }
    case SESSION_HANDOFF_TOOL_NAME: {
      const parsed = SessionHandoffArgsSchema.safeParse(input);
      if (!parsed.success) return invalid(name, parsed.error);
      return {
        kind: 'reply',
        reply: sessionHandoffReply(await session.handoff(parsed.data)),
      };
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Why a tool call threw, as text safe to log and return. A handoff carries
 * the continuation prompt, and anything below the tool may quote it in an
 * error's message, name or code, so for the handoff only the namespace's own
 * fixed "unavailable" text passes through; any other failure is reduced to
 * its allowlisted kind. The other session tools keep the thrown message.
 */
function failureText(name: SessionToolName, error: unknown): string {
  if (name !== SESSION_HANDOFF_TOOL_NAME) return errorText(error);
  if (
    error instanceof Error &&
    error.message === SESSION_HANDOFF_UNAVAILABLE_MESSAGE
  ) {
    return SESSION_HANDOFF_UNAVAILABLE_MESSAGE;
  }
  return `unexpected error (${safeErrorKind(error)})`;
}

/**
 * The caller's held completions. Taking them must not cost the tool's own
 * answer (a started child is still started), so a failure here is logged
 * and the reply goes out without them; the spawner keeps them held only if
 * it never returned them. Only the error's allowlisted kind is logged: this
 * runs after every session tool, including a handoff.
 */
function takeHeld(
  session: SessionNamespace,
  logger: Logger,
): readonly SessionChildCompletionEnvelope[] {
  try {
    return session.takeHeldCompletions();
  } catch (error: unknown) {
    // degradation-audit: reported - logged at warn; the tool's own reply is
    // still returned, and nothing was marked delivered by a call that threw.
    logger.warn(
      `[MCP] could not collect held session completions: ${safeErrorKind(error)}`,
    );
    return [];
  }
}

/** Route one `ptah_session_*` call and append the caller's held completions. */
export async function handleSessionToolCall(
  name: SessionToolName,
  args: unknown,
  session: SessionNamespace,
  logger: Logger,
): Promise<SessionToolReply> {
  let body: Body;
  try {
    body = await runTool(name, args, session);
  } catch (error: unknown) {
    // degradation-audit: reported - the failure is returned to the agent as
    // an isError result naming the cause (e.g. no session spawner in this
    // host) and logged at warn; a handoff names only a safe cause.
    const cause = failureText(name, error);
    logger.warn(`[MCP] ${name} failed: ${cause}`);
    body = {
      kind: 'reply',
      reply: { isError: true, text: `${name} failed: ${cause}` },
    };
  }
  const held = renderHeldCompletions(takeHeld(session, logger));
  if (body.kind === 'read') {
    return {
      isError: false,
      text: joinBlocks(body.head, held, body.transcript),
    };
  }
  return {
    isError: body.reply.isError,
    text: joinBlocks(body.reply.text, held),
  };
}
