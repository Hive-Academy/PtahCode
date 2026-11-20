import type { SessionUpdate } from '@agentclientprotocol/sdk';
import type { ProviderSessionEventBody } from '@ptah-extension/provider-session-contracts';

const MAX_TOOL_OUTPUT_CHARS = 64 * 1024;
const TRUNCATION_MARKER = '\n… [output truncated]';

/** Item ids for chunks that carry no message id of their own. */
const AGENT_MESSAGE_ITEM = 'agent-message';
const AGENT_THOUGHT_ITEM = 'agent-thought';
/** Prefix of a user turn's item id; a counter makes each turn distinct. */
const USER_MESSAGE_ITEM = 'user-message';

interface ToolCallDetails {
  readonly kind?: string;
  readonly title?: string;
}

export interface AcpSessionUpdateMapper {
  /** Never throws; an update with nothing to show maps to `[]`. */
  map(update: SessionUpdate): ProviderSessionEventBody[];
}

export interface AcpSessionUpdateMapperOptions {
  readonly extractExitCode?: (rawOutput: unknown) => number | undefined;
}

/** A notice a stop reason adds to the turn (rendered as an info or error row). */
export interface AcpStopNotice {
  readonly type: 'info' | 'error';
  readonly content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function capOutput(content: string): string {
  if (content.length <= MAX_TOOL_OUTPUT_CHARS) return content;
  return (
    content.slice(0, MAX_TOOL_OUTPUT_CHARS - TRUNCATION_MARKER.length) +
    TRUNCATION_MARKER
  );
}

function textFromContent(content: unknown): string | undefined {
  if (!isRecord(content)) return undefined;
  const block = content['type'] === 'content' ? content['content'] : content;
  if (
    !isRecord(block) ||
    block['type'] !== 'text' ||
    typeof block['text'] !== 'string'
  ) {
    return undefined;
  }
  return block['text'];
}

/** The chunk's own message id when the agent sent one. */
function itemIdOf(update: Record<string, unknown>, fallback: string): string {
  const id = update['messageId'];
  return typeof id === 'string' && id ? id : fallback;
}

function fileChanges(content: unknown): ProviderSessionEventBody[] {
  if (!Array.isArray(content)) return [];

  return content.flatMap((item): ProviderSessionEventBody[] => {
    if (
      !isRecord(item) ||
      item['type'] !== 'diff' ||
      typeof item['path'] !== 'string'
    ) {
      return [];
    }
    return [
      {
        type: 'fileChange',
        path: item['path'],
        changeKind:
          item['oldText'] === undefined || item['oldText'] === null
            ? 'added'
            : 'modified',
      },
    ];
  });
}

function outputFromToolUpdate(update: Record<string, unknown>): string {
  const content = Array.isArray(update['content'])
    ? update['content']
        .map(textFromContent)
        .filter((text): text is string => text !== undefined)
        .join('')
    : '';
  return capOutput(content || safeStringify(update['rawOutput']));
}

/** Updates that belong to the agent's side of a turn. */
const AGENT_TURN_UPDATES: ReadonlySet<string> = new Set([
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
]);

function errorNotice(content: string): AcpStopNotice {
  return { type: 'error', content };
}

/**
 * Maps ACP session updates to provider-session events.
 *
 * ACP agents are external processes, so this deliberately treats runtime
 * notifications as untrusted even though the public signature is typed.
 */
export function createAcpSessionUpdateMapper(
  options: AcpSessionUpdateMapperOptions = {},
): AcpSessionUpdateMapper {
  const tools = new Map<string, ToolCallDetails>();
  /**
   * User turns seen so far. A replayed history sends its user chunks without
   * a message id, so a new user turn is detected by a role change (any other
   * update since the last user chunk) and numbered (M-1).
   */
  let userTurns = 0;
  let lastWasUser = false;

  const map = (update: SessionUpdate): ProviderSessionEventBody[] => {
    if (!isRecord(update) || typeof update.sessionUpdate !== 'string') {
      return [];
    }
    // Only an agent-side update ends a user turn; one that maps to no event
    // (usage, commands, ...) must not split a user message in two (M-3).
    if (update.sessionUpdate === 'user_message_chunk') {
      if (!lastWasUser) userTurns++;
      lastWasUser = true;
    } else if (AGENT_TURN_UPDATES.has(update.sessionUpdate)) {
      lastWasUser = false;
    }

    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const content: unknown = update.content;
        if (!isRecord(content)) return [];
        if (content['type'] === 'text' && typeof content['text'] === 'string') {
          return [
            {
              type: 'textDelta',
              itemId: itemIdOf(update, AGENT_MESSAGE_ITEM),
              delta: content['text'],
            },
          ];
        }
        return [
          {
            type: 'info',
            message: `[${String(content['type'] ?? 'unknown')} content]`,
          },
        ];
      }

      case 'agent_thought_chunk': {
        const content: unknown = update.content;
        return isRecord(content) && typeof content['text'] === 'string'
          ? [
              {
                type: 'reasoning',
                itemId: itemIdOf(update, AGENT_THOUGHT_ITEM),
                text: content['text'],
                phase: 'delta',
              },
            ]
          : [];
      }

      case 'user_message_chunk': {
        // Only history replay (`session/load`) sends user turns back; a lane
        // has no row for them, the stream projector rebuilds the scrollback.
        const content: unknown = update.content;
        return isRecord(content) &&
          content['type'] === 'text' &&
          typeof content['text'] === 'string'
          ? [
              {
                type: 'userText',
                itemId: itemIdOf(update, `${USER_MESSAGE_ITEM}-${userTurns}`),
                text: content['text'],
              },
            ]
          : [];
      }

      case 'tool_call': {
        if (
          typeof update.toolCallId !== 'string' ||
          typeof update.title !== 'string'
        ) {
          return fileChanges(update.content);
        }
        const kind = typeof update.kind === 'string' ? update.kind : undefined;
        tools.set(update.toolCallId, { kind, title: update.title });
        const toolInput = isPlainObject(update.rawInput)
          ? update.rawInput
          : undefined;
        return [
          {
            type: 'toolStarted',
            toolId: update.toolCallId,
            toolName: kind === 'edit' || kind === 'delete' ? kind : update.title,
            kind,
            input: toolInput,
          },
          ...fileChanges(update.content),
        ];
      }

      case 'tool_call_update': {
        const changes = fileChanges(update.content);
        if (typeof update.toolCallId !== 'string') return changes;
        const remembered = tools.get(update.toolCallId);
        const kind =
          typeof update.kind === 'string' ? update.kind : remembered?.kind;
        const title =
          typeof update.title === 'string' ? update.title : remembered?.title;
        if (update.status === 'completed' || update.status === 'failed') {
          const isCommand = update.status === 'completed' && kind === 'execute';
          return [
            {
              type: 'toolCompleted',
              toolId: update.toolCallId,
              status: update.status,
              toolName: title,
              kind,
              output: outputFromToolUpdate(update),
              exitCode: isCommand
                ? options.extractExitCode?.(update.rawOutput)
                : undefined,
            },
            ...changes,
          ];
        }
        return changes;
      }

      case 'plan':
        return Array.isArray(update.entries)
          ? [
              {
                type: 'plan',
                entries: update.entries.filter(isRecord).map((entry) => ({
                  status:
                    typeof entry.status === 'string' ? entry.status : 'pending',
                  content:
                    typeof entry.content === 'string' ? entry.content : '',
                })),
              },
            ]
          : [];

      default:
        return [];
    }
  };

  return {
    map(update) {
      try {
        return map(update);
      } catch {
        // degradation-audit: optional-capability - an untrusted agent update
        // that breaks the mapper shows nothing; the turn itself goes on.
        return [];
      }
    },
  };
}

