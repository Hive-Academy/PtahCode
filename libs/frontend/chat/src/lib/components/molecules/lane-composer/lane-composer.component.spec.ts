import { provideZonelessChangeDetection, signal } from '@angular/core';

jest.mock('ngx-markdown', () => ({
  MarkdownModule: class MarkdownModule {},
  MarkdownComponent: class MarkdownComponent {},
  provideMarkdown: () => [],
  MARKED_OPTIONS: 'MARKED_OPTIONS',
  CLIPBOARD_OPTIONS: 'CLIPBOARD_OPTIONS',
  MARKED_EXTENSIONS: 'MARKED_EXTENSIONS',
  MERMAID_OPTIONS: 'MERMAID_OPTIONS',
  SANITIZE: 'SANITIZE',
}));
jest.mock('@floating-ui/dom', () => ({
  computePosition: jest.fn().mockResolvedValue({ x: 0, y: 0 }),
  autoUpdate: jest.fn().mockReturnValue(() => undefined),
  flip: jest.fn(),
  offset: jest.fn(),
  shift: jest.fn(),
  size: jest.fn(),
}));

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ClaudeRpcService,
  CommandDiscoveryFacade,
  LoggingService,
  VSCodeService,
} from '@ptah-extension/core';
import { rpcSuccess } from '@ptah-extension/core/testing';
import {
  AgentDeliveryStore,
  AgentMonitorStore,
  type RecoveredLaneMessage,
} from '@ptah-extension/chat-streaming';
import type { LaneTurnInputCapabilities } from '@ptah-extension/shared';
import { FilePickerService } from '../../../services/file-picker.service';
import { VoiceInputService } from '../../../services/voice-input.service';
import { ComposerInputController } from '../../../services/composer-input.controller';
import { ComposerAttachmentsService } from '../../../services/composer-attachments.service';
import { COMPOSER_TRIGGER_CACHE_ENABLED } from '../../../services/composer-trigger-scheduler';
import { LaneComposerComponent } from './lane-composer.component';

const agentId = '00000000-0000-4000-8000-000000000001';

function turnInput(overrides: Partial<LaneTurnInputCapabilities> = {}): LaneTurnInputCapabilities {
  return {
    model: { state: 'supported', appliesAt: 'next-turn' },
    effort: { state: 'supported', appliesAt: 'next-turn' },
    images: { state: 'supported' },
    files: { state: 'supported', delivery: 'reference' },
    commands: { state: 'supported' },
    skills: { state: 'supported' },
    ...overrides,
  };
}

function capabilities(input: LaneTurnInputCapabilities = turnInput()) {
  return {
    agentId, resolvedAt: 1, source: 'live-handle',
    messaging: {
      steer: { state: 'supported' }, interrupt: { state: 'supported' },
      continuation: { state: 'supported' }, resume: { state: 'supported' },
    },
    mcp: { state: 'unsupported' },
    turnInput: input,
    effectiveApproval: { mode: 'yolo', reason: 'The Codex lane runs with approvals off, so it never asks.' },
  };
}

type Preview = Record<string, unknown>;
function previews(queue: Preview = {}, now: Preview = {}, caps = capabilities()) {
  return {
    queue: { supported: true, mode: 'queue-next-turn', effectiveCapabilities: caps, ...queue },
    now: { supported: true, mode: 'steer', effectiveCapabilities: caps, ...now },
  };
}

