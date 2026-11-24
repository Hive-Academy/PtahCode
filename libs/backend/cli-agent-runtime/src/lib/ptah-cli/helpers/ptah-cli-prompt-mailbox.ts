import { randomUUID } from 'node:crypto';
import type { SDKUserMessage } from '@ptah-extension/agent-sdk';

/** A user turn's content: plain text, or text plus image blocks. */
export type PromptTurnContent = SDKUserMessage['message']['content'];

/** One user turn for the mailbox; `uuid` is generated when absent. */
export interface PromptTurn {
  readonly content: PromptTurnContent;
  readonly uuid?: string;
}

export interface PromptMailbox {
  readonly prompt: AsyncGenerator<SDKUserMessage>;
  push(turn: PromptTurn, sessionId?: string): void;
  close(): void;
}

/** The SDK user message for one turn; shared by the mailbox and the named-account gate. */
export function toUserMessage(
  turn: PromptTurn,
  sessionId?: string,
): SDKUserMessage {
  return {
    type: 'user',
    uuid: (turn.uuid ?? randomUUID()) as SDKUserMessage['uuid'],
    message: {
      role: 'user',
      content: turn.content,
    },
    parent_tool_use_id: null,
    ...(sessionId ? { session_id: sessionId } : {}),
  };
}

/** `initialTask` is the first turn: plain text, or text plus image blocks (a cold resume). */
export function createPromptMailbox(initialTask: PromptTurnContent): PromptMailbox {
  const queue: SDKUserMessage[] = [toUserMessage({ content: initialTask })];
  let closed = false;
  let notify: (() => void) | null = null;

  const waitForNext = (): Promise<void> =>
    new Promise<void>((resolve) => {
      notify = resolve;
    });

  const wake = (): void => {
    if (notify) {
      const resolve = notify;
      notify = null;
      resolve();
    }
  };

  async function* generator(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) {
          yield next;
        }
      }
      if (closed) {
        return;
      }
      await waitForNext();
    }
  }

  return {
    prompt: generator(),
    push(turn: PromptTurn, sessionId?: string): void {
      if (closed) {
        return;
      }
      queue.push(toUserMessage(turn, sessionId));
      wake();
    },
    close(): void {
      closed = true;
      wake();
    },
  };
}
