import {
  FlatStreamEventUnion,
  MessageStartEvent,
  TextDeltaEvent,
  ToolResultEvent,
  MessageCompleteEvent,
  EventSource,
} from '@ptah-extension/shared';

import {
  SDKUserMessage,
  TextBlock,
  ToolResultBlock,
  isInterruptSentinelText,
} from '../types/sdk-types/claude-sdk.types';
import { generateEventId } from './message-transform-helpers';
import { takeBackgroundAgentStartedEvent } from './background-started-event';
import { bindTaskResultToHeldStart } from './task-result-agent-binding';
import type {
  TransformerState,
  TransformerSessionId,
} from './transformer-state';
import type { TransformerHelpers } from './transformer-helpers';

const SDK_STOCK_CANCELLATION =
  "The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.";

interface ProviderToolStop {
  toolUseIds: ReadonlySet<string>;
  text: string;
}

// Associate the exact live SDK frame with tool IDs captured before Ptah
// closed the owned query. Replayed transcript entries carry no attribution.
const providerToolStops = new WeakMap<SDKUserMessage, ProviderToolStop>();

export function attributeProviderToolResults(
  message: SDKUserMessage,
  toolUseIds: ReadonlySet<string>,
  text: string,
): void {
  if (message.parent_tool_use_id === null && toolUseIds.size) {
    providerToolStops.set(message, { toolUseIds, text });
  }
}

function renderToolResult(
  result: ToolResultBlock,
  stop: ProviderToolStop | undefined,
): ToolResultBlock['content'] {
  if (!result.is_error || !stop?.toolUseIds.has(result.tool_use_id)) return result.content;
  if (result.content === SDK_STOCK_CANCELLATION) return stop.text;
  if (!Array.isArray(result.content)) return result.content;
  return result.content.map((block) =>
    block.type === 'text' && block.text === SDK_STOCK_CANCELLATION
      ? { ...block, text: stop.text }
      : block,
  );
}

export class UserMessageTransformer {
  /**
   * @param inboundPeer - Set only when the turn arrived from another session.
   *   Stamped onto `message_start` so the UI can render it as a message from a
   *   named sender instead of as the user's own words.
   */
  transform(
    sdkMessage: SDKUserMessage,
    state: TransformerState,
    helpers: TransformerHelpers,
    sessionId?: TransformerSessionId,
    inboundPeer?: { readonly label: string; readonly beforeClientMessageId?: string },
    clientMessageId?: string,
  ): FlatStreamEventUnion[] {
    const { uuid, message, parent_tool_use_id } = sdkMessage;
    const events: FlatStreamEventUnion[] = [];
    const messageId = uuid || `user-${Date.now()}`;

    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          block.type === 'tool_result' &&
          'tool_use_id' in block
        ) {
          const toolResultBlock = block as ToolResultBlock;
          bindTaskResultToHeldStart(
            toolResultBlock.tool_use_id,
            toolResultBlock.content,
            helpers,
          );
          // background_agent_started goes BEFORE the tool_result, the same
          // load-bearing order as the assistant path (TASK_2026_376 F2): the
          // webview's tool_result guard reads BackgroundAgentStore, which only
          // this event populates. Do not reorder these two pushes.
          const bgEvent = takeBackgroundAgentStartedEvent({
            toolCallId: toolResultBlock.tool_use_id,
            content: toolResultBlock.content,
            messageId,
            sessionId,
            parentToolUseId: parent_tool_use_id ?? undefined,
            state,
            helpers,
          });
          if (bgEvent) {
            events.push(bgEvent);
          }
          const toolResultEvent: ToolResultEvent = {
            id: generateEventId(),
            eventType: 'tool_result',
            timestamp: Date.now(),
            sessionId,
            source: 'complete' as EventSource,
            messageId,
            toolCallId: toolResultBlock.tool_use_id,
            output: renderToolResult(toolResultBlock, providerToolStops.get(sdkMessage)),
            isError: toolResultBlock.is_error ?? false,
            parentToolUseId: parent_tool_use_id ?? undefined,
          };
          events.push(toolResultEvent);
        }
      }

      if (events.length > 0) {
        return events;
      }
    }

    let textContent = '';
    if (typeof message.content === 'string') {
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      textContent = message.content
        .filter(
          (block): block is TextBlock =>
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            block.type === 'text' &&
            'text' in block,
        )
        .map((block) => block.text)
        .join('\n');
    }

    if (!textContent || !textContent.trim()) {
      helpers.logger.debug(
        '[SdkMessageTransformer] Skipping empty user message',
        {
          uuid,
        },
      );
      return [];
    }

    if (isInterruptSentinelText(textContent)) {
      helpers.logger.debug(
        '[SdkMessageTransformer] Skipping SDK interrupt sentinel message',
        { uuid },
      );
      return [];
    }

    const parentToolUseId = parent_tool_use_id ?? undefined;

    const messageStartEvent: MessageStartEvent = {
      id: generateEventId(),
      eventType: 'message_start',
      timestamp: Date.now(),
      sessionId,
      source: 'complete' as EventSource,
      messageId: uuid || `user-${Date.now()}`,
      role: 'user',
      parentToolUseId,
      // Absent for an ordinary turn — the key is only present when the turn
      // came from outside this session.
      ...(inboundPeer ? { inboundPeer } : {}),
      ...(clientMessageId !== undefined ? { clientMessageId } : {}),
    };
    events.push(messageStartEvent);

    const textDeltaEvent: TextDeltaEvent = {
      id: generateEventId(),
      eventType: 'text_delta',
      timestamp: Date.now(),
      sessionId,
      source: 'complete' as EventSource,
      messageId: uuid || `user-${Date.now()}`,
      delta: textContent,
      blockIndex: 0,
      parentToolUseId,
    };
    events.push(textDeltaEvent);

    const messageCompleteEvent: MessageCompleteEvent = {
      id: generateEventId(),
      eventType: 'message_complete',
      timestamp: Date.now(),
      sessionId,
      source: 'complete' as EventSource,
      messageId: uuid || `user-${Date.now()}`,
      parentToolUseId,
    };
    events.push(messageCompleteEvent);

    return events;
  }
}
