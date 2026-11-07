import {
  createEmptyStreamingState,
  type StreamingState,
} from '@ptah-extension/chat-types';
import {
  buildAgentNode,
  buildMessageNode,
  buildStreamingIndexes,
  buildToolChildren,
  buildToolNode,
  collectTools,
  findMessageStartEvent,
  type AgentStatsService,
  type BuilderDeps,
} from '@ptah-extension/chat-execution-tree';
import type {
  ExecutionNode,
  FlatStreamEventUnion,
  MessageStartEvent,
} from '@ptah-extension/shared';
import type { TranscriptEvents } from '../services/transcript-events';
import { remoteMarkdown } from './remote-markdown';

/** File paths whose tool content the shared renderers show as markdown. */
const MARKDOWN_PATH = /\.(md|mdx|markdown)$/i;

/** One top-level message of a remote transcript, as the view renders it. */
export interface RemoteTranscriptItem {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly node: ExecutionNode;
}

/**
 * Turn a remote session's flat events into the execution trees the local
 * transcript renders (plan A7 fallback): the events fill a
 * {@link StreamingState} the way the local accumulator keys it, and the
 * `@ptah-extension/chat-execution-tree` builders do the rest, so remote and
 * local trees have the same shape (3.3).
 *
 * The events are already normalised (one event per slot, `transcript-events`),
 * so each text, thinking and tool-input slot is its whole accumulated value.
 *
 * Every string the shared renderers show as markdown passes through
 * {@link remoteMarkdown} (S6): text and thinking blocks, and the output and
 * written content of a tool call on a markdown file. Other tool content is
 * shown in a code block, which is already text.
 */
export function buildRemoteTranscript(
  events: TranscriptEvents,
  agentStats: AgentStatsService,
): readonly RemoteTranscriptItem[] {
  const state = toStreamingState(events);
  const deps = builderDeps(agentStats, buildStreamingIndexes(state));
  const items: RemoteTranscriptItem[] = [];
  for (const messageId of state.messageEventIds) {
    const start = findMessageStartEvent(state, messageId);
    if (start === undefined || start.parentToolUseId) continue;
    const node = buildMessageNode(deps, messageId, state);
    if (node === null) continue;
    items.push({ id: messageId, role: start.role, node: inertTools(node) });
  }
  return items;
}

function toStreamingState(events: TranscriptEvents): StreamingState {
  const state = createEmptyStreamingState();
  for (const event of events) {
    state.events.set(event.id, event);
    const bucket = state.eventsByMessage.get(event.messageId) ?? [];
    bucket.push(event);
    state.eventsByMessage.set(event.messageId, bucket);
    accumulate(state, event);
  }
  return state;
}

function accumulate(state: StreamingState, event: FlatStreamEventUnion): void {
  switch (event.eventType) {
    case 'message_start': {
      const start = event as MessageStartEvent;
      if (!state.messageEventIds.includes(start.messageId)) {
        state.messageEventIds.push(start.messageId);
      }
      break;
    }
    case 'text_delta':
      state.textAccumulators.set(
        `${event.messageId}-block-${event.blockIndex}`,
        remoteMarkdown(event.delta),
      );
      break;
    case 'thinking_delta':
      state.textAccumulators.set(
        `${event.messageId}-thinking-${event.blockIndex}`,
        remoteMarkdown(event.delta),
      );
      break;
    case 'tool_delta':
      state.toolInputAccumulators.set(`${event.toolCallId}-input`, event.delta);
      break;
    default:
      break;
  }
}

/** A copy of `node` whose markdown-file tool content is inert (see above). */
function inertTools(node: ExecutionNode): ExecutionNode {
  const children = node.children.map(inertTools);
  const path = node.toolInput?.['file_path'];
  if (
    node.type !== 'tool' ||
    typeof path !== 'string' ||
    !MARKDOWN_PATH.test(path)
  ) {
    return { ...node, children };
  }
  const input = node.toolInput ?? {};
  const content = input['content'];
  return {
    ...node,
    children,
    toolInput:
      typeof content === 'string'
        ? { ...input, content: remoteMarkdown(content) }
        : input,
    toolOutput:
      typeof node.toolOutput === 'string'
        ? remoteMarkdown(node.toolOutput)
        : node.toolOutput,
  };
}

/** The callback bag the builders recurse through, as `ExecutionTreeBuilderService` wires it. */
function builderDeps(
  agentStats: AgentStatsService,
  indexes: ReturnType<typeof buildStreamingIndexes>,
): BuilderDeps {
  const deps: BuilderDeps = {
    // A remote transcript has no local background-agent registry.
    backgroundAgentStore: { isBackgroundAgent: () => false },
    agentStats,
    loggedUnmatchedToolCallIds: new Set<string>(),
    // One build over one state: the indexes are computed once.
    getIndexes: () => indexes,
    buildMessageNode: (messageId, st, depth = 0) =>
      buildMessageNode(deps, messageId, st, depth),
    findMessageStartEvent: (st, messageId) =>
      findMessageStartEvent(st, messageId),
    buildToolNode: (toolStart, st, depth = 0) =>
      buildToolNode(deps, toolStart, st, depth),
    buildToolChildren: (toolCallId, st, depth = 0) =>
      buildToolChildren(deps, toolCallId, st, depth),
    collectTools: (messageId, st, depth) =>
      collectTools(deps, messageId, st, depth),
    buildAgentNode: (agentStart, toolCallId, st, depth) =>
      buildAgentNode(deps, agentStart, toolCallId, st, depth),
  };
  return deps;
}
