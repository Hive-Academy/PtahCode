/**
 * AgentMessageDispatcher: raw command delivery (decisions.md 15, R2-1, R3-2),
 * the blocked-command check on the same raw text, and lost attachments (D4).
 * Runs over the real envelope store and alias registry from the harness.
 */
import {
  type AgentMessageSender,
  type AgentProcessInfo,
  type CliAdapterManifest,
} from '@ptah-extension/shared';
import { AgentMessageAttachmentStore } from './agent-message-attachment.store';
import { agentMessageAckLine } from './agent-message-delivery-text';
import {
  AgentMessageDispatcher,
  classifyAttemptFailure,
  type DispatchAttempt,
} from './agent-message-dispatcher';
import { LaneResumeError } from './lane-resumers/lane-resumer.port';
import type { NewEnvelope } from './envelope/agent-message-envelope.schema';
import { harness, manifest } from './__fixtures__/agent-message-harness';

const grokManifest: CliAdapterManifest = {
  ...manifest,
  turnInput: {
    model: { state: 'supported', appliesAt: 'next-turn' },
    effort: { state: 'supported', appliesAt: 'next-turn' },
    images: { state: 'supported' },
    files: { state: 'supported', delivery: 'reference' },
    commands: { state: 'supported', blocked: ['always-approve'] },
    skills: { state: 'supported' },
  },
};

const user: AgentMessageSender = { kind: 'user' };
const parent: AgentMessageSender = { kind: 'parent' };

function setup(options: {
  advertised?: readonly string[];
  live?: boolean;
  status?: AgentProcessInfo['status'];
} = {}) {
  const h = harness();
  h.coordinator.dispose();
  h.setInfo({ potentialCapabilities: grokManifest, cli: 'grok', status: options.status ?? 'completed' });
  if (options.live === false) {
    h.tracked.sdkHandle = undefined;
    h.tracked.subprocessReleased = true;
  }
  h.sendToAgent.mockResolvedValue({ mode: 'start-turn' });
  const attachments = new AgentMessageAttachmentStore(h.logger);
  const advertisedCommands = jest.fn(async () => options.advertised);
  const dispatcher = new AgentMessageDispatcher({
    manager: h.manager, store: h.store, aliases: h.aliases, resume: h.resume,
    settleTurn: async () => undefined, logger: h.logger, attachments, advertisedCommands,
  });
  const attempt = async (
    body: string,
    patch: Partial<NewEnvelope> = {},
    delivery: 'queue' | 'now' = 'queue',
  ): Promise<{ attempt: DispatchAttempt; id: string }> => {
    const sender = patch.sender ?? user;
    const { envelope } = await h.store.put({
      targetAgentId: h.agentId, laneLineageId: h.agentId, sender,
      senderKey: sender.kind === 'user' ? 'user' : 'parent', mode: 'start-turn', delivery,
      ...patch,
    }, body);
    const plan = h.coordinator.preview({ agentId: h.agentId, delivery });
    const info = h.manager.findAgentInfo(h.agentId);
    if (!info) throw new Error('lane missing');
    return {
      id: envelope.id,
      attempt: {
        envelope, body, plan, info, laneId: h.agentId, requestedAgentId: h.agentId,
        routerDelivery: delivery,
      },
    };
  };
  return { h, dispatcher, attachments, advertisedCommands, attempt };
}

/** Argument `index` of the first `sendToAgent` call (the harness mock types only four). */
function sentArg(s: ReturnType<typeof setup>, index: number): unknown {
  const call: readonly unknown[] | undefined = s.h.sendToAgent.mock.calls[0];
  return call?.[index];
}

