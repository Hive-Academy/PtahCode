/**
 * `ptah_session_*` tool definitions (TASK_2026_584, plan Component 7).
 *
 * Follows `surface-tools.ts`: every input schema is GENERATED from the zod
 * contract the handler validates with (`session-tool-args.schema.ts`), so a
 * key or a bound cannot change in one place and stay stale in the other.
 *
 * The definitions are static: no caller, workspace or host value is
 * interpolated, so `tools/list` stays byte-identical for every caller.
 */
import { z } from 'zod';
import {
  SESSION_READ_DEFAULT_TAIL_KIB,
  SESSION_READ_MAX_TAIL_KIB,
} from '@ptah-extension/cli-agent-runtime';
import type { MCPToolDefinition } from '../types';
import {
  SessionClearFinishedArgsSchema,
  SessionHandoffArgsSchema,
  SessionReadArgsSchema,
  SessionSendArgsSchema,
  SessionStartArgsSchema,
  SessionStatusArgsSchema,
  SessionStopArgsSchema,
} from './session-tool-args.schema';

export const SESSION_START_TOOL_NAME = 'ptah_session_start';
export const SESSION_SEND_TOOL_NAME = 'ptah_session_send';
export const SESSION_STATUS_TOOL_NAME = 'ptah_session_status';
export const SESSION_READ_TOOL_NAME = 'ptah_session_read';
export const SESSION_STOP_TOOL_NAME = 'ptah_session_stop';
export const SESSION_CLEAR_FINISHED_TOOL_NAME = 'ptah_session_clear_finished';
export const SESSION_HANDOFF_TOOL_NAME = 'ptah_session_handoff';

export const SESSION_TOOL_NAMES = [
  SESSION_START_TOOL_NAME,
  SESSION_SEND_TOOL_NAME,
  SESSION_STATUS_TOOL_NAME,
  SESSION_READ_TOOL_NAME,
  SESSION_STOP_TOOL_NAME,
  SESSION_CLEAR_FINISHED_TOOL_NAME,
  SESSION_HANDOFF_TOOL_NAME,
] as const;

export type SessionToolName = (typeof SESSION_TOOL_NAMES)[number];

type InputSchema = MCPToolDefinition['inputSchema'];

/** The zod contract as an MCP `inputSchema` fragment (no `$schema` keyword). */
function inputSchemaOf(schema: z.ZodType): InputSchema {
  const generated: Record<string, unknown> = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-7',
  });
  const { $schema: _ignoredSchemaKeyword, ...fragment } = generated;
  return { ...fragment, type: 'object' } as InputSchema;
}

const HELD_NOTE =
  'Every ptah_session_* result ends with any completion a child produced ' +
  'while this session was not live ("Held while this session was not live").';

/**
 * A start can outlive the caller's MCP client deadline (TASK_2026_932 E2):
 * the host keeps starting the child, so a retry would start a second one.
 */
export const SESSION_START_TIMEOUT_NOTE =
  'On a timeout, call ptah_session_status first: a starting child on your ' +
  'branch is your start; do not start again.';

/** Build the `ptah_session_start` tool definition. */
export function buildSessionStartTool(): MCPToolDefinition {
  return {
    name: SESSION_START_TOOL_NAME,
    description:
      'Start a child chat session on a new branch and worktree. It opens in ' +
      "the user's tab and runs unattended: file edits and allowlisted Bash " +
      'run without asking; other actions wait briefly in that tab, then are ' +
      'denied. ' +
      'Steer with ptah_session_send. The child reports with ptah_agent_report; ' +
      'completion is pushed here after each turn. A task starting with "/" ' +
      'runs as a slash command. Children cannot start sessions. Succession ' +
      'sets handed-off status with succeededBy. The user owns merge, PR and ' +
      'cleanup; branch and worktree remain. No permission, path or parent ' +
      'argument: ' +
      'you are the parent. Refusals include a code. Use a smaller model or ' +
      'lower effort for coordination, Git or CI; use a strong model for unknown ' +
      'causes, security or architecture. Omit both for defaults. ' +
      SESSION_START_TIMEOUT_NOTE +
      ' ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionStartArgsSchema),
  };
}

