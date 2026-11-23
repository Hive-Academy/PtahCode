import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import {
  AgentDeliveryStore,
  AgentMonitorStore,
  LaneTurnSettingsStore,
} from '@ptah-extension/chat-streaming';
import type { AgentDeliveryReceipt } from '@ptah-extension/shared';
import { ComposerAttachmentsService, type ComposerImage } from '../../../services/composer-attachments.service';
import { FilePickerService, type ChatFile } from '../../../services/file-picker.service';
import { LaneDeliveryController } from './lane-delivery.controller';

const AGENT = '00000000-0000-4000-8000-000000000001';
const OTHER_AGENT = '00000000-0000-4000-8000-000000000002';

const FILE: ChatFile = {
  path: '/workspace/src/app.ts', name: 'app.ts', size: 10, type: 'text', isLarge: false, tokenEstimate: 3,
};
const IMAGE: ComposerImage = {
  id: 'img-1', data: 'iVBORw0KGgo=', mediaType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'shot.png',
};

let receiptSeq = 0;
function receipt(overrides: Partial<AgentDeliveryReceipt> = {}): AgentDeliveryReceipt {
  return {
    id: `message-${++receiptSeq}`, agentId: AGENT, sender: 'user', state: 'accepted', delivery: 'queue',
    mode: 'queue-next-turn', createdAt: receiptSeq, updatedAt: receiptSeq, ...overrides,
  } as AgentDeliveryReceipt;
}