describe('AgentMessageDispatcher', () => {
  describe('raw command delivery', () => {
    it('sends an advertised /compact from the user raw, with no header, no ack, ackState unavailable', async () => {
      const s = setup({ advertised: ['compact', 'context'] });
      const { attempt, id } = await s.attempt('  /compact');
      const outcome = await s.dispatcher.attempt(attempt);
      expect(outcome.mode).toBe('start-turn');
      expect(s.h.sendToAgent).toHaveBeenCalledWith(s.h.agentId, '/compact', 'queue', id, false,
        { rawBody: '  /compact', noSteer: true });
      expect(await s.h.store.get(id)).toMatchObject({
        state: 'started', rawDelivery: { raw: true }, ackState: 'unavailable',
      });
    });

    it('sends the raw body to a cold resume and passes it as the guard', async () => {
      const s = setup({ advertised: ['compact'], live: false });
      const { attempt } = await s.attempt('/compact');
      await s.dispatcher.attempt(attempt);
      expect(s.h.resume.resume).toHaveBeenCalledWith(expect.objectContaining({ agentId: s.h.agentId }), '/compact',
        { rawBody: '/compact', blocked: ['always-approve'] }, undefined);
    });

    it('keeps the header and its ack line for ordinary text', async () => {
      const s = setup({ advertised: ['compact'] });
      const { attempt, id } = await s.attempt('please compact');
      await s.dispatcher.attempt(attempt);
      const text = String(sentArg(s, 1) ?? '');
      expect(text.startsWith(`[Ptah message ${id} from the user]`)).toBe(true);
      expect(text).toContain(agentMessageAckLine(id));
      expect(sentArg(s, 5)).toEqual({ rawBody: 'please compact' });
      expect(await s.h.store.get(id)).toMatchObject({ ackState: 'pending' });
      expect((await s.h.store.get(id))?.rawDelivery).toBeUndefined();
    });

    it('keeps the header for /compact from a parent sender', async () => {
      const s = setup({ advertised: ['compact'] });
      const { attempt, id } = await s.attempt('/compact', { sender: parent, senderKey: 'parent' });
      await s.dispatcher.attempt(attempt);
      expect(String(sentArg(s, 1))).toMatch(new RegExp(`^\\[Ptah message ${id} from the parent session\\]`));
      expect(s.advertisedCommands).not.toHaveBeenCalled();
    });

    it('keeps the header for a non-advertised /foo while a catalog is known', async () => {
      const s = setup({ advertised: ['compact'] });
      const { attempt } = await s.attempt('/foo');
      await s.dispatcher.attempt(attempt);
      expect(String(sentArg(s, 1))).toMatch(/^\[Ptah message /);
    });

    it('with no known list, keeps the header even when the manifest supports commands', async () => {
      const s = setup({ advertised: undefined });
      const { attempt, id } = await s.attempt('/usr/bin is missing');
      await s.dispatcher.attempt(attempt);
      expect(String(sentArg(s, 1))).toMatch(/^\[Ptah message /);
      expect(await s.h.store.get(id)).toMatchObject({ ackState: 'pending' });
      expect((await s.h.store.get(id))?.rawDelivery).toBeUndefined();
    });

    it('keeps the header when the command list lookup throws', async () => {
      const s = setup();
      s.advertisedCommands.mockRejectedValueOnce(new Error('catalog down'));
      const { attempt } = await s.attempt('/compact');
      await s.dispatcher.attempt(attempt);
      expect(String(sentArg(s, 1))).toMatch(/^\[Ptah message /);
    });

    it('refuses /always-approve on before any adapter call, keeping the body', async () => {
      const s = setup({ advertised: ['always-approve', 'compact'] });
      const { attempt, id } = await s.attempt('\n/Always-Approve on');
      const outcome = await s.dispatcher.attempt(attempt);
      expect(outcome).toMatchObject({
        mode: 'unsupported', reasonCode: 'turn-input-unsupported',
        detail: 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
      });
      expect(s.h.sendToAgent).not.toHaveBeenCalled();
      expect(s.h.resume.resume).not.toHaveBeenCalled();
      expect(await s.h.store.get(id)).toMatchObject({ state: 'failed', reason: 'turn-input-unsupported' });
      expect(await s.h.store.getBody(id)).toBe('\n/Always-Approve on');
    });

    it('delivers a retry of a raw envelope raw again, even without a list', async () => {
      const s = setup({ advertised: [] });
      const { attempt } = await s.attempt('/compact', { rawDelivery: { raw: true } });
      await s.dispatcher.attempt(attempt);
      expect(sentArg(s, 1)).toBe('/compact');
    });
  });

  describe('storage failures return an outcome (never throw, never stay dispatching)', () => {
    it('returns storage-unavailable when the refusal write of a blocked command fails', async () => {
      const s = setup({ advertised: ['compact'] });
      const { attempt, id } = await s.attempt('/always-approve on');
      jest.spyOn(s.h.store, 'transition').mockRejectedValueOnce(new Error('disk full'));
      const outcome = await s.dispatcher.attempt(attempt);
      expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'storage-unavailable' });
      expect(s.h.sendToAgent).not.toHaveBeenCalled();
      expect((await s.h.store.get(id))?.state).toBe('not-started');
    });

    it('writes the raw marker with the journal record, and sends nothing when that write fails', async () => {
      const s = setup({ advertised: ['compact'] });
      const { attempt, id } = await s.attempt('/compact');
      const mark = jest.spyOn(s.h.store, 'markDispatching').mockRejectedValueOnce(new Error('disk full'));
      const outcome = await s.dispatcher.attempt(attempt);
      expect(mark).toHaveBeenCalledWith(id, ['not-started'], { rawDelivery: { raw: true } });
      expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'storage-unavailable' });
      expect(s.h.sendToAgent).not.toHaveBeenCalled();
      expect((await s.h.store.get(id))?.state).not.toBe('dispatching');
    });
  });

  describe('cold resume settings refusal', () => {
    it('fails turn-options-refused with the refusal text, never retried', async () => {
      const s = setup();
      const { attempt } = await s.attempt('hello');
      const { patch, reason } = classifyAttemptFailure(
        new LaneResumeError('turn-settings-refused', 'Ptah CLI has no effort level "turbo".'), attempt.envelope);
      expect(reason).toBe('turn-options-refused');
      expect(patch).toMatchObject({
        state: 'failed', reason: 'turn-options-refused', lastError: 'Ptah CLI has no effort level "turbo".',
      });
    });
  });

  describe('a raw envelope never steers (R3-2)', () => {
    it('queues on a steer plan without confirmation', async () => {
      const s = setup({ advertised: ['compact'], status: 'running' });
      const { attempt } = await s.attempt('/compact', {}, 'now');
      expect(attempt.plan.mode).toBe('steer');
      await s.dispatcher.attempt(attempt);
      expect(sentArg(s, 2)).toBe('queue');
      expect(sentArg(s, 5)).toMatchObject({ noSteer: true });
    });

    it('interrupts and resumes on a steer plan when the user confirmed', async () => {
      const s = setup({ advertised: ['compact'], status: 'running' });
      const { attempt } = await s.attempt('/compact', { allowPartialTurnLoss: true }, 'now');
      await s.dispatcher.attempt(attempt);
      expect(sentArg(s, 2)).toBe('now');
      expect(sentArg(s, 4)).toBe(true);
      expect(sentArg(s, 5)).toMatchObject({ noSteer: true });
    });
  });

  describe('attachments', () => {
    it('fails attachments-unavailable with the body kept when held images are gone', async () => {
      const s = setup({ advertised: [] });
      const { attempt, id } = await s.attempt('look at this', { turn: { imageCount: 1 } });
      const outcome = await s.dispatcher.attempt(attempt);
      expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'attachments-unavailable' });
      expect(s.h.sendToAgent).not.toHaveBeenCalled();
      expect(await s.h.store.get(id)).toMatchObject({ state: 'failed', reason: 'attachments-unavailable' });
      expect(await s.h.store.getBody(id)).toBe('look at this');
    });

    it('passes held images, files and settings as the turn request', async () => {
      const s = setup({ advertised: [] });
      const image = { data: 'aGk=', mediaType: 'image/png' };
      const { attempt, id } = await s.attempt('look', {
        turn: { imageCount: 1, files: ['src/a.ts'], model: 'grok-4' },
      });
      s.attachments.hold(id, [image]);
      await s.dispatcher.attempt(attempt);
      expect(sentArg(s, 5)).toEqual({
        turn: { model: 'grok-4', files: ['src/a.ts'], images: [image] }, rawBody: 'look',
      });
      const logged = JSON.stringify([
        (s.h.logger.info as jest.Mock).mock.calls, (s.h.logger.warn as jest.Mock).mock.calls,
        (s.h.logger.error as jest.Mock).mock.calls,
      ]);
      expect(logged).not.toContain('aGk=');
    });
  });
});
