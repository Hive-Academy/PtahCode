/**
 * createFlatStreamProjector — provider-session events as the flat stream
 * events the renderer builds its execution tree from (lane `onStreamEvent`
 * and chat `publish`).
 *
 * One projector per session. It keeps only the current turn's message state
 * (which blocks are open), and resets it when the turn id changes.
 *
 * User turns (`userText`, replayed by `session/load`) project to the shape the
 * Codex history projector produces for a user turn
 * (`agent-sdk/.../codex-history-projector.ts`): `message_start` with role
 * `user`, one `text_delta`, then `message_complete`, all `source: 'history'`.
 * Each user turn gets its own message id (its turn id plus its item id), so a
 * replayed conversation with several user turns keeps them apart.
 *
 * A failure is visible in the tree: an `error` event becomes an `Error: ...`
 * text block of the turn's assistant message, and a `failed` terminal with no
 * message yet still opens one with the terminal's error text (or a generic
 * failure line) and completes it, so a turn that failed before any output (a
 * refused handshake, a rejected prompt) is not an empty row.
 */
import type {
  EventSource,
  FlatStreamEventUnion,
} from '@ptah-extension/shared';
import type { ProviderSessionEvent } from './provider-session-events';

export interface FlatStreamProjectorIds {
  /** Used when an event carries no session id; omitted when neither is known. */
  readonly sessionId?: string;
  /** Clock for event timestamps. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface FlatStreamProjector {
  /** Never throws; an event with no stream row maps to `[]`. */
  project(event: ProviderSessionEvent): FlatStreamEventUnion[];
}

interface TurnState {
  readonly turnKey: string;
  readonly messageId: string;
  started: boolean;
  completed: boolean;
  textBlock: number;
  textItemId: string | undefined;
  thinkingBlock: number;
  thinkingItemId: string | undefined;
  readonly toolStarts: Map<
    string,
    Extract<FlatStreamEventUnion, { eventType: 'tool_start' }>
  >;
}

