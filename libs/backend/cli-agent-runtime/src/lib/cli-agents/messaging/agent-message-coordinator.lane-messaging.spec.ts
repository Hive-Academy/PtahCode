/**
 * Lane-to-lane messaging through the coordinator (Component 15, P3-J): the
 * policy runs only for lane senders, a denial persists nothing, the recorded
 * sender comes from the verified binding, and status is scoped per viewer.
 */
import { AgentId, type AgentMessageSender } from '@ptah-extension/shared';
import { AgentMessageError } from '../agent-message-router.service';
import { ATTACHMENTS_CAPACITY_TEXT, AgentMessageCoordinator } from './agent-message-coordinator.service';
import { LaneMessagePolicy, type VerifiedLaneSender } from './lane-message.policy';
import { harness, idOf, manifest } from './__fixtures__/agent-message-harness';
import { AgentMessageAttachmentCapacityError, AgentMessageAttachmentStore } from './agent-message-attachment.store';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import type { SdkHandle } from '../cli-adapters/cli-adapter.interface';

const WS = 'ws-key-1';

function setup(withPolicy = true) {
  const h = harness();
  h.coordinator.dispose();
  h.setInfo({ workingDirectory: '/repo/packages/target', workspaceKey: WS });
  const senderId = AgentId.create();
  h.addLane(senderId, { workingDirectory: '/repo/.worktrees/sender', workspaceKey: WS, ptahCliName: 'Builder' });
  const policy = new LaneMessagePolicy({
    findAgentInfo: (id) => h.manager.findAgentInfo(id), events: h.events, logger: h.logger,
  });
  const authorize = jest.spyOn(policy, 'authorize');
  const coordinator = new AgentMessageCoordinator({
    manager: h.manager, detection: h.detection, store: h.store, aliases: h.aliases, resume: h.resume,
    scheduler: h.scheduler, ack: h.ack, logger: h.logger, ...(withPolicy ? { lanePolicy: policy } : {}),
  });
  const laneSender = (id: AgentId = senderId): AgentMessageSender => ({ kind: 'lane', agentId: id, verified: true });
  const binding = (patch: Partial<VerifiedLaneSender> = {}): VerifiedLaneSender => ({
    agentId: senderId, workspaceRoot: '/repo/.worktrees/sender', ...patch,
  });
  const persisted = (): number => h.storage.states().size;
  return { h, senderId, coordinator, authorize, laneSender, binding, persisted };
}

