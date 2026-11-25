import 'reflect-metadata';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import { RpcHandler } from '@ptah-extension/vscode-core';
import type {
  AgentMessageCoordinator,
  LaneCompletionNotifier,
  ParentDeliveryDrainerService,
} from '@ptah-extension/cli-agent-runtime';
import { AgentId, type AgentDeliveryReceipt, type ParentDeliveryView } from '@ptah-extension/shared';
import { AgentMessageRpcHandlers } from './agent-message-rpc.handlers';

jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  CLI_AGENT_RUNTIME_TOKENS: {
    AGENT_MESSAGE_COORDINATOR: Symbol.for('AgentMessageCoordinator'),
  },
  ParentDeliveryDrainerService: class ParentDeliveryDrainerService {},
  LaneCompletionNotifier: class LaneCompletionNotifier {},
}));

const AGENT_ID = '11111111-2222-4333-8444-555555555555';
const MESSAGE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER = { kind: 'user' };
const REPORT_ID = `lane-delivery:report:${AGENT_ID}:3:abc123` as const;
const COMPLETION_ID = `lane-delivery:${AGENT_ID}:2026-11-07T10:00:00.000Z` as const;

type Envelope = { id: ParentDeliveryView['deliveryId']; state: ParentDeliveryView['state'] };

function view(id: ParentDeliveryView['deliveryId'], state: ParentDeliveryView['state']): ParentDeliveryView {
  return {
    deliveryId: id, agentId: AGENT_ID, parentSessionId: 'parent-1', kind: 'report', state,
    createdAt: 1, updatedAt: 2, attempts: 1,
  };
}

function receipt(id: number, state: AgentDeliveryReceipt['state']): AgentDeliveryReceipt {
  return {
    id: `r-${id}`, agentId: AgentId.from(AGENT_ID), state, mode: 'queue-next-turn', delivery: 'queue',
    createdAt: id, updatedAt: id,
  };
}

