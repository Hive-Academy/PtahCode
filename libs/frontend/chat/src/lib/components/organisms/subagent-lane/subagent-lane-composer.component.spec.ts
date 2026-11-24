import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { SubagentRecord } from '@ptah-extension/chat-streaming';
import {
  COMPOSER_CARD_BORDER_CLASS,
  COMPOSER_CARD_CLASS,
  COMPOSER_ICON_BUTTON_CLASS,
  COMPOSER_SEND_BUTTON_CLASS,
  COMPOSER_STATUS_LINE_CLASS,
  COMPOSER_STOP_BUTTON_CLASS,
  COMPOSER_TEXTAREA_CLASS,
} from '@ptah-extension/chat-ui';
import { VSCodeService, type AgentFeedbackSendResult } from '@ptah-extension/core';
import type { TrayAgentContext } from '../../../services/session-agents/session-agent-tray';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import { ChatAgentFeedbackSender } from '../../../services/agent-feedback/chat-agent-feedback-sender.service';
import { VoiceInputService } from '../../../services/voice-input.service';
import { ComposerVoiceButtonComponent } from '../../molecules/composer-controls/composer-voice-button.component';
import {
  SUBAGENT_GATED_REASONS,
  SubagentLaneComposerComponent,
} from './subagent-lane-composer.component';