/** Map a completed ACP prompt's reason to Ptah's lane exit convention. */
export function mapStopReason(input: {
  stopReason: string;
  aborted: boolean;
  refusedPermissionTitle?: string;
  displayName: string;
}): { exitCode: 0 | 1; segment?: AcpStopNotice } {
  try {
    const displayName =
      typeof input?.displayName === 'string' && input.displayName
        ? input.displayName
        : 'Agent';
    const stopReason =
      typeof input?.stopReason === 'string' ? input.stopReason : 'unknown';

    switch (stopReason) {
      case 'end_turn':
        return { exitCode: 0 };
      case 'max_tokens':
        return {
          exitCode: 0,
          segment: { type: 'info', content: 'Token limit reached.' },
        };
      case 'max_turn_requests':
        return {
          exitCode: 0,
          segment: { type: 'info', content: 'Turn request limit reached.' },
        };
      case 'refusal':
        return {
          exitCode: 1,
          segment: errorNotice(`${displayName} refused the turn.`),
        };
      case 'cancelled':
        if (input?.aborted) return { exitCode: 1 };
        if (
          typeof input?.refusedPermissionTitle === 'string' &&
          input.refusedPermissionTitle
        ) {
          return {
            exitCode: 1,
            segment: errorNotice(
              `${displayName} stopped the turn: permission refused for ${input.refusedPermissionTitle}`,
            ),
          };
        }
        return {
          exitCode: 1,
          segment: errorNotice('turn cancelled by the agent'),
        };
      default:
        return {
          exitCode: 1,
          segment: errorNotice(
            `${displayName} stopped for unknown reason: ${stopReason}`,
          ),
        };
    }
  } catch {
    return {
      exitCode: 1,
      segment: errorNotice('Agent stopped for unknown reason.'),
    };
  }
}
