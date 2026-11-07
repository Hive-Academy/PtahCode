import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteSessionView,
} from '../../services/machines-store';
import { initialSessionEventState } from '../../services/session-event-reducer';
import { RemoteComposerComponent } from './remote-composer.component';

const ok = (): MachinesOutcome => ({ ok: true, value: undefined });

function view(overrides: Partial<RemoteSessionView> = {}): RemoteSessionView {
  return {
    ...initialSessionEventState('s1'),
    mode: 'log',
    epoch: 'e1',
    machineId: 'm1',
    machineState: 'connected',
    stale: false,
    watchOnly: false,
    lockUnavailable: false,
    catchingUp: false,
    error: null,
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup(initial: RemoteSessionView | null = view()) {
  TestBed.resetTestingModule();
  const store = { sendPrompt: jest.fn().mockResolvedValue(ok()) };
  TestBed.configureTestingModule({
    imports: [RemoteComposerComponent],
    providers: [{ provide: MachinesStore, useValue: store }],
  });
  const fixture = TestBed.createComponent(RemoteComposerComponent);
  fixture.componentRef.setInput('machineId', 'm1');
  fixture.componentRef.setInput('sessionId', 's1');
  fixture.componentRef.setInput('view', initial);
  fixture.componentRef.setInput('machineName', 'Horus');
  fixture.componentRef.setInput('connected', true);
  fixture.detectChanges();
  return { fixture, store };
}

const q = (fixture: ComponentFixture<unknown>, id: string) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${id}"]`,
  );
const text = (fixture: ComponentFixture<unknown>, id: string) =>
  q(fixture, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const input = (fixture: ComponentFixture<unknown>) =>
  q(fixture, 'remote-composer-input') as HTMLTextAreaElement;
const send = (fixture: ComponentFixture<unknown>) =>
  q(fixture, 'remote-send') as HTMLButtonElement;

function type(fixture: ComponentFixture<unknown>, value: string): void {
  input(fixture).value = value;
  input(fixture).dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function enter(fixture: ComponentFixture<unknown>, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    shiftKey,
    cancelable: true,
  });
  input(fixture).dispatchEvent(event);
  return event;
}

describe('RemoteComposerComponent', () => {
  it('a refused send keeps the draft and says why', async () => {
    const { fixture, store } = setup();
    store.sendPrompt.mockResolvedValueOnce({
      ok: false,
      error: { message: 'This session is driven elsewhere.', code: 'SESSION_DRIVEN_ELSEWHERE' },
    });
    type(fixture, 'Keep me');
    send(fixture).click();
    await flush();
    fixture.detectChanges();
    expect(input(fixture).value).toBe('Keep me');
    expect(text(fixture, 'remote-send-error')).toBe(
      'This session is driven elsewhere.',
    );
    expect(fixture.componentInstance.error()).toBe(
      'This session is driven elsewhere.',
    );
  });

  it('Enter sends the trimmed draft and clears it; Shift+Enter does not send', async () => {
    const { fixture, store } = setup();
    type(fixture, '  Next step  ');
    expect(enter(fixture, true).defaultPrevented).toBe(false);
    expect(store.sendPrompt).not.toHaveBeenCalled();

    expect(enter(fixture).defaultPrevented).toBe(true);
    await flush();
    fixture.detectChanges();
    expect(store.sendPrompt).toHaveBeenCalledWith('m1', 's1', 'Next step');
    expect(input(fixture).value).toBe('');
  });

  it('a new send clears an earlier error from the page', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('error', 'This session is not open.');
    fixture.detectChanges();
    expect(text(fixture, 'remote-send-error')).toBe('This session is not open.');
    type(fixture, 'Again');
    send(fixture).click();
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'remote-send-error')).toBeNull();
  });

  it('watch-only: the input is disabled and the reason is linked', () => {
    const { fixture } = setup(
      view({ mode: 'snapshot', epoch: null, drivenBy: 'amun@horus', watchOnly: true }),
    );
    expect(input(fixture).disabled).toBe(true);
    expect(input(fixture).placeholder).toBe(
      'Sending is unavailable: driven from Horus',
    );
    expect(input(fixture).getAttribute('aria-describedby')).toBe(
      'ptah-remote-session-reason-composer',
    );
    expect(send(fixture).disabled).toBe(true);
  });

  it('a disconnected machine cannot send and says so', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('connected', false);
    fixture.detectChanges();
    type(fixture, 'Hello');
    expect(send(fixture).disabled).toBe(true);
    expect(text(fixture, 'remote-composer-reason')).toBe('Horus is not connected.');
  });

  it('a new session starts with an empty draft', () => {
    const { fixture } = setup();
    type(fixture, 'Draft for s1');
    fixture.componentRef.setInput('sessionId', 's2');
    fixture.detectChanges();
    expect(input(fixture).value).toBe('');
  });
});