describe('SubagentLaneComposerComponent', () => {
  const steer = jest.fn<Promise<boolean>, [TrayAgentContext, string]>();
  const send = jest.fn<
    Promise<AgentFeedbackSendResult>,
    [{ sessionId: string } | 'active', string]
  >();
  const voice = {
    isRecording: signal(false),
    isTranscribing: signal(false),
    elapsedSeconds: signal(0),
    start: jest.fn(),
    stop: jest.fn(),
  };

  const record: SubagentRecord = {
    parentToolUseId: 'tool-1',
    parentSessionId: 'session-1',
    agentType: 'Explore',
    agentId: 'a01',
    taskDescription: 'Map the repo',
    status: 'completed',
  };

  const context = (
    steerable: boolean,
    flags: { stoppable?: boolean; canBackground?: boolean } = {},
  ): TrayAgentContext => ({
    entry: {
      id: 'tool-1',
      name: 'Explore',
      origin: 'foreground',
      status: 'running',
      canBackground: flags.canBackground ?? false,
      stoppable: flags.stoppable ?? false,
      steerable,
    },
    taskId: 'task-1',
    sessionId: 'session-1',
    model: null,
  });

  function setup(
    rec: SubagentRecord,
    ctx: TrayAgentContext | null = null,
    sessionId: string | null = null,
  ): ComponentFixture<SubagentLaneComposerComponent> {
    const fixture = TestBed.createComponent(SubagentLaneComposerComponent);
    fixture.componentRef.setInput('record', rec);
    fixture.componentRef.setInput('context', ctx);
    fixture.componentRef.setInput('sessionId', sessionId);
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: ComponentFixture<unknown>): HTMLElement =>
    fixture.nativeElement as HTMLElement;
  const field = (fixture: ComponentFixture<unknown>): HTMLTextAreaElement =>
    root(fixture).querySelector('textarea') as HTMLTextAreaElement;
  const byId = (fixture: ComponentFixture<unknown>, id: string) =>
    root(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const sendButton = (fixture: ComponentFixture<unknown>) =>
    byId(fixture, 'subagent-composer-send') as HTMLButtonElement;
  const statusText = (fixture: ComponentFixture<unknown>) =>
    byId(fixture, 'subagent-composer-status-line')?.querySelector(
      '[aria-live="polite"]',
    )?.textContent ?? '';

  function fill(fixture: ComponentFixture<unknown>, text: string): void {
    const input = field(fixture);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function type(
    fixture: ComponentFixture<unknown>,
    text: string,
  ): Promise<void> {
    fill(fixture, text);
    field(fixture).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function expectClasses(element: Element | null, ...lists: string[]): void {
    expect(element).not.toBeNull();
    for (const token of lists.join(' ').split(/\s+/).filter(Boolean)) {
      expect(element?.classList).toContain(token);
    }
  }

  beforeEach(() => {
    steer.mockReset();
    send.mockReset();
    TestBed.configureTestingModule({
      imports: [SubagentLaneComposerComponent],
      providers: [
        { provide: SessionAgentTrayService, useValue: { steer } },
        { provide: ChatAgentFeedbackSender, useValue: { send } },
        { provide: VSCodeService, useValue: { isElectron: false } },
      ],
    });
    TestBed.overrideComponent(SubagentLaneComposerComponent, {
      remove: { providers: [VoiceInputService] },
      add: { providers: [{ provide: VoiceInputService, useValue: voice }] },
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('uses the shared composer card, textarea, buttons and status line classes', () => {
    const fixture = setup(
      { ...record, status: 'running' },
      context(true, { stoppable: true, canBackground: true }),
    );
    const card = byId(fixture, 'subagent-composer-card');
    expectClasses(card, COMPOSER_CARD_CLASS, COMPOSER_CARD_BORDER_CLASS);
    expect(card?.getAttribute('data-glass-surface')).toBe('tile');
    expectClasses(field(fixture), COMPOSER_TEXTAREA_CLASS);
    expectClasses(byId(fixture, 'subagent-composer-attach'), COMPOSER_ICON_BUTTON_CLASS);
    expectClasses(byId(fixture, 'subagent-composer-background'), COMPOSER_ICON_BUTTON_CLASS);
    expectClasses(byId(fixture, 'subagent-composer-stop'), COMPOSER_STOP_BUTTON_CLASS);
    expectClasses(sendButton(fixture), COMPOSER_SEND_BUTTON_CLASS);
    expectClasses(byId(fixture, 'subagent-composer-status-line'), COMPOSER_STATUS_LINE_CLASS);
  });

  it('labels the textarea and renders no approval, slash or mention controls', () => {
    const fixture = setup({ ...record, status: 'running' }, context(true));
    const label = root(fixture).querySelector(`label[for="${field(fixture).id}"]`);
    expect(label?.textContent?.trim()).toBe('Message Explore');
    expect(field(fixture).getAttribute('rows')).toBe('2');
    expect(field(fixture).getAttribute('dir')).toBe('auto');
    expect(root(fixture).querySelector('ptah-lane-approval-chip')).toBeNull();
    expect(root(fixture).querySelector('ptah-agent-steer-input')).toBeNull();
    expect(root(fixture).querySelector('[role="combobox"]')).toBeNull();
  });

  it('renders Stop and Send to background only by their flags', () => {
    const shown = setup(
      { ...record, status: 'running' },
      context(true, { stoppable: true, canBackground: true }),
    );
    const card = byId(shown, 'subagent-composer-card');
    expect(card?.querySelector('[aria-label="Stop generating"]')).not.toBeNull();
    expect(card?.querySelector('[aria-label="Send to background"]')).not.toBeNull();
  });

  it('hides Stop and Send to background without the flags', () => {
    const fixture = setup({ ...record, status: 'running' }, context(true));
    expect(byId(fixture, 'subagent-composer-stop')).toBeNull();
    expect(byId(fixture, 'subagent-composer-background')).toBeNull();
  });

  it('emits stop and background with the tray context', () => {
    const ctx = context(true, { stoppable: true, canBackground: true });
    const fixture = setup({ ...record, status: 'running' }, ctx);
    const stopped = jest.fn();
    const backgrounded = jest.fn();
    fixture.componentInstance.stopRequested.subscribe(stopped);
    fixture.componentInstance.backgroundRequested.subscribe(backgrounded);
    byId(fixture, 'subagent-composer-stop')?.click();
    byId(fixture, 'subagent-composer-background')?.click();
    expect(stopped).toHaveBeenCalledWith(ctx);
    expect(backgrounded).toHaveBeenCalledWith(ctx);
  });

  it('gates attach, model and effort with their reasons and counts 3 limited', () => {
    const fixture = setup({ ...record, status: 'running' }, context(true));
    const attach = byId(fixture, 'subagent-composer-attach') as HTMLButtonElement;
    expect(attach.getAttribute('aria-disabled')).toBe('true');
    expect(attach.disabled).toBe(false);
    expect(attach.getAttribute('title')).toBe(SUBAGENT_GATED_REASONS.attach);
    expect(attach.getAttribute('aria-describedby')).toBeTruthy();
    const model = byId(fixture, 'composer-model-pill');
    expect(model?.getAttribute('aria-disabled')).toBe('true');
    expect(model?.getAttribute('title')).toBe(SUBAGENT_GATED_REASONS.steer.model);
    const effort = root(fixture).querySelector(
      'ptah-composer-effort-picker [aria-disabled="true"]',
    );
    expect(effort?.getAttribute('title')).toBe(SUBAGENT_GATED_REASONS.steer.effort);

    const badge = byId(fixture, 'subagent-composer-limited-badge');
    expect(badge?.textContent).toContain('3 limited');
    expect(badge?.getAttribute('title')).toBe(
      [
        SUBAGENT_GATED_REASONS.attach,
        SUBAGENT_GATED_REASONS.steer.model,
        SUBAGENT_GATED_REASONS.steer.effort,
      ].join('\n'),
    );
  });

  it('uses the main chat wording for the model and effort reasons in follow-up mode', () => {
    const fixture = setup(record);
    expect(byId(fixture, 'composer-model-pill')?.getAttribute('title')).toBe(
      SUBAGENT_GATED_REASONS.followUp.model,
    );
    expect(
      root(fixture)
        .querySelector('ptah-composer-effort-picker [aria-disabled="true"]')
        ?.getAttribute('title'),
    ).toBe(SUBAGENT_GATED_REASONS.followUp.effort);
  });

  it('shows a gated reason on the status line while revealed and sends nothing on click', () => {
    const fixture = setup({ ...record, status: 'running' }, context(true));
    fill(fixture, 'Check tests');
    const attach = byId(fixture, 'subagent-composer-attach') as HTMLButtonElement;
    attach.click();
    fixture.detectChanges();
    expect(statusText(fixture)).toBe(SUBAGENT_GATED_REASONS.attach);
    expect(steer).not.toHaveBeenCalled();
    attach.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(statusText(fixture)).toBe(
      'Enter sends to Explore · Shift+Enter adds a line',
    );
  });

  it('picks the mode from the tray context and the owning session', () => {
    expect(
      setup({ ...record, status: 'running' }, context(true)).componentInstance.mode(),
    ).toBe('steer');
    expect(setup(record, context(false)).componentInstance.mode()).toBe(
      'follow-up',
    );
  });

  it.each(['running', 'background'] as const)(
    'never sends a %s agent without a steerable context to the main chat',
    async (status) => {
      const fixture = setup({ ...record, status }, context(false));
      expect(fixture.componentInstance.mode()).toBe('unavailable');
      expect(
        byId(fixture, 'subagent-composer-unavailable')?.textContent,
      ).toContain('This agent cannot take messages right now');
      expect(field(fixture).disabled).toBe(true);
      expect(sendButton(fixture).disabled).toBe(true);
      field(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(send).not.toHaveBeenCalled();
      expect(steer).not.toHaveBeenCalled();
    },
  );

  it('falls back to the lane session for the follow-up', () => {
    const fixture = setup(
      { ...record, parentSessionId: undefined },
      null,
      'lane-session',
    );
    expect(fixture.componentInstance.mode()).toBe('follow-up');
  });

  it('shows the unavailable notice without any known session', () => {
    const fixture = setup({ ...record, parentSessionId: undefined });
    expect(fixture.componentInstance.mode()).toBe('unavailable');
    expect(
      byId(fixture, 'subagent-composer-unavailable')?.textContent,
    ).toContain("This agent's session is not open");
    expect(field(fixture).disabled).toBe(true);
    expect(sendButton(fixture).disabled).toBe(true);
  });

  it('steers a running agent, keeps the draft on failure and clears it on success', async () => {
    steer.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const fixture = setup({ ...record, status: 'running' }, context(true));
    expect(field(fixture).placeholder).toBe('Message Explore…');
    expect(statusText(fixture)).toBe(
      'Enter sends to Explore · Shift+Enter adds a line',
    );
    expect(sendButton(fixture).getAttribute('aria-label')).toBe(
      'Send steer message',
    );
    expect(sendButton(fixture).disabled).toBe(true);
    await type(fixture, 'Check tests');
    expect(steer).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
      'Check tests',
    );
    const error = byId(fixture, 'subagent-composer-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.classList).toContain('text-state-err');
    expect(field(fixture).value).toBe('Check tests');
    await type(fixture, 'Check tests');
    expect(byId(fixture, 'subagent-composer-error')).toBeNull();
    expect(field(fixture).value).toBe('');
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps a voice transcript added while the send was pending (M5)', async () => {
    let resolve: (sent: boolean) => void = () => undefined;
    steer.mockReturnValue(new Promise<boolean>((done) => (resolve = done)));
    const fixture = setup({ ...record, status: 'running' }, context(true));
    fill(fixture, 'Check tests');
    field(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(field(fixture).disabled).toBe(true);
    const voiceButton = fixture.debugElement.query(By.directive(ComposerVoiceButtonComponent));
    (voiceButton.componentInstance as ComposerVoiceButtonComponent).transcript.emit('and the lint');
    fixture.detectChanges();
    resolve(true);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(steer).toHaveBeenCalledWith(expect.anything(), 'Check tests');
    expect(field(fixture).value).toBe('and the lint');
  });

  it('sends through the Send button', async () => {
    steer.mockResolvedValue(true);
    const fixture = setup({ ...record, status: 'running' }, context(true));
    fill(fixture, '  Look at src  ');
    expect(sendButton(fixture).disabled).toBe(false);
    sendButton(fixture).click();
    await fixture.whenStable();
    expect(steer).toHaveBeenCalledWith(expect.anything(), 'Look at src');
  });

  it('keeps Shift+Enter and an IME composition Enter out of sending', async () => {
    const fixture = setup({ ...record, status: 'running' }, context(true));
    fill(fixture, 'Check tests');
    const input = field(fixture);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 }));
    await fixture.whenStable();
    expect(steer).not.toHaveBeenCalled();
    expect(input.value).toBe('Check tests');
  });

  it('sends a finished agent the follow-up prompt through the main chat', async () => {
    send.mockResolvedValue({ sent: true });
    const fixture = setup(record);
    expect(field(fixture).placeholder).toBe(
      'Ask the main agent to continue Explore…',
    );
    expect(statusText(fixture)).toBe('Sends to the main chat as a follow-up');
    expect(sendButton(fixture).getAttribute('aria-label')).toBe('Send follow-up');
    await type(fixture, 'Add tests');
    expect(send).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      'Continue the Explore sub-agent (agent id a01) that worked on "Map the repo" with this message from me:\n\nAdd tests',
    );
    expect(field(fixture).value).toBe('');
    const status = byId(fixture, 'subagent-composer-status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('Sent to the main chat');
    expect(steer).not.toHaveBeenCalled();
  });

  it('shows the sender error and keeps the draft when the follow-up fails', async () => {
    send.mockResolvedValue({
      sent: false,
      error: 'No chat tab for this session',
    });
    const fixture = setup(record);
    await type(fixture, 'Add tests');
    expect(byId(fixture, 'subagent-composer-error')?.textContent).toContain(
      'No chat tab for this session',
    );
    expect(field(fixture).value).toBe('Add tests');
  });

  it('resets the draft and messages when the lane shows another agent', async () => {
    send.mockResolvedValue({ sent: false, error: 'Failed' });
    const fixture = setup(record);
    await type(fixture, 'For agent A');
    expect(byId(fixture, 'subagent-composer-error')).not.toBeNull();
    fixture.componentRef.setInput('record', {
      ...record,
      parentToolUseId: 'tool-2',
    });
    fixture.detectChanges();
    expect(field(fixture).value).toBe('');
    expect(byId(fixture, 'subagent-composer-error')).toBeNull();
  });

  it('drops a late reply that arrives after the agent changed', async () => {
    let resolve: (result: AgentFeedbackSendResult) => void = () => undefined;
    send.mockReturnValue(
      new Promise<AgentFeedbackSendResult>((done) => (resolve = done)),
    );
    const fixture = setup(record);
    fill(fixture, 'For agent A');
    field(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.componentRef.setInput('record', {
      ...record,
      parentToolUseId: 'tool-2',
    });
    fixture.detectChanges();
    resolve({ sent: false, error: 'Late failure' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId(fixture, 'subagent-composer-error')).toBeNull();
    expect(field(fixture).disabled).toBe(false);
  });
});