export function createFlatStreamProjector(
  ids: FlatStreamProjectorIds = {},
): FlatStreamProjector {
  const now = ids.now ?? Date.now;
  let turn: TurnState | undefined;

  const turnFor = (event: ProviderSessionEvent): TurnState => {
    const turnKey = event.turnId ?? `${event.contextId}:setup`;
    if (turn?.turnKey !== turnKey) {
      turn = {
        turnKey,
        messageId: `${turnKey}:assistant`,
        started: false,
        completed: false,
        textBlock: -1,
        textItemId: undefined,
        thinkingBlock: -1,
        thinkingItemId: undefined,
        toolStarts: new Map(),
      };
    }
    return turn;
  };

  const project = (event: ProviderSessionEvent): FlatStreamEventUnion[] => {
    const sessionId = event.sessionId ?? ids.sessionId;
    const source: EventSource = event.replayed ? 'history' : 'stream';
    const timestamp = now();
    // The turn (or, outside a turn, the context and whether it is replay)
    // leads the id: a `session/load` replay and the live turns after it share
    // the context, the generation and a sequence that restarts per process,
    // so `contextId:generation:sequence` alone named a live chunk exactly
    // like a replayed one, and the renderer replaced the history row instead
    // of showing the reply (bug 5).
    const scope =
      event.turnId ?? `${event.contextId}${event.replayed ? ':replay' : ''}`;
    const base = (messageId: string, suffix: string) => ({
      id: `${scope}:${event.processGeneration}:${event.sequence}:${suffix}`,
      timestamp,
      messageId,
      source,
      ...(sessionId ? { sessionId } : {}),
    });

    const assistant = (): {
      state: TurnState;
      out: FlatStreamEventUnion[];
    } => {
      const state = turnFor(event);
      const out: FlatStreamEventUnion[] = [];
      if (!state.started || state.completed) {
        state.started = true;
        state.completed = false;
        out.push({
          ...base(state.messageId, 'start'),
          eventType: 'message_start',
          role: 'assistant',
        });
      }
      return { state, out };
    };

    switch (event.type) {
      case 'userText': {
        const messageId = `${event.turnId ?? event.contextId}:user:${event.itemId}`;
        return [
          {
            ...base(messageId, 'start'),
            eventType: 'message_start',
            role: 'user',
            ...(event.attachments?.length
              ? {
                  imageCount: event.attachments.filter(
                    (item) => item.kind === 'image',
                  ).length,
                }
              : {}),
          },
          {
            ...base(messageId, 'text'),
            eventType: 'text_delta',
            delta: event.text,
            blockIndex: 0,
          },
          { ...base(messageId, 'complete'), eventType: 'message_complete' },
        ];
      }
      case 'textDelta': {
        const { state, out } = assistant();
        if (state.textItemId !== event.itemId) {
          state.textItemId = event.itemId;
          state.textBlock += 1;
        }
        out.push({
          ...base(state.messageId, 'text'),
          eventType: 'text_delta',
          delta: event.delta,
          blockIndex: state.textBlock,
        });
        return out;
      }
      case 'reasoning': {
        const { state, out } = assistant();
        if (state.thinkingItemId !== event.itemId) {
          state.thinkingItemId = event.itemId;
          state.thinkingBlock += 1;
          out.push({
            ...base(state.messageId, 'thinking-start'),
            eventType: 'thinking_start',
            blockIndex: state.thinkingBlock,
          });
        }
        out.push({
          ...base(state.messageId, 'thinking'),
          eventType: 'thinking_delta',
          delta: event.text,
          blockIndex: state.thinkingBlock,
        });
        return out;
      }
      case 'toolStarted': {
        const { state, out } = assistant();
        const input = event.presentation ? event.presentation.input : event.input;
        const start: Extract<FlatStreamEventUnion, { eventType: 'tool_start' }> = {
          ...base(state.messageId, 'tool-start'),
          eventType: 'tool_start',
          toolCallId: event.toolId,
          isTaskTool: false,
          toolName: event.presentation?.toolName ?? event.toolName,
          ...(input === undefined ? {} : { toolInput: input }),
        };
        if (event.presentation) state.toolStarts.set(event.toolId, start);
        out.push(start);
        return out;
      }
      case 'toolUpdated': {
        const { toolStarts } = turnFor(event);
        const start = toolStarts.get(event.toolId);
        if (!start || !event.presentation) return [];
        // Preserve the card identity, ordering, and last available input.
        const updated = {
          ...start,
          toolName: event.presentation.toolName,
          toolInput: event.presentation.input ?? start.toolInput,
        };
        toolStarts.set(event.toolId, updated);
        return [updated];
      }
      case 'toolCompleted': {
        const { state, out } = assistant();
        state.toolStarts.delete(event.toolId);
        out.push({
          ...base(state.messageId, 'tool-result'),
          eventType: 'tool_result',
          toolCallId: event.toolId,
          output: event.output,
          isError: event.status !== 'completed' || (event.exitCode ?? 0) !== 0,
        });
        return out;
      }
      case 'usage': {
        const state = turnFor(event);
        if (!state.started || state.completed) return [];
        state.completed = true;
        const usage = event.usage;
        return [
          {
            ...base(state.messageId, 'complete'),
            eventType: 'message_complete',
            ...(usage
              ? {
                  tokenUsage: {
                    input: usage.inputTokens,
                    output: usage.outputTokens,
                  },
                  ...(usage.model ? { model: usage.model } : {}),
                  ...(usage.costUsd === undefined ? {} : { cost: usage.costUsd }),
                }
              : {}),
          },
        ];
      }
      case 'error': {
        const { state, out } = assistant();
        state.textItemId = `error:${event.sequence}`;
        state.textBlock += 1;
        out.push({
          ...base(state.messageId, 'error'),
          eventType: 'text_delta',
          delta: `Error: ${event.error.message}`,
          blockIndex: state.textBlock,
        });
        return out;
      }
      case 'terminal': {
        const state = turnFor(event);
        state.toolStarts.clear();
        if (state.completed) return [];
        if (!state.started && event.status !== 'failed') return [];
        // A failed turn with no output yet: the message it opens says why,
        // instead of being an empty row (PR #1445 review). A turn whose error
        // event already opened the message keeps that text only.
        const opensFailure = !state.started;
        const { out } = assistant();
        if (opensFailure) {
          state.textItemId = `error:${event.sequence}`;
          state.textBlock += 1;
          out.push({
            ...base(state.messageId, 'error'),
            eventType: 'text_delta',
            delta: `Error: ${event.error?.message || 'the turn failed'}`,
            blockIndex: state.textBlock,
          });
        }
        state.completed = true;
        out.push({
          ...base(state.messageId, 'complete'),
          eventType: 'message_complete',
          stopReason: event.status,
        });
        return out;
      }
      case 'fileChange':
      case 'plan':
      case 'approvalRequested':
      case 'approvalSettled':
      case 'modeChanged':
      case 'configChanged':
      case 'info':
      case 'diagnostic':
      case 'usageProgress':
        // Mid-turn usage never completes the message; the turn's `usage` does.
        return [];
      default: {
        const unknownEvent: never = event;
        void unknownEvent;
        return [];
      }
    }
  };

  return {
    project(event) {
      try {
        return project(event);
      } catch {
        // degradation-audit: optional-capability - a malformed event from an
        // untyped producer loses its stream row; the stream itself goes on.
        return [];
      }
    },
  };
}