describe('AgentMessageRpcHandlers', () => {
  const setup = (stored: Envelope[] = []) => {
    const logger = Object.assign(Object.create(null) as Logger, createMockLogger());
    const rpc = new RpcHandler(logger, undefined, undefined);
    const coordinator = Object.assign(Object.create(null) as AgentMessageCoordinator, {
      preview: jest.fn().mockReturnValue({ supported: true, mode: 'steer' }),
      send: jest.fn().mockResolvedValue({ mode: 'queue-next-turn', messageId: MESSAGE_ID }),
      getReceipt: jest.fn().mockResolvedValue({ id: MESSAGE_ID, state: 'accepted' }),
      cancel: jest.fn().mockResolvedValue({ id: MESSAGE_ID, state: 'cancelled' }),
      retry: jest.fn().mockResolvedValue({ mode: 'queue-next-turn', messageId: MESSAGE_ID }),
      getBody: jest.fn().mockResolvedValue('held text'),
      getMessage: jest.fn().mockResolvedValue({ text: 'held text' }),
      turnOptions: jest.fn().mockResolvedValue({
        models: [{ id: 'grok-4', name: 'Grok 4' }], efforts: ['low', 'high'], currentModel: 'grok-4',
        commands: [{ name: 'compact', group: 'command', description: 'Compact' }, { name: 'code-review', group: 'skill' }],
      }),
      listReceipts: jest.fn().mockResolvedValue([]),
    });
    const envelopes = [...stored];
    const parentDelivery = Object.assign(Object.create(null) as ParentDeliveryDrainerService, {
      list: jest.fn(() => envelopes),
      toView: jest.fn((envelope: Envelope) => view(envelope.id, envelope.state)),
      retry: jest.fn(async (id: Envelope['id']) => ({ id, state: 'pending' as const })),
      cancel: jest.fn(async (id: Envelope['id']) => ({ id, state: 'cancelled' as const })),
    });
    const laneCompletion = Object.assign(Object.create(null) as LaneCompletionNotifier, {
      retryUnsaved: jest.fn().mockResolvedValue(undefined),
    });
    new AgentMessageRpcHandlers(rpc, coordinator, parentDelivery, laneCompletion).register();
    const call = (method: string, params: Record<string, unknown>) =>
      rpc.handleMessage({ method, params, correlationId: method });
    return { coordinator, parentDelivery, laneCompletion, envelopes, rpc, call };
  };

  it('registers exactly the eleven agent message methods', () => {
    const { rpc } = setup();
    expect(rpc.getRegisteredMethods()).toEqual(AgentMessageRpcHandlers.METHODS);
    expect(AgentMessageRpcHandlers.METHODS).toHaveLength(11);
    expect(AgentMessageRpcHandlers.METHODS).toContain('agent:getLaneComposerOptions');
  });

  it('routes preview, send, receipt and cancel to the coordinator as the user', async () => {
    const { coordinator, call } = setup();
    await call('agent:previewMessage', { agentId: AGENT_ID, delivery: 'now' });
    await call('agent:sendMessage', { agentId: AGENT_ID, message: 'hello', delivery: 'steer', idempotencyKey: 'k.1:a-b' });
    await call('agent:getMessageReceipt', { agentId: AGENT_ID, messageId: MESSAGE_ID });
    await call('agent:cancelMessage', { agentId: AGENT_ID, messageId: MESSAGE_ID });
    expect(coordinator.preview).toHaveBeenCalledWith({ agentId: AGENT_ID, delivery: 'now' });
    expect(coordinator.send).toHaveBeenCalledWith(
      { agentId: AGENT_ID, message: 'hello', delivery: 'steer', idempotencyKey: 'k.1:a-b' }, USER,
    );
    expect(coordinator.getReceipt).toHaveBeenCalledWith(AGENT_ID, MESSAGE_ID, USER);
    expect(coordinator.cancel).toHaveBeenCalledWith(AGENT_ID, MESSAGE_ID, USER);
  });

  it('rejects invalid delivery, unknown fields, a sender param and a bad idempotency key', async () => {
    const { coordinator, call } = setup();
    const results = await Promise.all([
      call('agent:sendMessage', { agentId: AGENT_ID, message: 'hello', delivery: 'later' }),
      call('agent:previewMessage', { agentId: AGENT_ID, delivery: 'queue', secret: 'extra' }),
      call('agent:sendMessage', { agentId: AGENT_ID, message: 'hello', sender: { kind: 'user' } }),
      call('agent:sendMessage', { agentId: AGENT_ID, message: 'hello', idempotencyKey: 'has space' }),
      call('agent:sendMessage', { agentId: AGENT_ID, message: 'hello', idempotencyKey: 'k'.repeat(129) }),
    ]);
    for (const result of results) expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
    expect(coordinator.send).not.toHaveBeenCalled();
    expect(coordinator.preview).not.toHaveBeenCalled();
  });

  it('accepts a 102,400-character message and rejects 102,401 (AGENT_MESSAGE_MAX_CHARS)', async () => {
    const { coordinator, call } = setup();
    const oversized = await call('agent:sendMessage', { agentId: AGENT_ID, message: 'x'.repeat(102_401) });
    expect(oversized).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
    expect(coordinator.send).not.toHaveBeenCalled();
    const atLimit = await call('agent:sendMessage', { agentId: AGENT_ID, message: 'x'.repeat(102_400) });
    expect(atLimit.success).toBe(true);
    expect(coordinator.send).toHaveBeenCalledTimes(1);
  });

  it('accepts an image-only message and rejects one with neither text nor images', async () => {
    const { coordinator, call } = setup();
    const images = [{ data: 'aGk=', mediaType: 'image/png' }];
    const imageOnly = await call('agent:sendMessage', { agentId: AGENT_ID, message: '', turn: { images } });
    expect(imageOnly.success).toBe(true);
    expect(coordinator.send).toHaveBeenCalledWith({ agentId: AGENT_ID, message: '', turn: { images } }, USER);
    const results = await Promise.all([
      call('agent:sendMessage', { agentId: AGENT_ID, message: '' }),
      call('agent:sendMessage', { agentId: AGENT_ID, message: '   ', turn: { images: [] } }),
      call('agent:sendMessage', { agentId: AGENT_ID, message: '', turn: { files: ['a.ts'] } }),
    ]);
    for (const result of results) expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
    expect(coordinator.send).toHaveBeenCalledTimes(1);
  });

  it('preserves message whitespace', async () => {
    const { coordinator, call } = setup();
    await call('agent:sendMessage', { agentId: AGENT_ID, message: '  hello  ' });
    expect(coordinator.send).toHaveBeenCalledWith({ agentId: AGENT_ID, message: '  hello  ' }, USER);
  });

  describe('message receipts', () => {
    it('lists receipts newest first with every undelivered one and at most 256 finished ones', async () => {
      const { coordinator, call } = setup();
      const finished = Array.from({ length: 300 }, (_, index) => receipt(index + 10, index % 2 ? 'settled' : 'cancelled'));
      const undelivered = [receipt(1, 'accepted'), receipt(2, 'outcome-unknown'), receipt(3, 'failed')];
      coordinator.listReceipts = jest.fn().mockResolvedValue([...undelivered, ...finished]);
      const response = await call('agent:listMessageReceipts', { agentId: AGENT_ID, parentSessionId: 'parent-1' });
      expect(coordinator.listReceipts).toHaveBeenCalledWith({ agentId: AGENT_ID, parentSessionId: 'parent-1' });
      const receipts = (response.data as { receipts: AgentDeliveryReceipt[] }).receipts;
      expect(receipts).toHaveLength(256 + 3);
      expect(receipts[0].id).toBe('r-309');
      expect(receipts.slice(-3).map((item) => item.id)).toEqual(['r-3', 'r-2', 'r-1']);
    });

    it('rejects a bad list filter', async () => {
      const { coordinator, call } = setup();
      const result = await call('agent:listMessageReceipts', { parentSessionId: '' });
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(coordinator.listReceipts).not.toHaveBeenCalled();
    });

    it('returns a held body as the user', async () => {
      const { coordinator, call } = setup();
      const result = await call('agent:getQueuedMessageBody', { agentId: AGENT_ID, messageId: MESSAGE_ID });
      expect(result.data).toEqual({ text: 'held text' });
      expect(coordinator.getMessage).toHaveBeenCalledWith(AGENT_ID, MESSAGE_ID, USER);
      const invalid = await call('agent:getQueuedMessageBody', { agentId: AGENT_ID, messageId: 'not-a-uuid' });
      expect(invalid).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
    });

    it('retries a message with the duplicate-risk confirmation', async () => {
      const { coordinator, call } = setup();
      await call('agent:retryMessage', { agentId: AGENT_ID, messageId: MESSAGE_ID, confirmDuplicateRisk: true });
      await call('agent:retryMessage', { agentId: AGENT_ID, messageId: MESSAGE_ID });
      expect(coordinator.retry).toHaveBeenNthCalledWith(1, AGENT_ID, MESSAGE_ID, USER, { confirmDuplicateRisk: true });
      expect(coordinator.retry).toHaveBeenNthCalledWith(2, AGENT_ID, MESSAGE_ID, USER, { confirmDuplicateRisk: undefined });
      const invalid = await call('agent:retryMessage', { agentId: AGENT_ID, messageId: MESSAGE_ID, confirmDuplicateRisk: 'yes' });
      expect(invalid).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(coordinator.retry).toHaveBeenCalledTimes(2);
    });
  });

  describe('parent deliveries', () => {
    it('lists parent deliveries for a parent session', async () => {
      const { parentDelivery, call } = setup([{ id: REPORT_ID, state: 'pending' }]);
      const result = await call('agent:listParentDeliveries', { parentSessionId: 'parent-1' });
      expect(parentDelivery.list).toHaveBeenCalledWith('parent-1');
      expect(result.data).toEqual({ deliveries: [view(REPORT_ID, 'pending')] });
    });

    it.each([REPORT_ID, COMPLETION_ID])('retries and cancels a stored delivery with id %s', async (id) => {
      const { parentDelivery, laneCompletion, call } = setup([{ id, state: 'outcome-unknown' }]);
      const retried = await call('agent:retryParentDelivery', { deliveryId: id, confirmDuplicateRisk: true });
      expect(parentDelivery.retry).toHaveBeenCalledWith(id, { confirmDuplicateRisk: true });
      expect(retried.data).toEqual(view(id, 'pending'));
      const cancelled = await call('agent:cancelParentDelivery', { deliveryId: id });
      expect(parentDelivery.cancel).toHaveBeenCalledWith(id);
      expect(cancelled.data).toEqual(view(id, 'cancelled'));
      expect(laneCompletion.retryUnsaved).not.toHaveBeenCalled();
    });

    it('rejects ids that are not parent delivery ids', async () => {
      const { parentDelivery, call } = setup();
      const results = await Promise.all([
        call('agent:retryParentDelivery', { deliveryId: 'report:1' }),
        call('agent:cancelParentDelivery', { deliveryId: 'lane-delivery:' }),
        call('agent:cancelParentDelivery', { deliveryId: 'lane-delivery:has space' }),
        call('agent:retryParentDelivery', { deliveryId: REPORT_ID, extra: true }),
      ]);
      for (const result of results) expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(parentDelivery.retry).not.toHaveBeenCalled();
      expect(parentDelivery.cancel).not.toHaveBeenCalled();
    });

    it('maps a confirmation refusal to a coded user error', async () => {
      const { parentDelivery, call } = setup([{ id: REPORT_ID, state: 'outcome-unknown' }]);
      parentDelivery.retry = jest.fn().mockResolvedValue({ refused: 'confirmation-required' });
      const result = await call('agent:retryParentDelivery', { deliveryId: REPORT_ID });
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(result.error).toContain('confirmDuplicateRisk');
    });

    it('saves an unsaved completion once through the notifier, then retries the stored record', async () => {
      const { parentDelivery, laneCompletion, envelopes, call } = setup();
      laneCompletion.retryUnsaved = jest.fn(async () => {
        envelopes.push({ id: COMPLETION_ID, state: 'pending' });
        return view(COMPLETION_ID, 'pending');
      });
      const first = await call('agent:retryParentDelivery', { deliveryId: COMPLETION_ID });
      expect(first.data).toEqual(view(COMPLETION_ID, 'pending'));
      expect(laneCompletion.retryUnsaved).toHaveBeenCalledWith(COMPLETION_ID);
      expect(parentDelivery.retry).not.toHaveBeenCalled();
      await call('agent:retryParentDelivery', { deliveryId: COMPLETION_ID });
      expect(laneCompletion.retryUnsaved).toHaveBeenCalledTimes(1);
      expect(parentDelivery.retry).toHaveBeenCalledTimes(1);
    });

    it('answers NOT_FOUND for an id that is neither stored nor unsaved', async () => {
      const { laneCompletion, call } = setup();
      const retry = await call('agent:retryParentDelivery', { deliveryId: REPORT_ID });
      const cancel = await call('agent:cancelParentDelivery', { deliveryId: REPORT_ID });
      expect(laneCompletion.retryUnsaved).toHaveBeenCalledWith(REPORT_ID);
      expect(retry).toMatchObject({ success: false, errorCode: 'MESSAGE_ID_NOT_FOUND' });
      expect(cancel).toMatchObject({ success: false, errorCode: 'MESSAGE_ID_NOT_FOUND' });
    });
  });

  describe('turn input and composer options', () => {
    const image = { data: 'aGVsbG8=', mediaType: 'image/png' };

    it('passes a valid turn to the coordinator', async () => {
      const { coordinator, call } = setup();
      const turn = { model: 'claude-opus-4@1m', reasoningEffort: 'high', files: ['src/a.ts'], images: [image] };
      const result = await call('agent:sendMessage', { agentId: AGENT_ID, message: 'look', turn });
      expect(result.success).toBe(true);
      expect(coordinator.send).toHaveBeenCalledWith({ agentId: AGENT_ID, message: 'look', turn }, USER);
    });

    it.each([
      'gpt-5.1-codex', 'grok-4-fast', 'gemini-4-hydrogen-low', 'Gemini 3.1 Pro (High)',
      'claude-sonnet-4-6', 'opus[1m]', 'openai/gpt-5', 'claude-opus-4@1m',
    ])('accepts the provider model id %s', async (model) => {
      const { coordinator, call } = setup();
      const result = await call('agent:sendMessage', { agentId: AGENT_ID, message: 'x', turn: { model } });
      expect(result.success).toBe(true);
      expect(coordinator.send).toHaveBeenCalled();
    });

    it.each([
      ['an unknown turn key', { extra: true }],
      ['a model with a control character', { model: 'bad\u0007model' }],
      ['a model that reads as a flag', { model: '--dangerously-skip-permissions' }],
      ['a model with surrounding whitespace', { model: ' opus ' }],
      ['a 201-character effort', { reasoningEffort: 'x'.repeat(201) }],
      ['33 files', { files: Array.from({ length: 33 }, (_, index) => `f${index}`) }],
      ['a non-image media type', { images: [{ data: 'aGk=', mediaType: 'text/plain' }] }],
      ['non-base64 data', { images: [{ data: 'not base64!', mediaType: 'image/png' }] }],
      ['nine images', { images: Array.from({ length: 9 }, () => image) }],
      ['an unknown image key', { images: [{ ...image, path: '/etc/passwd' }] }],
    ])('rejects %s', async (_label, turn) => {
      const { coordinator, call } = setup();
      const result = await call('agent:sendMessage', { agentId: AGENT_ID, message: 'x', turn });
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(coordinator.send).not.toHaveBeenCalled();
    });

    it('rejects an image larger than MAX_IMAGE_SIZE_BYTES once decoded', async () => {
      const { coordinator, call } = setup();
      const data = 'A'.repeat(Math.ceil((5 * 1024 * 1024 * 4) / 3) + 4);
      const result = await call('agent:sendMessage', {
        agentId: AGENT_ID, message: 'x', turn: { images: [{ data, mediaType: 'image/png' }] },
      });
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(coordinator.send).not.toHaveBeenCalled();
    });

    it('returns the held turn with the queued body', async () => {
      const { coordinator, call } = setup();
      (coordinator.getMessage as jest.Mock).mockResolvedValueOnce({ text: 'held', turn: { model: 'm', files: ['a.ts'] } });
      const result = await call('agent:getQueuedMessageBody', { agentId: AGENT_ID, messageId: MESSAGE_ID });
      expect(result.data).toEqual({ text: 'held', turn: { model: 'm', files: ['a.ts'] } });
    });

    it('serves the lane composer options', async () => {
      const { coordinator, call } = setup();
      const result = await call('agent:getLaneComposerOptions', { agentId: AGENT_ID });
      expect(coordinator.turnOptions).toHaveBeenCalledWith(AGENT_ID);
      expect(result.data).toEqual({
        models: [{ id: 'grok-4', name: 'Grok 4' }], efforts: ['low', 'high'], currentModel: 'grok-4',
        commands: [{ name: 'compact', group: 'command', description: 'Compact' }, { name: 'code-review', group: 'skill' }],
      });
    });

    it('serves unsendable efforts alongside the native effort list in catalog order', async () => {
      const { coordinator, call } = setup();
      (coordinator.turnOptions as jest.Mock).mockResolvedValueOnce({
        models: [], efforts: ['low', 'future-effort', 'high'], unsendableEfforts: ['future-effort'], commands: [],
      });

      const result = await call('agent:getLaneComposerOptions', { agentId: AGENT_ID });

      expect(result.data).toEqual({
        models: [], efforts: ['low', 'future-effort', 'high'], unsendableEfforts: ['future-effort'], commands: [],
      });
    });

    it('omits an empty unsendable effort list', async () => {
      const { coordinator, call } = setup();
      (coordinator.turnOptions as jest.Mock).mockResolvedValueOnce({
        models: [], efforts: ['low', 'high'], unsendableEfforts: [], commands: [],
      });

      const result = await call('agent:getLaneComposerOptions', { agentId: AGENT_ID });

      expect(result.data).toStrictEqual({ models: [], efforts: ['low', 'high'], commands: [] });
    });

    it('passes the cached lists beside an error, and the stopped-lane reason (M5, S2)', async () => {
      const { coordinator, call } = setup();
      (coordinator.turnOptions as jest.Mock).mockResolvedValueOnce({
        models: [{ id: 'grok-4', name: 'Grok 4' }], efforts: [], commands: [], error: 'Lane options could not be read.',
        unavailableReason: 'Commands and skills appear when the lane is running.',
      });
      const result = await call('agent:getLaneComposerOptions', { agentId: AGENT_ID });
      expect(result.data).toEqual({
        models: [{ id: 'grok-4', name: 'Grok 4' }], efforts: [], commands: [], error: 'Lane options could not be read.',
        unavailableReason: 'Commands and skills appear when the lane is running.',
      });
    });

    it('answers a failed lookup with error, never a throw', async () => {
      const { coordinator, call } = setup();
      (coordinator.turnOptions as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const result = await call('agent:getLaneComposerOptions', { agentId: AGENT_ID });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ models: [], efforts: [], commands: [], error: 'Lane options could not be read.' });
    });

    it('rejects invalid composer option params', async () => {
      const { coordinator, call } = setup();
      const result = await call('agent:getLaneComposerOptions', { agentId: 'nope' });
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      expect(coordinator.turnOptions).not.toHaveBeenCalled();
    });
  });
});