describe('LaneComposerComponent', () => {
  const receipt = { id: 'message-1', agentId, sender: 'user', state: 'accepted',
    delivery: 'queue', mode: 'queue-next-turn', preview: 'Earlier text', createdAt: 1, updatedAt: 1 };
  const receipts = signal<ReadonlyMap<string, readonly typeof receipt[]>>(new Map());
  const recovered = signal<ReadonlyMap<string, RecoveredLaneMessage>>(new Map());
  const sendMessage = jest.fn();
  const cancelMessage = jest.fn();
  const previewMessage = jest.fn().mockResolvedValue(undefined);
  const recoverQueuedMessage = jest.fn();
  const rpcCall = jest.fn();
  let keys = 0;
  const store = {
    receipts, agentsById: signal(new Map<string, object>()), sendMessage, cancelMessage, previewMessage,
    recoverQueuedMessage, recovered,
    composerState: jest.fn(),
    receiptLabel: () => 'Queued',
    receiptStatus: (item: { state: string }) => ({ label: item.state === 'failed' ? 'Not delivered: lane stopped' : 'Queued' }),
    markRestored: jest.fn(),
    receipt: () => undefined,
    newIdempotencyKey: () => `key-${++keys}`,
    takeRecoveredMessage: (id: string) => {
      const message = recovered().get(id) ?? null;
      recovered.set(new Map());
      return message;
    },
  };
  const filePicker = {
    searchFiles: jest.fn(() => []),
    ensureFilesLoaded: jest.fn().mockResolvedValue(undefined),
    workspaceFiles: signal([]),
    searchFilesRemote: jest.fn(),
    clearRemoteResults: jest.fn(),
    remoteResults: signal([]),
    fetchError: signal(null),
    isFileSupported: () => true,
  };
  const voice = {
    state: signal('idle'), elapsedSeconds: signal(0), error: signal(null),
    isRecording: signal(false), isTranscribing: signal(false), isBusy: signal(false),
    startRecording: jest.fn(), stopRecording: jest.fn(), cancelRecording: jest.fn(),
  };

  beforeEach(() => {
    keys = 0;
    receipts.set(new Map());
    recovered.set(new Map());
    store.agentsById.set(new Map([[agentId, { status: 'running', cli: 'codex' }]]));
    sendMessage.mockReset();
    cancelMessage.mockReset();
    previewMessage.mockClear();
    recoverQueuedMessage.mockReset();
    store.composerState.mockReset().mockReturnValue(previews());
    rpcCall.mockReset().mockResolvedValue(rpcSuccess({
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }, { id: 'gpt-5.5-mini', name: 'GPT-5.5 mini' }],
      efforts: ['low', 'high'], currentModel: 'gpt-5.5', currentEffort: 'low',
      commands: [{ name: 'review', group: 'command' }, { name: 'plan', group: 'skill' }],
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LaneComposerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AgentMonitorStore, useValue: store },
        { provide: AgentDeliveryStore, useValue: store },
        { provide: ClaudeRpcService, useValue: { call: rpcCall } },
        { provide: LoggingService, useValue: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } },
        { provide: FilePickerService, useValue: filePicker },
        { provide: CommandDiscoveryFacade, useValue: { searchCommands: jest.fn(() => []), fetchCommands: jest.fn() } },
        { provide: VSCodeService, useValue: { isElectron: false, config: () => ({ workspaceRoot: '' }) } },
        { provide: COMPOSER_TRIGGER_CACHE_ENABLED, useValue: false },
      ],
    });
    TestBed.overrideComponent(LaneComposerComponent, {
      remove: { providers: [VoiceInputService] },
      add: { providers: [{ provide: VoiceInputService, useValue: voice }] },
    });
  });

  async function mount(inputs: Record<string, unknown> = {}): Promise<ComponentFixture<LaneComposerComponent>> {
    const fixture = TestBed.createComponent(LaneComposerComponent);
    fixture.componentRef.setInput('agentId', agentId);
    fixture.componentRef.setInput('laneLabel', 'Codex');
    fixture.componentRef.setInput('cli', 'Codex');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    // The lane options read resolves over a few microtasks.
    await settle(fixture);
    return fixture;
  }

  function root(fixture: ComponentFixture<LaneComposerComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function field(fixture: ComponentFixture<LaneComposerComponent>): HTMLTextAreaElement {
    return root(fixture).querySelector('textarea') as HTMLTextAreaElement;
  }
  function sendButton(fixture: ComponentFixture<LaneComposerComponent>): HTMLButtonElement {
    return root(fixture).querySelector('[data-testid="lane-send-btn"]') as HTMLButtonElement;
  }
  function type(fixture: ComponentFixture<LaneComposerComponent>, text: string): void {
    const textarea = field(fixture);
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  function statusText(fixture: ComponentFixture<LaneComposerComponent>): string {
    return root(fixture).querySelector('[data-testid="lane-status-line"] [aria-live="polite"]')?.textContent?.trim() ?? '';
  }
  async function settle(fixture: ComponentFixture<LaneComposerComponent>): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function clickSend(fixture: ComponentFixture<LaneComposerComponent>): Promise<void> {
    sendButton(fixture).click();
    await settle(fixture);
  }
  function key(fixture: ComponentFixture<LaneComposerComponent>, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true, ...init });
    field(fixture).dispatchEvent(event);
    return event;
  }

  it('renders main chat card, labelled field, aria-live hint and the resume path', async () => {
    store.composerState.mockReturnValue(previews({ usesResume: true }, { supported: false, mode: 'unsupported' }));
    const fixture = await mount({ stopped: true, resumePath: 'Resume CLI session 01a1bc68' });
    const card = root(fixture).querySelector('[data-glass-surface="tile"]') as HTMLElement;
    expect(card.querySelector('textarea')).not.toBeNull();
    const label = root(fixture).querySelector('label') as HTMLLabelElement;
    expect(label.textContent?.trim()).toBe('Message Codex');
    expect(field(fixture).id).toBe(label.htmlFor);
    expect(field(fixture).placeholder).toBe('Resume Codex with a message…');
    expect(field(fixture).getAttribute('style')).toContain('field-sizing: content');
    expect(field(fixture).getAttribute('rows')).toBe('2');
    const send = card.querySelectorAll('button[aria-label="Resume with message"]');
    expect(send).toHaveLength(1);
    expect(send[0].textContent?.trim()).toBe('');
    const live = root(fixture).querySelector('[data-testid="lane-status-line"] [aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toContain('Resume CLI session 01a1bc68');
    expect(live.getAttribute('title')).toContain('Resume CLI session 01a1bc68');
    expect(root(fixture).querySelector('[aria-label="Send options"]')).toBeNull();
  });

  it('shows the per-mode hint and the placeholder of a running lane', async () => {
    const fixture = await mount();
    expect(field(fixture).placeholder).toBe('Message Codex...');
    expect(statusText(fixture)).toBe('Send: queued for next turn · Send now: steers into the running turn');
  });

  it('sends on Enter, keeps Shift+Enter for a newline, ignores IME composition, and disables empty send', async () => {
    sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt });
    const fixture = await mount();
    expect(sendButton(fixture).disabled).toBe(true);
    type(fixture, 'Hello');
    expect(sendButton(fixture).disabled).toBe(false);
    expect(key(fixture, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(key(fixture, { isComposing: true }).defaultPrevented).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    const enter = key(fixture, {});
    await settle(fixture);
    expect(enter.defaultPrevented).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(agentId, 'Hello', 'queue', false, expect.any(String), undefined);
    expect(field(fixture).value).toBe('');
  });

  it('sends now on Ctrl+Enter and Cmd+Enter when the lane steers', async () => {
    sendMessage.mockResolvedValue({ mode: 'steer', receipt: { ...receipt, state: 'started', delivery: 'now' } });
    const fixture = await mount();
    type(fixture, 'Steer this');
    key(fixture, { ctrlKey: true });
    await settle(fixture);
    expect(sendMessage).toHaveBeenLastCalledWith(agentId, 'Steer this', 'now', false, expect.any(String), undefined);
    expect(statusText(fixture)).toBe('Sent. It joined the running turn.');
    type(fixture, 'Again');
    key(fixture, { metaKey: true });
    await settle(fixture);
    expect(sendMessage).toHaveBeenLastCalledWith(agentId, 'Again', 'now', false, expect.any(String), undefined);
  });

  it('refuses Ctrl+Enter while an attachment is still being read (M1)', async () => {
    sendMessage.mockResolvedValue({ mode: 'steer', receipt: { ...receipt, state: 'started', delivery: 'now' } });
    const fixture = await mount();
    const attachments = fixture.componentRef.injector.get(ComposerAttachmentsService);
    type(fixture, 'With an image');
    attachments.pendingReads.set(1);
    key(fixture, { ctrlKey: true });
    await settle(fixture);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(statusText(fixture)).toBe('An attachment is still loading. Send when it appears in the tray.');

    attachments.pendingReads.set(0);
    key(fixture, { ctrlKey: true });
    await settle(fixture);
    expect(sendMessage).toHaveBeenLastCalledWith(agentId, 'With an image', 'now', false, expect.any(String), undefined);
  });

  it('withdraws a queued message back into the composer beside the draft', async () => {
    sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt });
    cancelMessage.mockResolvedValue({ ...receipt, state: 'failed', reason: 'cancelled-by-user' });
    const fixture = await mount();
    type(fixture, 'Earlier text');
    await clickSend(fixture);
    expect(sendMessage).toHaveBeenCalled();
    receipts.set(new Map([[agentId, [receipt]]]));
    fixture.detectChanges();
    const queued = root(fixture).querySelector('[data-testid="queued-follow-up-item"]') as HTMLElement;
    expect(queued.textContent).toContain('Queued for the next turn');
    type(fixture, 'New thought');
    (root(fixture).querySelector('[aria-label="Withdraw: Earlier text"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(field(fixture).value).toBe('New thought\nEarlier text');
  });

  it('restores text and shows the reason after an accepted message fails', async () => {
    sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt });
    const fixture = await mount();
    type(fixture, 'Earlier text');
    await clickSend(fixture);
    receipts.set(new Map([[agentId, [{ ...receipt, state: 'failed', reason: 'agent_stopped', updatedAt: 2 }]]]));
    fixture.detectChanges();
    await settle(fixture);
    expect(field(fixture).value).toBe('Earlier text');
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('stopped');
  });

  it('recovers accepted text after the composer is remounted', async () => {
    sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt: { ...receipt, id: 'remount-receipt' } });
    const first = await mount();
    type(first, 'Recover after tab switch');
    await clickSend(first);
    first.destroy();
    receipts.set(new Map([[agentId, [{ ...receipt, id: 'remount-receipt', state: 'expired', updatedAt: 2 }]]]));
    const second = await mount();
    expect(field(second).value).toBe('Recover after tab switch');
  });

  it('starts from an empty draft when the lane changes', async () => {
    const fixture = await mount();
    type(fixture, 'Draft for lane one');
    store.agentsById.set(new Map([[agentId, { status: 'running' }], ['lane-2', { status: 'running' }]]));
    fixture.componentRef.setInput('agentId', 'lane-2');
    fixture.detectChanges();
    await settle(fixture);
    expect(field(fixture).value).toBe('');
  });

  it('keeps the draft and shows an error when an outcome has no receipt', async () => {
    sendMessage.mockResolvedValue({ mode: 'queue-next-turn' });
    const fixture = await mount();
    type(fixture, 'Keep this');
    await clickSend(fixture);
    expect(field(fixture).value).toBe('Keep this');
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('No message receipt');
  });

  it('offers no Withdraw for a parent-sent receipt and names its sender', async () => {
    receipts.set(new Map([[agentId, [{ ...receipt, sender: 'parent' }]]]));
    const fixture = await mount();
    expect(root(fixture).querySelector('[data-testid="queued-withdraw"]')).toBeNull();
    expect(root(fixture).querySelector('[data-testid="queued-sender-note"]')?.textContent).toContain('Sent by the parent session');
  });

  it('coalesces a new draft with an accepted queued message', async () => {
    sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt })
      .mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: { ...receipt, id: 'message-2', updatedAt: 3 } });
    cancelMessage.mockResolvedValue({ ...receipt, state: 'failed', reason: 'cancelled-by-user', updatedAt: 2 });
    const fixture = await mount();
    type(fixture, 'Earlier text');
    await clickSend(fixture);
    receipts.set(new Map([[agentId, [receipt]]]));
    fixture.detectChanges();
    type(fixture, 'New thought');
    await clickSend(fixture);
    expect(sendMessage).toHaveBeenLastCalledWith(agentId, 'Earlier text\nNew thought', 'queue', false, expect.any(String), undefined);
    // The earlier message leaves the queue before the combined one is sent.
    expect(cancelMessage.mock.invocationCallOrder[0]).toBeLessThan(sendMessage.mock.invocationCallOrder[1]);
  });

  it('does not restore coalesced text when the cancel push arrives before the cancel RPC resolves', async () => {
    sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt })
      .mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: { ...receipt, id: 'message-2', updatedAt: 3 } });
    const cancelledPush = { ...receipt, state: 'failed', reason: 'cancelled-by-user', updatedAt: 4 };
    const fixture = await mount();
    cancelMessage.mockImplementation(async () => {
      receipts.set(new Map([[agentId, [cancelledPush]]]));
      fixture.detectChanges();
      return cancelledPush;
    });
    type(fixture, 'Earlier text');
    await clickSend(fixture);
    receipts.set(new Map([[agentId, [receipt]]]));
    fixture.detectChanges();
    type(fixture, 'New thought');
    await clickSend(fixture);
    expect(cancelMessage).toHaveBeenCalledWith(agentId, 'message-1');
    expect(field(fixture).value).toBe('');
    expect(root(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('puts the earlier message back in front of the new draft when a combined send is refused', async () => {
    sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt })
      .mockResolvedValueOnce({ mode: 'unsupported', detail: 'Lane is unavailable' });
    cancelMessage.mockResolvedValue({ ...receipt, state: 'cancelled', reason: 'cancelled-by-user', updatedAt: 2 });
    const fixture = await mount();
    type(fixture, 'Earlier text');
    await clickSend(fixture);
    receipts.set(new Map([[agentId, [receipt]]]));
    fixture.detectChanges();
    type(fixture, 'New thought');
    await clickSend(fixture);
    expect(sendMessage).toHaveBeenLastCalledWith(agentId, 'Earlier text\nNew thought', 'queue', false, expect.any(String), undefined);
    expect(cancelMessage).toHaveBeenCalledWith(agentId, 'message-1');
    expect(field(fixture).value).toBe('Earlier text\nNew thought');
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('Lane is unavailable');
  });

  it('treats a lane-at-limit hold as accepted and uses a fresh idempotency key on a later send', async () => {
    const held = { ...receipt, id: 'message-2', state: 'blocked-retryable', mode: 'unsupported', reason: 'lane-at-limit', updatedAt: 3 };
    sendMessage
      .mockResolvedValueOnce({ mode: 'queue-next-turn', receipt })
      .mockResolvedValueOnce({ mode: 'unsupported', detail: 'lane-at-limit', reasonCode: 'lane-at-limit', receipt: held })
      .mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: { ...receipt, id: 'message-3', updatedAt: 5 } });
    cancelMessage.mockResolvedValue({ ...receipt, state: 'failed', reason: 'cancelled-by-user', updatedAt: 4 });
    const fixture = await mount();
    type(fixture, 'Earlier text');
    await clickSend(fixture);
    receipts.set(new Map([[agentId, [receipt]]]));
    fixture.detectChanges();
    type(fixture, 'New thought');
    await clickSend(fixture);
    expect(sendMessage).toHaveBeenNthCalledWith(2, agentId, 'Earlier text\nNew thought', 'queue', false, expect.any(String), undefined);
    expect(cancelMessage).toHaveBeenCalledWith(agentId, 'message-1');
    expect(field(fixture).value).toBe('');
    expect(root(fixture).querySelector('[role="alert"]')).toBeNull();
    receipts.set(new Map([[agentId, []]]));
    fixture.detectChanges();
    type(fixture, 'Earlier text\nNew thought');
    await clickSend(fixture);
    expect(sendMessage.mock.calls[2][4]).not.toBe(sendMessage.mock.calls[1][4]);
  });

  it('refreshes previews on focus and on a lane status change, and ignores unrelated updates', async () => {
    const fixture = await mount();
    previewMessage.mockClear();
    field(fixture).dispatchEvent(new Event('focus'));
    expect(previewMessage).toHaveBeenCalledTimes(2);
    previewMessage.mockClear();
    for (let index = 0; index < 10; index++) {
      store.agentsById.set(new Map([[agentId, { status: 'running' }], [`other-${index}`, { status: 'running' }]]));
      fixture.detectChanges();
    }
    expect(previewMessage).not.toHaveBeenCalled();
    store.agentsById.set(new Map([[agentId, { status: 'stopped' }]]));
    fixture.detectChanges();
    expect(previewMessage.mock.calls.map((call) => call[1])).toEqual(['queue', 'now']);
  });

  describe('turn-loss confirmation', () => {
    const lossy = () => previews({}, {
      mode: 'interrupt-resume', lossDisclosure: { kind: 'partial-turn-work-lost', confirmationRequired: true, text: 'Partial work will be lost.' },
    });

    it('opens on Ctrl+Enter with the backend text, focuses it, makes the field read-only, traps Tab and returns focus on Escape', async () => {
      store.composerState.mockReturnValue(lossy());
      const fixture = await mount();
      document.body.appendChild(fixture.nativeElement);
      type(fixture, 'Now');
      key(fixture, { ctrlKey: true });
      fixture.detectChanges();
      await settle(fixture);
      const dialog = root(fixture).querySelector('[role="alertdialog"]') as HTMLElement;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.textContent).toContain('Interrupt this turn?');
      expect(dialog.textContent).toContain('Partial work will be lost.');
      expect(field(fixture).readOnly).toBe(true);
      const [confirm, keep] = Array.from(dialog.querySelectorAll('button'));
      expect(confirm.textContent?.trim()).toBe('Interrupt & send');
      expect(keep.textContent?.trim()).toBe('Keep current turn');
      expect(document.activeElement).toBe(confirm);
      keep.focus();
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      keep.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(confirm);
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(root(fixture).querySelector('[role="alertdialog"]')).toBeNull();
      expect(document.activeElement).toBe(field(fixture));
      expect(field(fixture).readOnly).toBe(false);
      expect(sendMessage).not.toHaveBeenCalled();
      fixture.nativeElement.remove();
    });

    it('makes the background inert and keeps the draft as the target while the dialog is open', async () => {
      store.composerState.mockReturnValue(lossy());
      receipts.set(new Map([[agentId, [receipt]]]));
      sendMessage.mockResolvedValue({ mode: 'interrupt-resume', receipt: { ...receipt, id: 'now-1', state: 'started', delivery: 'now' } });
      const fixture = await mount();
      type(fixture, 'Draft text');
      key(fixture, { ctrlKey: true });
      fixture.detectChanges();
      const stage = root(fixture).querySelector('.ptah-composer-stage') as HTMLElement;
      const queued = root(fixture).querySelector('ptah-queued-message-list') as HTMLElement;
      expect(stage.hasAttribute('inert')).toBe(true);
      expect(queued.hasAttribute('inert')).toBe(true);
      // jsdom does not enforce inert, so a click that still lands must not retarget the dialog.
      (root(fixture).querySelector('[data-testid="queued-follow-up-send-now"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (root(fixture).querySelector('[role="alertdialog"] button.btn-warning') as HTMLButtonElement).click();
      await settle(fixture);
      expect(cancelMessage).not.toHaveBeenCalled();
      expect(sendMessage).toHaveBeenCalledWith(agentId, 'Draft text', 'now', true, expect.any(String), undefined);
      expect(stage.hasAttribute('inert')).toBe(false);
      expect(queued.hasAttribute('inert')).toBe(false);
    });

    it('closes on Keep current turn without sending', async () => {
      store.composerState.mockReturnValue(lossy());
      const fixture = await mount();
      type(fixture, 'Now');
      key(fixture, { ctrlKey: true });
      fixture.detectChanges();
      const keep = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'))
        .find((button) => button.textContent?.trim() === 'Keep current turn') as HTMLButtonElement;
      keep.click();
      fixture.detectChanges();
      expect(root(fixture).querySelector('[role="alertdialog"]')).toBeNull();
      expect(field(fixture).value).toBe('Now');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('uses its own text when the backend gives none', async () => {
      store.composerState.mockReturnValue(previews({}, {
        mode: 'interrupt-resume', lossDisclosure: { kind: 'partial-turn-work-lost', confirmationRequired: true },
      }));
      const fixture = await mount();
      type(fixture, 'Now');
      key(fixture, { ctrlKey: true });
      fixture.detectChanges();
      expect(root(fixture).querySelector('[role="alertdialog"]')?.textContent)
        .toContain('Work this turn has not finished will be discarded. Codex keeps the conversation');
    });

    it('passes turn-loss consent only after the confirmation', async () => {
      store.composerState.mockReturnValue(lossy());
      sendMessage.mockResolvedValue({ mode: 'interrupt-resume', receipt: { ...receipt, state: 'started', delivery: 'now' } });
      const fixture = await mount();
      type(fixture, 'Now');
      key(fixture, { ctrlKey: true });
      fixture.detectChanges();
      expect(sendMessage).not.toHaveBeenCalled();
      (root(fixture).querySelector('[role="alertdialog"] button.btn-warning') as HTMLButtonElement).click();
      await settle(fixture);
      expect(sendMessage).toHaveBeenCalledWith(agentId, 'Now', 'now', true, expect.any(String), undefined);
      expect(statusText(fixture)).toBe('Turn ended. Same session. Your message starts the next turn.');
    });

    it('confirms before the queued card interrupts the turn for a queued message', async () => {
      store.composerState.mockReturnValue(lossy());
      receipts.set(new Map([[agentId, [receipt]]]));
      recoverQueuedMessage.mockResolvedValue({ text: 'Earlier text' });
      cancelMessage.mockResolvedValue({ ...receipt, state: 'cancelled', reason: 'cancelled-by-user' });
      sendMessage.mockResolvedValue({ mode: 'interrupt-resume', receipt: { ...receipt, id: 'now-1', state: 'started', delivery: 'now' } });
      const fixture = await mount();
      const sendNow = root(fixture).querySelector('[data-testid="queued-follow-up-send-now"]') as HTMLButtonElement;
      expect(sendNow.textContent?.trim()).toBe('Interrupt & send');
      sendNow.click();
      fixture.detectChanges();
      expect(cancelMessage).not.toHaveBeenCalled();
      (root(fixture).querySelector('[role="alertdialog"] button.btn-warning') as HTMLButtonElement).click();
      await settle(fixture);
      expect(cancelMessage).toHaveBeenCalledWith(agentId, 'message-1');
      expect(sendMessage).toHaveBeenCalledWith(agentId, 'Earlier text', 'now', true, expect.any(String), undefined);
    });
  });

  it('sends a queued message now from the queued card when the lane steers', async () => {
    receipts.set(new Map([[agentId, [receipt]]]));
    recoverQueuedMessage.mockResolvedValue({ text: 'Earlier text' });
    cancelMessage.mockResolvedValue({ ...receipt, state: 'cancelled', reason: 'cancelled-by-user' });
    sendMessage.mockResolvedValue({ mode: 'steer', receipt: { ...receipt, id: 'now-1', state: 'started', delivery: 'now' } });
    const fixture = await mount();
    const sendNow = root(fixture).querySelector('[data-testid="queued-follow-up-send-now"]') as HTMLButtonElement;
    expect(sendNow.textContent?.trim()).toBe('Send now');
    sendNow.click();
    await settle(fixture);
    expect(sendMessage).toHaveBeenCalledWith(agentId, 'Earlier text', 'now', false, expect.any(String), undefined);
  });

  it('shows Send now aria-disabled with its reason when the lane has none', async () => {
    store.composerState.mockReturnValue({
      ...previews({}, { supported: false, mode: 'unsupported', reason: 'Copilot starts a new process for every turn.' }),
      nowDisabledReason: 'Copilot starts a new process for every turn.',
    });
    receipts.set(new Map([[agentId, [receipt]]]));
    const fixture = await mount();
    const sendNow = root(fixture).querySelector('[data-testid="queued-follow-up-send-now"]') as HTMLButtonElement;
    expect(sendNow.getAttribute('aria-disabled')).toBe('true');
    expect(root(fixture).querySelector('[data-testid="queued-send-now-reason"]')?.textContent)
      .toContain('Copilot starts a new process for every turn.');
  });

  it('reads the message back from the backend when Withdraw runs after a reload', async () => {
    recoverQueuedMessage.mockResolvedValue({ text: 'Text from before the reload' });
    const reloaded = { ...receipt, id: 'reload-1', preview: 'Before reload' };
    cancelMessage.mockResolvedValue({ ...reloaded, state: 'cancelled', reason: 'cancelled-by-user' });
    receipts.set(new Map([[agentId, [reloaded]]]));
    const fixture = await mount();
    (root(fixture).querySelector('[aria-label="Withdraw: Before reload"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(recoverQueuedMessage).toHaveBeenCalledWith(agentId, 'reload-1');
    expect(recoverQueuedMessage.mock.invocationCallOrder[0]).toBeLessThan(cancelMessage.mock.invocationCallOrder[0]);
    expect(field(fixture).value).toBe('Text from before the reload');
  });

  it('keeps the queued message when Withdraw cannot read it back, and allows a retry', async () => {
    recoverQueuedMessage.mockRejectedValueOnce(new Error('transport down')).mockResolvedValueOnce({ text: 'Text on retry' });
    const reloaded = { ...receipt, id: 'reload-2', preview: 'Unreadable' };
    cancelMessage.mockResolvedValue({ ...reloaded, state: 'cancelled', reason: 'cancelled-by-user' });
    receipts.set(new Map([[agentId, [reloaded]]]));
    const fixture = await mount();
    const withdraw = (): HTMLButtonElement => root(fixture).querySelector('[aria-label="Withdraw: Unreadable"]') as HTMLButtonElement;
    withdraw().click();
    await settle(fixture);
    expect(cancelMessage).not.toHaveBeenCalled();
    expect(root(fixture).textContent).toContain('Could not load the queued message to edit. Try again.');
    expect(withdraw().disabled).toBe(false);
    withdraw().click();
    await settle(fixture);
    expect(cancelMessage).toHaveBeenCalledWith(agentId, 'reload-2');
    expect(field(fixture).value).toBe('Text on retry');
  });

  it('puts a recovered message from a Recover text action into the draft', async () => {
    const fixture = await mount();
    recovered.set(new Map([[agentId, { text: 'Recovered body' }]]));
    fixture.detectChanges();
    expect(field(fixture).value).toBe('Recovered body');
  });

  it('reuses the idempotency key when the same submission is retried after a transport failure', async () => {
    sendMessage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ mode: 'queue-next-turn', receipt });
    const fixture = await mount();
    type(fixture, 'Same text');
    await clickSend(fixture);
    await clickSend(fixture);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0][4]).toBe(sendMessage.mock.calls[1][4]);
    type(fixture, 'Different text');
    sendMessage.mockResolvedValueOnce({ mode: 'queue-next-turn', receipt: { ...receipt, id: 'message-3' } });
    await clickSend(fixture);
    expect(sendMessage.mock.calls[2][4]).not.toBe(sendMessage.mock.calls[0][4]);
  });

  it('shows "Checking lane options…" with gated controls aria-disabled and Send disabled', async () => {
    store.composerState.mockReturnValue({});
    const fixture = await mount();
    type(fixture, 'Waiting');
    const chip = root(fixture).querySelector('[data-testid="lane-approval-chip"]') as HTMLElement;
    expect(chip.textContent).toContain('Checking');
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(root(fixture).querySelector('ptah-composer-model-picker [aria-disabled="true"]')).not.toBeNull();
    expect(root(fixture).querySelector('ptah-composer-effort-picker [aria-disabled="true"]')).not.toBeNull();
    expect(sendButton(fixture).disabled).toBe(true);
    expect(statusText(fixture)).toBe('Checking lane options…');
    expect(root(fixture).querySelector('[data-testid="lane-limited-badge"]')).toBeNull();
  });

  it('keeps an image the lane cannot take in the tray as "Can\'t send", disables Send and gives the reason', async () => {
    store.composerState.mockReturnValue(previews({}, {}, capabilities(turnInput({
      images: { state: 'unsupported', reason: 'Image input is not confirmed for the Copilot lane.' },
    }))));
    const fixture = await mount({ cli: 'Copilot' });
    type(fixture, 'Look at this');
    fixture.componentRef.injector.get(ComposerAttachmentsService).images.set([
      { id: 'img-1', data: 'aGk=', mediaType: 'image/png', dataUrl: 'data:image/png;base64,aGk=', name: 'shot.png' },
    ]);
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-testid="attachment-image-blocked"]')?.textContent).toBe("Can't send");
    expect(sendButton(fixture).disabled).toBe(true);
    // The lane's own reason, not a generic "{CLI} lanes cannot take images" (L3).
    expect(statusText(fixture)).toBe('Image input is not confirmed for the Copilot lane. Remove the image to send.');
    key(fixture, {});
    await settle(fixture);
    expect(sendMessage).not.toHaveBeenCalled();
    const badge = root(fixture).querySelector('[data-testid="lane-limited-badge"]') as HTMLElement;
    expect(badge.getAttribute('title')).toContain('Image input is not confirmed for the Copilot lane.');
  });

  it('gates model and effort with the backend reason and reveals it on the status line', async () => {
    store.composerState.mockReturnValue(previews({}, {}, capabilities(turnInput({
      model: { state: 'unsupported', reason: 'Model is set at spawn for this lane.' },
    }))));
    const fixture = await mount();
    const pill = root(fixture).querySelector('ptah-composer-model-picker [aria-disabled="true"]') as HTMLElement;
    expect(pill.getAttribute('title')).toBe('Model is set at spawn for this lane.');
    pill.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(statusText(fixture)).toBe('Model is set at spawn for this lane.');
    expect(root(fixture).querySelector('ptah-composer-effort-picker [aria-disabled="true"]')).toBeNull();
    const chip = root(fixture).querySelector('[data-testid="lane-approval-chip"]') as HTMLElement;
    expect(chip.textContent).toContain('Auto');
  });

  it('replaces the preview error with "Could not load lane options." and Retry', async () => {
    store.composerState.mockReturnValue({});
    previewMessage.mockRejectedValue(new Error('offline'));
    const fixture = await mount();
    await settle(fixture);
    const alert = root(fixture).querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Could not load lane options.');
    expect(root(fixture).querySelector('[data-testid="lane-approval-chip"]')?.textContent).toContain('Unknown');
    previewMessage.mockClear().mockResolvedValue(undefined);
    const retry = Array.from(alert.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Retry') as HTMLButtonElement;
    retry.click();
    expect(previewMessage.mock.calls.map((call) => call[1])).toEqual(['queue', 'now']);
  });

  it('uses the main chat card classes, so the textarea draws no ring and the card frames focus (S2)', async () => {
    const fixture = await mount();
    const card = field(fixture).closest('[data-glass-surface="tile"]') as HTMLElement;
    expect(card.classList).toContain('chat-composer-card');
    expect(card.classList).toContain('chat-composer-column');
    expect(field(fixture).classList).toContain('focus:outline-none');
    const line = root(fixture).querySelector('[data-testid="lane-status-line"]') as HTMLElement;
    expect(line.getAttribute('data-glass-surface')).toBe('plate');
  });

  it('keeps one model label: the record model as a catalog row, never the dated or multi-model id (M1)', async () => {
    store.agentsById.set(new Map([[agentId, {
      status: 'running', cli: 'codex', model: 'gpt-5.5-mini-20261001', observedModel: 'mixed-model',
    }]]));
    const fixture = await mount();
    const pill = root(fixture).querySelector('[data-testid="composer-model-pill"]') as HTMLElement;
    expect(pill.textContent).toContain('GPT-5.5 mini');
    expect(pill.textContent).not.toContain('mixed-model');
    const component = fixture.componentInstance as unknown as { selectedModel(): string | null };
    expect(component.selectedModel()).toBe('gpt-5.5-mini');
  });

  it('prefers the record model over a lagging observed model (M1)', async () => {
    store.agentsById.set(new Map([[agentId, {
      status: 'running', cli: 'codex', model: 'gpt-5.5-mini', observedModel: 'gpt-5.5',
    }]]));
    const fixture = await mount();
    const component = fixture.componentInstance as unknown as { selectedModel(): string | null };
    expect(component.selectedModel()).toBe('gpt-5.5-mini');
  });

  it('names the pill while no model is known instead of leaving it blank (M2)', async () => {
    rpcCall.mockResolvedValue(rpcSuccess({ models: [], efforts: [], commands: [] }));
    const fixture = await mount();
    const pill = root(fixture).querySelector('[data-testid="composer-model-pill"]') as HTMLElement;
    expect(pill.textContent).toContain('Codex default');
  });

  it('says the pick applies when the stopped lane resumes (M4)', async () => {
    const fixture = await mount({ stopped: true });
    const component = fixture.componentInstance as unknown as { settingFooter(): string };
    expect(component.settingFooter()).toBe('Applies from your next message, which resumes the lane.');
  });

  it('drops the last send note when the lane starts or ends a run (M3)', async () => {
    const fixture = await mount();
    const component = fixture.componentInstance as unknown as { pickModel(id: string): void };
    component.pickModel('gpt-5.5-mini');
    fixture.detectChanges();
    expect(statusText(fixture)).toContain('Model set to GPT-5.5 mini.');
    fixture.componentRef.setInput('stopped', true);
    await settle(fixture);
    expect(statusText(fixture)).not.toContain('Model set to');
  });

  it('notes a model pick on the status line and sends it with the next message', async () => {
    sendMessage.mockResolvedValue({ mode: 'queue-next-turn', receipt });
    const fixture = await mount();
    const component = fixture.componentInstance as unknown as { pickModel(id: string): void };
    component.pickModel('gpt-5.5-mini');
    fixture.detectChanges();
    expect(statusText(fixture)).toBe('Model set to GPT-5.5 mini. Applies from your next message. The lane keeps running.');
    type(fixture, 'Use the small one');
    await clickSend(fixture);
    expect(sendMessage).toHaveBeenCalledWith(agentId, 'Use the small one', 'queue', false, expect.any(String), { model: 'gpt-5.5-mini' });
  });

  it('says in the @ list footer that chosen files are sent as file references', async () => {
    const fixture = await mount({ stopped: true });
    const input = fixture.componentRef.injector.get(ComposerInputController);
    type(fixture, '@');
    input.handleAtActivated({ triggerPosition: 0, query: '' } as Parameters<typeof input.handleAtActivated>[0]);
    fixture.detectChanges();
    await settle(fixture);
    expect(root(fixture).querySelector('[data-testid="suggestions-footer"]')?.textContent?.trim())
      .toBe('Chosen files are sent as file references.');
  });

  it('disables Send past the host image limit and says how many to remove (M2)', async () => {
    store.composerState.mockReturnValue(previews({}, {}, capabilities(turnInput({
      images: { state: 'supported', onSteer: true },
    }))));
    const fixture = await mount();
    type(fixture, 'Many shots');
    fixture.componentRef.injector.get(ComposerAttachmentsService).images.set(
      Array.from({ length: 10 }, (_, index) => ({
        id: `img-${index}`, data: 'aGk=', mediaType: 'image/png', dataUrl: 'data:image/png;base64,aGk=', name: `s${index}.png`,
      })),
    );
    fixture.detectChanges();
    expect(sendButton(fixture).disabled).toBe(true);
    expect(statusText(fixture)).toBe('A lane message takes at most 8 images. Remove 2 to send.');
    key(fixture, {});
    await settle(fixture);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('gives the host reason, not "no effort levels", for a stopped lane with no cached catalog (S2)', async () => {
    rpcCall.mockReset().mockResolvedValue(rpcSuccess({
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }], efforts: [], commands: [],
      unavailableReason: 'Effort levels, commands and skills appear when the lane is running.',
    }));
    const fixture = await mount({ stopped: true });
    const pill = root(fixture).querySelector('ptah-composer-effort-picker [aria-disabled="true"]') as HTMLElement;
    expect(pill.getAttribute('title')).toBe('Effort levels, commands and skills appear when the lane is running.');
  });

  it('shows the cached lists with a stale notice when the host answers with an error beside them (M5)', async () => {
    rpcCall.mockReset().mockResolvedValue(rpcSuccess({
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }], efforts: ['low'], commands: [],
      error: 'Lane options could not be read.',
    }));
    const fixture = await mount();
    expect(root(fixture).querySelector('[role="alert"]')).toBeNull();
    expect(root(fixture).querySelector('[data-testid="lane-options-stale"]')?.textContent)
      .toContain('Showing the last known lane options. The latest read failed.');
    expect(root(fixture).querySelector('ptah-composer-effort-picker [aria-disabled="true"]')).toBeNull();
  });

  it('shows the lane files reason in the @ list and offers no file (minor)', async () => {
    store.composerState.mockReturnValue(previews({}, {}, capabilities(turnInput({
      files: { state: 'unsupported', reason: 'This lane takes no files.' },
    }))));
    const fixture = await mount();
    const input = fixture.componentRef.injector.get(ComposerInputController);
    type(fixture, '@');
    input.handleAtActivated({ triggerPosition: 0, query: '' } as Parameters<typeof input.handleAtActivated>[0]);
    fixture.detectChanges();
    await settle(fixture);
    expect(input.suggestionNotice()).toBe('This lane takes no files.');
    expect(input.filteredSuggestions()).toEqual([]);
  });

  it('folds into the compact bar while the lane runs idle and expands on click', async () => {
    const fixture = await mount({ showLaneControls: true });
    const stage = root(fixture).querySelector('.ptah-composer-stage') as HTMLElement;
    expect(stage.hasAttribute('data-compact')).toBe(true);
    const bar = root(fixture).querySelector('ptah-composer-compact-bar') as HTMLElement;
    expect(bar.textContent).toContain('Codex is working…');
    expect(root(fixture).querySelectorAll('[aria-label="Stop generating"]')).toHaveLength(1);
    (bar.querySelector('button[aria-expanded]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(stage.hasAttribute('data-compact')).toBe(false);
    expect(root(fixture).querySelector('[data-testid="lane-stop-btn"]')).not.toBeNull();
  });

  it('puts Stop in the toolbar while running and Resume session once stopped', async () => {
    const fixture = await mount({ showLaneControls: true });
    type(fixture, 'keep it open');
    const stopped = jest.fn();
    fixture.componentInstance.stopRequested.subscribe(stopped);
    (root(fixture).querySelector('[data-testid="lane-stop-btn"]') as HTMLButtonElement).click();
    expect(stopped).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('stopped', true);
    fixture.componentRef.setInput('resumable', true);
    fixture.detectChanges();
    const resume = root(fixture).querySelector('[data-testid="lane-resume-btn"]') as HTMLButtonElement;
    expect(resume.getAttribute('aria-label')).toBe('Resume Codex session');
    expect(resume.title).toBe('Resume session');
  });
});
