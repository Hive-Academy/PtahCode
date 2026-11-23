import { TestBed } from '@angular/core/testing';
import {
  QueuedMessageListComponent,
  type QueuedMessageView,
  type QueuedSendNowAction,
} from './queued-message-list.component';

function view(id: string, patch: Partial<QueuedMessageView> = {}): QueuedMessageView {
  return {
    id,
    content: `text ${id}`,
    statusLabel: 'Queued for the next turn',
    withdrawable: true,
    busy: false,
    sendable: true,
    ...patch,
  };
}

const AVAILABLE: QueuedSendNowAction = {
  label: 'Send now',
  hint: 'Send this message into the running turn now',
  state: 'available',
};

describe('QueuedMessageListComponent', () => {
  function render(items: QueuedMessageView[], action: QueuedSendNowAction = AVAILABLE) {
    const fixture = TestBed.createComponent(QueuedMessageListComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('sendNowAction', action);
    fixture.detectChanges();
    return fixture;
  }

  function sendNowButton(root: HTMLElement): HTMLButtonElement {
    return root.querySelector('[data-testid="queued-follow-up-send-now"]') as HTMLButtonElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QueuedMessageListComponent] });
  });

  it('renders nothing without items', () => {
    const fixture = render([]);
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('uses the readable inks for the Queued label and the note', () => {
    const fixture = render([view('a', { note: 'It stays queued.' })]);
    const root = fixture.nativeElement as HTMLElement;
    const label = Array.from(root.querySelectorAll('header span')).find(
      (el) => el.textContent?.trim() === 'Queued',
    );
    expect(label?.classList).toContain('text-base-content');
    expect(label?.classList).not.toContain('text-primary');
    const note = root.querySelector('[role="status"]') as HTMLElement;
    expect(note.textContent).toContain('It stays queued.');
    expect(note.classList).toContain('text-state-need');
    expect(note.classList).not.toContain('text-warning');
  });

  it('emits the item id for Withdraw and Send now', () => {
    const fixture = render([view('a')]);
    const withdrawn: string[] = [];
    const sent: string[] = [];
    fixture.componentInstance.withdraw.subscribe((id) => withdrawn.push(id));
    fixture.componentInstance.sendNow.subscribe((id) => sent.push(id));
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('[data-testid="queued-withdraw"]') as HTMLButtonElement).click();
    sendNowButton(root).click();
    expect(withdrawn).toEqual(['a']);
    expect(sent).toEqual(['a']);
  });

  it('disables both buttons while the item is busy, and Send now until it is sendable', () => {
    const fixture = render([
      view('a', { busy: true }),
      view('b', { sendable: false, statusLabel: 'Waiting to queue' }),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const withdraws = root.querySelectorAll(
      '[data-testid="queued-withdraw"]',
    ) as NodeListOf<HTMLButtonElement>;
    const sends = root.querySelectorAll(
      '[data-testid="queued-follow-up-send-now"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(withdraws[0].disabled).toBe(true);
    expect(sends[0].disabled).toBe(true);
    expect(sends[0].title).toBe(AVAILABLE.hint);
    expect(withdraws[1].disabled).toBe(false);
    expect(sends[1].disabled).toBe(true);
    expect(sends[1].title).toBe('Waiting to queue');
  });

  it('hides Send now when the action is hidden', () => {
    const fixture = render([view('a')], { ...AVAILABLE, state: 'hidden' });
    const root = fixture.nativeElement as HTMLElement;
    expect(sendNowButton(root)).toBeNull();
    expect(root.querySelector('[data-testid="queued-send-now-reason"]')).toBeNull();
  });

  it('shows an unavailable Send now as aria-disabled with the reason, and emits nothing', () => {
    const fixture = render([view('a')], {
      ...AVAILABLE,
      state: 'unavailable',
      reason: 'Copilot starts a new process for every turn.',
    });
    const sent: string[] = [];
    fixture.componentInstance.sendNow.subscribe((id) => sent.push(id));
    const root = fixture.nativeElement as HTMLElement;
    const button = sendNowButton(root);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toContain('Send now');
    const reason = root.querySelector('[data-testid="queued-send-now-reason"]') as HTMLElement;
    expect(reason.textContent?.trim()).toBe(
      'Send now unavailable: Copilot starts a new process for every turn.',
    );
    expect(button.getAttribute('aria-describedby')).toBe(reason.id);
    button.click();
    expect(sent).toEqual([]);
  });

  it('shows the sender note in place of Withdraw for a parent-sent item', () => {
    const fixture = render([
      view('a', { withdrawable: false, senderNote: 'Sent by the parent session' }),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="queued-withdraw"]')).toBeNull();
    expect(
      root.querySelector('[data-testid="queued-sender-note"]')?.textContent,
    ).toContain('Sent by the parent session');
  });

  it('names the Interrupt & send action in words for screen readers', () => {
    const fixture = render([view('a', { content: 'hello  \n Claude' })], {
      label: 'Interrupt & send',
      hint: 'Stop the current turn and send this message now',
      state: 'available',
    });
    const button = sendNowButton(fixture.nativeElement);
    expect(button.textContent).toContain('Interrupt & send');
    expect(button.getAttribute('aria-label')).toBe('Interrupt and send: hello Claude');
  });
});