describe('LaneDeliveryController', () => {
  const receipts = signal<ReadonlyMap<string, readonly AgentDeliveryReceipt[]>>(new Map());
  const recovered = signal<ReadonlyMap<string, string>>(new Map());
  const agentsById = signal<ReadonlyMap<string, object>>(new Map());
  let keys = 0;
  const store = {
    receipts,
    recovered,
    agentsById,
    sendMessage: jest.fn(),
    cancelMessage: jest.fn(),
    previewMessage: jest.fn().mockResolvedValue(undefined),
    recoverQueuedMessage: jest.fn(),
    composerState: jest.fn(),
    receiptLabel: () => 'Queued',
    receiptStatus: (item: AgentDeliveryReceipt) => ({
      label: item.state === 'failed'
        ? `Not delivered: ${item.reason === 'turn-options-refused' ? 'lane refused the model or effort' : 'lane cannot take this attachment or command'}`
        : 'Queued',
    }),
    receipt: () => undefined,
    newIdempotencyKey: () => `key-${++keys}`,
    takeRecovered: (id: string) => {
      const text = recovered().get(id) ?? null;
      recovered.set(new Map());
      return text;
    },
  };

  let controller: LaneDeliveryController;
  let attachments: ComposerAttachmentsService;
  let settings: LaneTurnSettingsStore;
  let agentId: ReturnType<typeof signal<string>>;
  let draft: ReturnType<typeof signal<string>>;
  let accepted: jest.Mock;

  function push(...items: AgentDeliveryReceipt[]): void {
    receipts.set(new Map([[AGENT, items]]));
    TestBed.tick();
  }

  /** Put text, a file, an image and a model/effort pick into the composer. */
  function fillComposer(text = 'Hello'): void {
    draft.set(text);
    attachments.addFile(FILE);
    attachments.images.set([IMAGE]);
    settings.pickModel(AGENT, 'opus');
    settings.pickEffort(AGENT, 'high');
  }

  beforeEach(() => {
    jest.clearAllMocks();
    keys = 0;
    receipts.set(new Map());
    recovered.set(new Map());
    agentsById.set(new Map([[AGENT, {}], [OTHER_AGENT, {}]]));
    store.previewMessage.mockResolvedValue(undefined);
    store.composerState.mockReturnValue({
      queue: { supported: true, mode: 'queue-next-turn' }, now: { supported: true, mode: 'steer' },
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        LaneDeliveryController,
        ComposerAttachmentsService,
        LaneTurnSettingsStore,
        { provide: AgentMonitorStore, useValue: store },
        { provide: AgentDeliveryStore, useValue: store },
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        { provide: LoggingService, useValue: { warn: jest.fn() } },
        { provide: FilePickerService, useValue: { isFileSupported: (path: string) => path.endsWith('.ts') } },
      ],
    });
    controller = TestBed.inject(LaneDeliveryController);
    attachments = TestBed.inject(ComposerAttachmentsService);
    settings = TestBed.inject(LaneTurnSettingsStore);
    agentId = signal(AGENT);
    draft = signal('');
    accepted = jest.fn();
    controller.connect({
      agentId, draft, stopped: signal(false), cli: signal('Codex'), resumePath: signal(null), accepted,
    });
    TestBed.tick();
  });

  it('sends the draft with its attachments and pick, then clears the draft and the tray', async () => {
    const sent = receipt();
    store.sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt: sent });
    fillComposer();

    await controller.send('queue');

    expect(store.sendMessage).toHaveBeenCalledWith(AGENT, 'Hello', 'queue', false, 'key-1', {
      model: 'opus', reasoningEffort: 'high',
      images: [{ data: IMAGE.data, mediaType: 'image/png' }], files: [FILE.path],
    });
    expect(draft()).toBe('');
    expect(attachments.files()).toEqual([]);
    expect(attachments.images()).toEqual([]);
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it('sends a text-only message without a turn', async () => {
    store.sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt: receipt() });
    draft.set('Plain');
    await controller.send('queue');
    expect(store.sendMessage).toHaveBeenCalledWith(AGENT, 'Plain', 'queue', false, 'key-1', undefined);
  });

  it.each(['turn-options-refused', 'turn-input-unsupported'])(
    'restores text, images, files, model and effort when the receipt fails with %s at flush (Req 2.8)',
    async (reason) => {
      const sent = receipt();
      store.sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt: sent });
      fillComposer('Use the new model');
      await controller.send('queue');
      settings.clearPending(AGENT);
      draft.set('Typed meanwhile');

      push({ ...sent, state: 'failed', reason, lastError: 'Model opus is not offered by this lane', updatedAt: sent.updatedAt + 1 });

      expect(draft()).toBe('Typed meanwhile\nUse the new model');
      expect(attachments.files()).toEqual([FILE]);
      expect(attachments.images()).toEqual([IMAGE]);
      expect(settings.pending(AGENT)).toEqual({ model: 'opus', reasoningEffort: 'high' });
      expect(controller.error()).toContain('Not delivered:');
      expect(controller.error()).toContain('Model opus is not offered by this lane');
    },
  );

  it('keeps the draft, attachments and pick and shows the reason when the send is refused', async () => {
    store.sendMessage.mockResolvedValue({ mode: 'unsupported', detail: 'Lane cannot take images' });
    fillComposer();

    await controller.send('queue');

    expect(draft()).toBe('Hello');
    expect(attachments.files()).toEqual([FILE]);
    expect(attachments.images()).toEqual([IMAGE]);
    expect(settings.pending(AGENT)).toEqual({ model: 'opus', reasoningEffort: 'high' });
    expect(controller.error()).toBe('Lane cannot take images');
    expect(accepted).not.toHaveBeenCalled();
  });

  it('coalesces a new draft with the queued message and carries both snapshots', async () => {
    const earlier = receipt();
    store.sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: earlier });
    draft.set('First');
    attachments.addFile(FILE);
    await controller.send('queue');
    push(earlier);

    const combined = receipt();
    store.sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: combined });
    store.cancelMessage.mockResolvedValue({ ...earlier, state: 'cancelled', reason: 'cancelled-by-user' });
    draft.set('Second');
    attachments.images.set([IMAGE]);
    settings.pickEffort(AGENT, 'low');
    await controller.send('queue');

    expect(store.sendMessage).toHaveBeenLastCalledWith(AGENT, 'First\nSecond', 'queue', false, 'key-2', {
      reasoningEffort: 'low', images: [{ data: IMAGE.data, mediaType: 'image/png' }], files: [FILE.path],
    });
    expect(store.cancelMessage).toHaveBeenCalledWith(AGENT, earlier.id);

    // The earlier receipt never restores: the combined one carries its content.
    push({ ...earlier, state: 'failed', reason: 'cancelled-by-user', updatedAt: 99 });
    expect(draft()).toBe('');
    push({ ...combined, state: 'failed', reason: 'turn-input-unsupported', updatedAt: 100 });
    expect(draft()).toBe('First\nSecond');
    expect(attachments.files()).toEqual([FILE]);
    expect(attachments.images()).toEqual([IMAGE]);
  });

  it('withdraws a queued message into the composer with its snapshot', async () => {
    const queued = receipt();
    store.sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt: queued });
    fillComposer('Queued text');
    await controller.send('queue');
    settings.clearPending(AGENT);
    store.cancelMessage.mockResolvedValue({ ...queued, state: 'cancelled', reason: 'cancelled-by-user' });

    await controller.withdraw(queued.id);

    expect(store.recoverQueuedMessage).not.toHaveBeenCalled();
    expect(draft()).toBe('Queued text');
    expect(attachments.files()).toEqual([FILE]);
    expect(attachments.images()).toEqual([IMAGE]);
    expect(settings.pending(AGENT)).toEqual({ model: 'opus', reasoningEffort: 'high' });
  });

  it('reads the message and its turn back from the backend when Edit runs after a reload', async () => {
    const queued = receipt();
    store.recoverQueuedMessage.mockResolvedValue({
      text: 'From the host',
      turn: { model: 'sonnet', images: [{ data: 'R0lGOD==', mediaType: 'image/gif' }], files: ['C:\\repo\\notes.md'] },
    });
    store.cancelMessage.mockResolvedValue({ ...queued, state: 'cancelled', reason: 'cancelled-by-user' });

    await controller.withdraw(queued.id);

    expect(store.recoverQueuedMessage).toHaveBeenCalledWith(AGENT, queued.id);
    expect(draft()).toBe('From the host');
    expect(attachments.files()).toEqual([
      expect.objectContaining({ path: 'C:\\repo\\notes.md', name: 'notes.md', type: 'binary' }),
    ]);
    expect(attachments.images()).toEqual([
      expect.objectContaining({ data: 'R0lGOD==', mediaType: 'image/gif', dataUrl: 'data:image/gif;base64,R0lGOD==' }),
    ]);
    expect(settings.pending(AGENT)).toEqual({ model: 'sonnet' });
  });

  it('keeps the queued message when Edit cannot read it back', async () => {
    store.recoverQueuedMessage.mockRejectedValue(new Error('gone'));
    await controller.withdraw('message-unknown');
    expect(store.cancelMessage).not.toHaveBeenCalled();
    expect(controller.error()).toBe('Could not load the queued message to edit. Try again.');
    expect(controller.sending()).toBe(false);
  });

  it('reuses the idempotency key for an identical retry and not after the attachments change', async () => {
    store.sendMessage.mockRejectedValueOnce(new Error('transport')).mockRejectedValueOnce(new Error('transport'));
    fillComposer();
    await controller.send('queue');
    expect(controller.error()).toBe('Could not send your message. Try again.');
    await controller.send('queue');
    expect(store.sendMessage.mock.calls[1][4]).toBe(store.sendMessage.mock.calls[0][4]);

    store.sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: receipt() });
    attachments.remove(IMAGE.id);
    await controller.send('queue');
    expect(store.sendMessage.mock.calls[2][4]).not.toBe(store.sendMessage.mock.calls[0][4]);
  });

  it('treats a lane-at-limit hold as accepted and restores it if it later fails', async () => {
    const held = receipt({ state: 'blocked-retryable', reason: 'lane-at-limit' });
    store.sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt: held });
    fillComposer('Wait for reset');

    await controller.send('queue');

    expect(draft()).toBe('');
    expect(controller.error()).toBeNull();
    expect(accepted).toHaveBeenCalled();
    push({ ...held, state: 'expired', updatedAt: 50 });
    expect(draft()).toBe('Wait for reset');
    expect(attachments.files()).toEqual([FILE]);
  });

  it('puts recovered text from a Recover text action into the draft', () => {
    draft.set('Draft');
    recovered.set(new Map([[AGENT, 'Recovered']]));
    TestBed.tick();
    expect(draft()).toBe('Draft\nRecovered');
  });

  it('starts a switched lane from an empty draft and tray and loads its previews', () => {
    fillComposer();
    store.previewMessage.mockClear();
    agentId.set(OTHER_AGENT);
    TestBed.tick();
    expect(draft()).toBe('');
    expect(attachments.files()).toEqual([]);
    expect(attachments.images()).toEqual([]);
    expect(store.previewMessage).toHaveBeenCalledWith(OTHER_AGENT, 'queue');
    expect(store.previewMessage).toHaveBeenCalledWith(OTHER_AGENT, 'now');
  });

  it('describes both send modes once previews are ready and asks for confirmation before a lossy Send now', () => {
    expect(controller.hint()).toBe('Send: queued for next turn · Send now: steers into the running turn');
    store.composerState.mockReturnValue({
      queue: { supported: true, mode: 'queue-next-turn' },
      now: { supported: true, mode: 'interrupt-resume', lossDisclosure: { kind: 'partial-turn-work-lost', confirmationRequired: true, text: 'Lost' } },
    });
    agentId.set(OTHER_AGENT);
    TestBed.tick();
    expect(controller.nowNeedsConfirmation()).toBe(true);
    expect(controller.hint()).toContain('interrupts and restarts the turn');
  });
});