describe('AgentMessageCoordinator — lane to lane', () => {
  it('delivers a sibling message attributed to the verified sender lane', async () => {
    const { h, senderId, coordinator, laneSender, binding } = setup();
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'hello sibling' }, laneSender(), binding());
    expect(outcome.mode).toBe('queue-next-turn');
    expect(outcome.receipt).toMatchObject({ sender: 'lane', senderAgentId: senderId, senderVerified: true });
    const text = h.sendToAgent.mock.calls[0][1];
    expect(text.split('\n')[0]).toBe(`[Ptah message ${idOf(outcome)} from lane "Builder" (agent ${senderId})]`);
  });

  it.each([
    ['an unverified lane sender', (s: ReturnType<typeof setup>) =>
      [{ kind: 'lane', agentId: s.senderId, verified: false } as const, s.binding()] as const],
    ['a lane sender without a binding (revoked token)', (s: ReturnType<typeof setup>) =>
      [s.laneSender(), undefined] as const],
    ['a sender field that names another lane than the binding (spoofed)', (s: ReturnType<typeof setup>) =>
      [s.laneSender(AgentId.create()), s.binding()] as const],
  ])('refuses %s as identity-missing and persists nothing', async (_label, args) => {
    const s = setup();
    const [sender, laneBinding] = args(s);
    const outcome = await s.coordinator.send({ agentId: s.h.agentId, message: 'x' }, sender, laneBinding);
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'identity-missing' });
    expect(outcome.messageId).toBeUndefined();
    expect(s.persisted()).toBe(0);
    expect(s.authorize).not.toHaveBeenCalled();
    expect(s.h.sendToAgent).not.toHaveBeenCalled();
  });

  it.each([
    ['different-parent', { parentSessionId: 'parent-2' }],
    ['different-workspace', { workspaceKey: 'ws-key-2' }],
    ['workspace-missing', { workspaceKey: undefined }],
  ] as const)('denies %s with no body-bearing envelope', async (reason, targetPatch) => {
    const { h, coordinator, laneSender, binding, persisted } = setup();
    h.setInfo(targetPatch);
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'x' }, laneSender(), binding());
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: reason });
    expect(persisted()).toBe(0);
    expect(h.sendToAgent).not.toHaveBeenCalled();
  });

  it('denies a lane body over 32,768 chars', async () => {
    const { h, coordinator, laneSender, binding, persisted } = setup();
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'a'.repeat(32_769) }, laneSender(), binding());
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'body-too-large' });
    expect(persisted()).toBe(0);
  });

  it('rate-limits the 11th lane send in a minute', async () => {
    const { h, coordinator, laneSender, binding } = setup();
    for (let i = 0; i < 10; i++) {
      expect((await coordinator.send({ agentId: h.agentId, message: `m${i}` }, laneSender(), binding())).mode)
        .toBe('queue-next-turn');
    }
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'm10' }, laneSender(), binding());
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'rate-limited' });
  });

  it('refuses every lane send when no policy is wired', async () => {
    const { h, coordinator, laneSender, binding, persisted } = setup(false);
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'x' }, laneSender(), binding());
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'delivery-refused' });
    expect(persisted()).toBe(0);
  });

  it('leaves parent and user sends to the existing path', async () => {
    const { h, coordinator, authorize } = setup();
    expect((await coordinator.send({ agentId: h.agentId, message: 'p' }, { kind: 'parent', sessionId: 'parent-1' })).mode)
      .toBe('queue-next-turn');
    expect((await coordinator.send({ agentId: h.agentId, message: 'u' }, { kind: 'user' })).mode)
      .toBe('queue-next-turn');
    expect(authorize).not.toHaveBeenCalled();
  });

  describe('status scoping', () => {
    it('shows the message to the sender and the target, and not_found to a third lane', async () => {
      const { h, senderId, coordinator, laneSender, binding } = setup();
      const id = idOf(await coordinator.send({ agentId: h.agentId, message: 'hi' }, laneSender(), binding()));
      await expect(coordinator.getReceipt(h.agentId, id, laneSender(senderId))).resolves.toMatchObject({ id });
      await expect(coordinator.getReceipt(h.agentId, id, laneSender(h.agentId))).resolves.toMatchObject({ id });
      const third = AgentId.create();
      h.addLane(third, { workspaceKey: WS });
      const denied = coordinator.getReceipt(h.agentId, id, laneSender(third));
      await expect(denied).rejects.toBeInstanceOf(AgentMessageError);
      await expect(denied).rejects.toMatchObject({ code: 'not_found' });
    });

    it('does not widen an unverified lane viewer', async () => {
      const { h, coordinator, laneSender, binding } = setup();
      const id = idOf(await coordinator.send({ agentId: h.agentId, message: 'hi' }, laneSender(), binding()));
      await expect(coordinator.getReceipt(h.agentId, id, { kind: 'lane', agentId: h.agentId, verified: false }))
        .rejects.toMatchObject({ code: 'not_found' });
    });
  });
});