/** Build the `ptah_session_send` tool definition. */
export function buildSessionSendTool(): MCPToolDefinition {
  return {
    name: SESSION_SEND_TOOL_NAME,
    description:
      'Send a message to one of your child sessions: the primary way to steer ' +
      'it. mode "queue" (default) starts a turn now when it is idle, or holds ' +
      'the message until its current turn ends; "steer" interrupts the turn in ' +
      'flight and starts a new one with the message; "if-idle" delivers only ' +
      'when it is idle and is refused as busy otherwise. The result states the ' +
      'effect, or the refusal with its reason. ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionSendArgsSchema),
  };
}

/** Build the `ptah_session_status` tool definition. */
export function buildSessionStatusTool(): MCPToolDefinition {
  return {
    name: SESSION_STATUS_TOOL_NAME,
    description:
      'Status of your child sessions: working, waiting, awaiting-permission ' +
      '(with the denial time), idle, or finished with its outcome (kind, ' +
      'reason, time, successor / succeededBy); branch, worktree, turns ' +
      'settled, reports and the last completion. Without sessionId, lists ' +
      'live children in full and finished children as counts per outcome ' +
      'plus one short line each; includeFinished: true gives full records. ' +
      'Prefer waiting for the pushed completion turn over polling. ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionStatusArgsSchema),
    annotations: { readOnlyHint: true },
  };
}

/** Build the `ptah_session_read` tool definition. */
export function buildSessionReadTool(): MCPToolDefinition {
  return {
    name: SESSION_READ_TOOL_NAME,
    description:
      "The tail of a child session's transcript, tailKiB KiB of text " +
      `(default ${SESSION_READ_DEFAULT_TAIL_KIB}, max ${SESSION_READ_MAX_TAIL_KIB}). ` +
      'Before the child has a transcript it says so. ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionReadArgsSchema),
    annotations: { readOnlyHint: true },
  };
}

/** Build the `ptah_session_stop` tool definition. */
export function buildSessionStopTool(): MCPToolDefinition {
  return {
    name: SESSION_STOP_TOOL_NAME,
    description:
      'Stop one of your child sessions. On an id that already handed off it ' +
      'refuses and names the successor unless followHandoff: true; the reply ' +
      'names the session that was stopped. Its tab, its transcript, its ' +
      'worktree and its branch remain; nothing is merged, pushed or removed. ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionStopArgsSchema),
  };
}

/** Build the `ptah_session_clear_finished` tool definition. */
export function buildSessionClearFinishedTool(): MCPToolDefinition {
  return {
    name: SESSION_CLEAR_FINISHED_TOOL_NAME,
    description:
      'Removes finished (terminal) child sessions of the caller from the ' +
      'session list; never live ones; never deletes worktrees, branches, ' +
      'transcripts or tabs; returns the count and the ids cleared and ' +
      'skipped. ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionClearFinishedArgsSchema),
  };
}

/**
 * Build the `ptah_session_handoff` tool definition (TASK_2026_655). Listed
 * always-on by the dispatcher, outside the `agent` group: the budget
 * banner's handoff action relies on it.
 */
export function buildSessionHandoffTool(): MCPToolDefinition {
  return {
    name: SESSION_HANDOFF_TOOL_NAME,
    description:
      'Hand this session off to a new chat session. A child starts its successor ' +
      'in the same worktree and branch, passes on running lanes, and notifies ' +
      'its parent. The successor receives prompt as its first message. Write the ' +
      'handoff document first: handoffPath must be an existing absolute file ' +
      'path, and prompt must name it. Call once. The result states tabOpened ' +
      '(false: no window took the tab; it is ' +
      'in the session list). Refusals are returned as text with a code. ' +
      HELD_NOTE,
    inputSchema: inputSchemaOf(SessionHandoffArgsSchema),
  };
}
