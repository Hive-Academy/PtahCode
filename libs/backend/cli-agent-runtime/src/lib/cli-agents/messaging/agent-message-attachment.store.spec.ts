import { AgentId } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  AgentMessageAttachmentCapacityError,
  AgentMessageAttachmentStore,
} from './agent-message-attachment.store';
import { AgentMessageEnvelopeStore, type AgentMessagePersistence } from './envelope/agent-message-envelope.store';

function createMockLogger(): Logger {
  const log: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'> = {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  };
  return log as Logger;
}

const image = (size: number) => ({ data: 'a'.repeat(size), mediaType: 'image/png' });

function memory(): AgentMessagePersistence {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string) => values.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    },
    keys: () => [...values.keys()],
  };
}

describe('AgentMessageAttachmentStore', () => {
  it('holds, reads again and releases images per envelope', () => {
    const store = new AgentMessageAttachmentStore();
    store.hold('a', [image(10)]);
    expect(store.take('a')).toEqual([image(10)]);
    expect(store.take('a')).toEqual([image(10)]);
    expect(store.heldBytes()).toBe(10 + 'image/png'.length);
    store.release('a');
    expect(store.take('a')).toBeUndefined();
    expect(store.heldBytes()).toBe(0);
    store.release('a');
    expect(store.heldBytes()).toBe(0);
  });

  it('refuses images over the host cap and keeps what was held', () => {
    const cost = 100 + 'image/png'.length;
    const store = new AgentMessageAttachmentStore(createMockLogger(), cost * 2);
    store.hold('a', [image(100)]);
    store.hold('b', [image(100)]);
    expect(() => store.hold('c', [image(1)])).toThrow(AgentMessageAttachmentCapacityError);
    expect(store.take('c')).toBeUndefined();
    // Replacing a holding counts only the difference.
    store.hold('a', [image(100)]);
    expect(store.heldBytes()).toBe(cost * 2);
    store.release('b');
    store.hold('c', [image(1)]);
    expect(store.take('c')).toHaveLength(1);
  });

  it('never logs image bytes when the cap is reached', () => {
    const logger = createMockLogger();
    const store = new AgentMessageAttachmentStore(logger, 5);
    expect(() => store.hold('a', [image(50)])).toThrow('attachments-capacity');
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(logged).not.toContain('a'.repeat(50));
  });

  it('an empty hold releases the envelope', () => {
    const store = new AgentMessageAttachmentStore();
    store.hold('a', [image(3)]);
    store.hold('a', []);
    expect(store.take('a')).toBeUndefined();
    expect(store.heldBytes()).toBe(0);
  });

  it.each(['settled', 'cancelled', 'failed', 'expired'] as const)(
    'is released when the envelope reaches %s through the store listener',
    async (state) => {
      const attachments = new AgentMessageAttachmentStore();
      const envelopes = new AgentMessageEnvelopeStore(memory());
      envelopes.setTerminalListener((envelope) => attachments.release(envelope.id));
      const agentId = AgentId.create();
      const { envelope } = await envelopes.put({
        targetAgentId: agentId, laneLineageId: agentId, sender: { kind: 'user' }, senderKey: 'user',
        mode: 'queue-next-turn', delivery: 'queue', turn: { imageCount: 1 },
      }, 'look at this');
      attachments.hold(envelope.id, [image(4)]);
      if (state === 'settled') {
        await envelopes.transition(envelope.id, { state: 'started', turnSeq: 1 });
        expect(attachments.take(envelope.id)).toHaveLength(1);
        await envelopes.transition(envelope.id, { state: 'settled', turnSeq: 1 });
      } else {
        await envelopes.transition(envelope.id, { state });
      }
      expect(attachments.take(envelope.id)).toBeUndefined();
      expect(attachments.heldBytes()).toBe(0);
    },
  );

  it('keeps images while the envelope is still undelivered', async () => {
    const attachments = new AgentMessageAttachmentStore();
    const envelopes = new AgentMessageEnvelopeStore(memory());
    envelopes.setTerminalListener((envelope) => attachments.release(envelope.id));
    const agentId = AgentId.create();
    const { envelope } = await envelopes.put({
      targetAgentId: agentId, laneLineageId: agentId, sender: { kind: 'user' }, senderKey: 'user',
      mode: 'queue-next-turn', delivery: 'queue', turn: { imageCount: 1 },
    }, 'look');
    attachments.hold(envelope.id, [image(4)]);
    await envelopes.transition(envelope.id, { state: 'blocked-retryable', reason: 'continuation_transient' });
    expect(attachments.take(envelope.id)).toHaveLength(1);
  });
});