describe('AgentMessageCoordinator — turn input refusals and options', () => {
  const grokTurnInput: NonNullable<CliAdapterManifest['turnInput']> = {
    model: { state: 'supported', appliesAt: 'next-turn' },
    effort: { state: 'supported', appliesAt: 'next-turn' },
    images: { state: 'unsupported', reason: 'Grok did not advertise image input.' },
    files: { state: 'supported', delivery: 'reference' },
    commands: { state: 'supported', blocked: ['always-approve'] },
    skills: { state: 'supported' },
  };
  const grok: CliAdapterManifest = { ...manifest, turnInput: grokTurnInput };
  const handleOf = (h: ReturnType<typeof harness>): SdkHandle => {
    if (!h.tracked.sdkHandle) throw new Error('lane has no live handle');
    return h.tracked.sdkHandle;
  };
  const user = { kind: 'user' } as const;
  const image = { data: 'aGk=', mediaType: 'image/png' };

  function setupTurn(attachments: AgentMessageAttachmentStore | null = new AgentMessageAttachmentStore()) {
    const h = harness();
    h.coordinator.dispose();
    h.setInfo({ cli: 'grok', displayName: 'Grok', potentialCapabilities: grok });
    h.tracked.sdkHandle = { ...handleOf(h), applyTurnSettings: jest.fn() };
    const coordinator = new AgentMessageCoordinator({
      manager: h.manager, detection: h.detection, store: h.store, aliases: h.aliases, resume: h.resume,
      scheduler: h.scheduler, ack: h.ack, logger: h.logger, attachments,
    });
    return { h, coordinator, attachments, persisted: () => h.storage.states().size };
  }

  it('refuses an unsupported image with no envelope stored', async () => {
    const { h, coordinator, persisted } = setupTurn();
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'look', turn: { images: [image] } }, user);
    expect(outcome).toMatchObject({
      mode: 'unsupported', reasonCode: 'turn-input-unsupported', detail: 'Grok did not advertise image input.',
    });
    expect(outcome.messageId).toBeUndefined();
    expect(persisted()).toBe(0);
    expect(h.sendToAgent).not.toHaveBeenCalled();
  });

  it('refuses a model change on a steer with turn-options-refused and stores nothing', async () => {
    const { h, coordinator, persisted } = setupTurn();
    const outcome = await coordinator.send({
      agentId: h.agentId, message: 'now', delivery: 'now', turn: { model: 'grok-4-fast' },
    }, user);
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'turn-options-refused' });
    expect(persisted()).toBe(0);
  });

  it('refuses /always-approve on a live Grok lane with no envelope stored', async () => {
    const { h, coordinator, persisted } = setupTurn();
    const outcome = await coordinator.send({ agentId: h.agentId, message: '  /always-approve on' }, user);
    expect(outcome).toMatchObject({
      mode: 'unsupported', reasonCode: 'turn-input-unsupported',
      detail: 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
    });
    expect(persisted()).toBe(0);
    expect(h.sendToAgent).not.toHaveBeenCalled();
  });

  it('refuses /always-approve on a restored (stopped) Grok record and never resumes', async () => {
    const { h, coordinator, persisted } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped' });
    expect(coordinator.preview({ agentId: h.agentId }).usesResume).toBe(true);
    const outcome = await coordinator.send({ agentId: h.agentId, message: '/always-approve on' }, user);
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'turn-input-unsupported' });
    expect(h.resume.resume).not.toHaveBeenCalled();
    expect(persisted()).toBe(0);
  });

  it('accepts an image for a stopped lane whose cold resume carries images (D4)', async () => {
    const resumable: CliAdapterManifest = {
      ...grok, turnInput: { ...grokTurnInput, images: { state: 'supported', onSteer: false, onResume: true } },
    };
    const { h, coordinator, attachments } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ cli: 'claude', displayName: 'Claude', status: 'stopped', potentialCapabilities: resumable });
    expect(coordinator.preview({ agentId: h.agentId }).usesResume).toBe(true);
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'what colour?', turn: { images: [image] } }, user);
    expect(outcome.mode).not.toBe('unsupported');
    const id = idOf(outcome);
    expect(await h.store.get(id)).toMatchObject({ turn: { imageCount: 1 } });
    expect(attachments?.take(id)).toEqual([image]);
  });

  it('refuses an image for a stopped named-account lane with the named reason (D4)', async () => {
    const resumable: CliAdapterManifest = {
      ...grok, turnInput: { ...grokTurnInput, images: { state: 'supported', onSteer: false, onResume: true } },
    };
    const { h, coordinator, persisted } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ cli: 'claude', displayName: 'Claude', status: 'stopped', potentialCapabilities: resumable });
    // The record carries the run's account fields (`laneAccountFields`).
    Object.assign(h.tracked.info, { accountBindingId: 'run-1' });
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'what colour?', turn: { images: [image] } }, user);
    expect(outcome).toMatchObject({
      mode: 'unsupported', reasonCode: 'turn-input-unsupported',
      detail: 'Images need a running lane on a named-account Claude lane.',
    });
    expect(persisted()).toBe(0);
    expect(h.resume.resume).not.toHaveBeenCalled();
  });

  it('holds images beside the envelope and returns them with the body', async () => {
    const withImages: CliAdapterManifest = {
      ...grok, turnInput: { ...grokTurnInput, images: { state: 'supported' } },
    };
    const { h, coordinator, attachments } = setupTurn();
    h.setInfo({ potentialCapabilities: withImages });
    h.tracked.sdkHandle = { ...handleOf(h), turnInputSupport: () => ({ images: { state: 'supported' } }) };
    const outcome = await coordinator.send({
      agentId: h.agentId, message: 'look', turn: { images: [image], files: ['a.ts'], model: 'grok-4' },
    }, user);
    expect(outcome.mode).toBe('queue-next-turn');
    const id = idOf(outcome);
    expect(await h.store.get(id)).toMatchObject({ turn: { imageCount: 1, files: ['a.ts'], model: 'grok-4' } });
    expect(attachments?.take(id)).toEqual([image]);
    await expect(coordinator.getMessage(h.agentId, id, user)).resolves.toEqual({
      text: 'look', turn: { model: 'grok-4', files: ['a.ts'], images: [image] },
    });
    await expect(coordinator.getBody(h.agentId, id, user)).resolves.toBe('look');
  });

  it('returns a failed message with its images and keeps them for Retry (P5 S2)', async () => {
    const withImages: CliAdapterManifest = {
      ...grok, turnInput: { ...grokTurnInput, images: { state: 'supported' } },
    };
    const { h, coordinator, attachments } = setupTurn();
    h.setInfo({ potentialCapabilities: withImages });
    h.tracked.sdkHandle = { ...handleOf(h), turnInputSupport: () => ({ images: { state: 'supported' } }) };
    const id = idOf(await coordinator.send({ agentId: h.agentId, message: 'look', turn: { images: [image] } }, user));
    await h.store.transition(id, { state: 'failed', reason: 'turn-input-unsupported' });
    await expect(coordinator.getMessage(h.agentId, id, user)).resolves.toEqual({
      text: 'look', turn: { images: [image] },
    });
    // A second read (or a Retry) still finds them; the TTL or a cancel releases them.
    expect(attachments?.take(id)).toEqual([image]);
  });

  it('refuses a send past the attachment cap with user text, not the reason code (S1)', async () => {
    const withImages: CliAdapterManifest = {
      ...grok, turnInput: { ...grokTurnInput, images: { state: 'supported' } },
    };
    const full = new AgentMessageAttachmentStore();
    jest.spyOn(full, 'hold').mockImplementation(() => { throw new AgentMessageAttachmentCapacityError(); });
    const { h, coordinator, persisted } = setupTurn(full);
    h.setInfo({ potentialCapabilities: withImages });
    h.tracked.sdkHandle = { ...handleOf(h), turnInputSupport: () => ({ images: { state: 'supported' } }) };
    const outcome = await coordinator.send({ agentId: h.agentId, message: 'look', turn: { images: [image] } }, user);
    expect(outcome).toMatchObject({
      mode: 'unsupported', reasonCode: 'attachments-capacity', detail: ATTACHMENTS_CAPACITY_TEXT,
    });
    expect(persisted()).toBe(0);
  });

  it('releases held images when the limit gate throws before the envelope exists (M2)', async () => {
    const withImages: CliAdapterManifest = {
      ...grok, turnInput: { ...grokTurnInput, images: { state: 'supported' } },
    };
    const h = harness();
    h.coordinator.dispose();
    h.setInfo({ cli: 'grok', displayName: 'Grok', potentialCapabilities: withImages });
    h.tracked.sdkHandle = { ...handleOf(h), turnInputSupport: () => ({ images: { state: 'supported' } }) };
    const attachments = new AgentMessageAttachmentStore();
    const coordinator = new AgentMessageCoordinator({
      manager: h.manager, detection: h.detection, store: h.store, aliases: h.aliases, resume: h.resume,
      scheduler: h.scheduler, ack: h.ack, logger: h.logger, attachments,
      limitGate: { check: jest.fn().mockRejectedValue(new Error('limit lookup failed')) },
    });
    await expect(coordinator.send({ agentId: h.agentId, message: 'look', turn: { images: [image] } }, user))
      .rejects.toThrow('limit lookup failed');
    expect(attachments.heldBytes()).toBe(0);
  });

  it('serves the live catalog without hidden commands and keeps it for a stopped lane', async () => {
    const { h, coordinator } = setupTurn();
    h.setInfo({ model: 'grok-4' });
    h.tracked.sdkHandle = {
      ...handleOf(h),
      listTurnOptions: async () => ({
        models: [{ id: 'grok-4', name: 'Grok 4' }], efforts: ['low', 'high'],
        commands: [
          { name: 'compact', group: 'command' as const },
          { name: 'always-approve', group: 'command' as const },
          { name: 'code-review', group: 'skill' as const },
        ],
      }),
    };
    const live = await coordinator.turnOptions(h.agentId);
    expect(live).toMatchObject({ currentModel: 'grok-4', efforts: ['low', 'high'] });
    expect(live.commands.map((command) => command.name)).toEqual(['compact', 'code-review']);
    expect(live.error).toBeUndefined();

    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped' });
    const stopped = await coordinator.turnOptions(h.agentId);
    expect(stopped.commands.map((command) => command.name)).toEqual(['compact', 'code-review']);
  });

  it('serves a stopped lane with no cached catalog the adapter efforts and a reason (S2)', async () => {
    const { h, coordinator } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped' });
    (h.detection.getAdapter as jest.Mock).mockReturnValue({
      listModels: async () => [{ id: 'grok-4', name: 'Grok 4' }],
      laneEfforts: () => ['low', 'high'],
    });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toEqual({
      models: [{ id: 'grok-4', name: 'Grok 4' }], efforts: ['low', 'high'], commands: [],
      unavailableReason: 'Commands and skills appear when the lane is running.',
    });
    (h.detection.getAdapter as jest.Mock).mockReturnValue({ listModels: async () => [] });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toMatchObject({
      efforts: [], commands: [],
      unavailableReason: 'Effort levels, commands and skills appear when the lane is running.',
    });
  });

  it("derives a stopped lane's efforts for the record's model", async () => {
    const { h, coordinator } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped', model: 'grok-4' });
    const laneEfforts = jest.fn((model?: string) => (model === 'grok-4' ? ['low', 'high'] : []));
    (h.detection.getAdapter as jest.Mock).mockReturnValue({ listModels: async () => [], laneEfforts });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toMatchObject({
      currentModel: 'grok-4', efforts: ['low', 'high'],
      unavailableReason: 'Commands and skills appear when the lane is running.',
    });
    expect(laneEfforts).toHaveBeenCalledWith('grok-4');
  });

  it('serves a stopped Codex lane models and efforts from one catalog read (D4)', async () => {
    const { h, coordinator } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped' });
    const stoppedLaneCatalog = jest.fn(async () => ({
      models: [{ id: 'gpt-5', name: 'GPT-5 (Codex default)' }], efforts: ['low', 'medium', 'high'],
    }));
    const listModels = jest.fn(async () => []);
    const laneEfforts = jest.fn(() => ['max']);
    (h.detection.getAdapter as jest.Mock).mockReturnValue({ stoppedLaneCatalog, listModels, laneEfforts });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toEqual({
      models: [{ id: 'gpt-5', name: 'GPT-5 (Codex default)' }], efforts: ['low', 'medium', 'high'], commands: [],
      unavailableReason: 'Commands and skills appear when the lane is running.',
    });
    expect(stoppedLaneCatalog).toHaveBeenCalledTimes(1);
    expect(listModels).not.toHaveBeenCalled();
    expect(laneEfforts).not.toHaveBeenCalled();
    stoppedLaneCatalog.mockResolvedValueOnce({ models: [], efforts: [] });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toMatchObject({
      efforts: [], unavailableReason: 'Effort levels, commands and skills appear when the lane is running.',
    });
  });

  it('reports an error, not an empty catalog, when a stopped Codex catalog read fails (S1)', async () => {
    const { h, coordinator } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped' });
    const stoppedLaneCatalog = jest.fn(async () => {
      throw new Error('Codex executable is unavailable');
    });
    const laneEfforts = jest.fn(() => ['max']);
    (h.detection.getAdapter as jest.Mock).mockReturnValue({ stoppedLaneCatalog, laneEfforts });
    const view = await coordinator.turnOptions(h.agentId);
    expect(view).toMatchObject({
      models: [], efforts: [], commands: [], error: 'Lane options could not be read.',
    });
    expect(view.unavailableReason).toBeUndefined();
    expect(laneEfforts).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[AgentMessageCoordinator] Lane turn options unavailable', expect.any(Object),
    );
  });

  it('says a model with its own effort level offers none, instead of promising efforts later (M1)', async () => {
    const { h, coordinator } = setupTurn();
    h.tracked.sdkHandle = undefined;
    h.setInfo({ status: 'stopped', model: 'gemini-3-pro-high' });
    const laneEfforts = jest.fn((model?: string) => (model?.endsWith('-high') ? [] : ['low', 'high']));
    (h.detection.getAdapter as jest.Mock).mockReturnValue({ listModels: async () => [], laneEfforts });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toMatchObject({
      efforts: [],
      unavailableReason: 'This model sets its own effort level. Commands and skills appear when the lane is running.',
    });
    h.setInfo({ status: 'stopped', model: 'gemini-3-pro' });
    await expect(coordinator.turnOptions(h.agentId)).resolves.toMatchObject({
      efforts: ['low', 'high'], unavailableReason: 'Commands and skills appear when the lane is running.',
    });
  });

  it('reads the cached command list for a / send instead of asking the lane again (M9)', async () => {
    const { h, coordinator } = setupTurn();
    const listTurnOptions = jest.fn(async () => ({
      models: [], efforts: [], commands: [{ name: 'compact', group: 'command' as const }],
    }));
    h.tracked.sdkHandle = { ...handleOf(h), listTurnOptions };
    await coordinator.turnOptions(h.agentId);
    await coordinator.send({ agentId: h.agentId, message: '/compact' }, user);
    expect(listTurnOptions).toHaveBeenCalledTimes(1);
    expect(h.sendToAgent).toHaveBeenCalledWith(h.agentId, '/compact', expect.anything(), expect.any(String),
      false, expect.objectContaining({ noSteer: true }));
  });

  it('returns an error result, never a throw, when the lookup fails', async () => {
    const { h, coordinator } = setupTurn();
    h.tracked.sdkHandle = { ...handleOf(h), listTurnOptions: async () => { throw new Error('boom'); } };
    await expect(coordinator.turnOptions(h.agentId)).resolves.toMatchObject({
      models: [], commands: [], error: 'Lane options could not be read.',
    });
  });
});
