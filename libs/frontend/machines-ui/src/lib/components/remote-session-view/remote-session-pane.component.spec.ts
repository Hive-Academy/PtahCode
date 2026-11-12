import { ClockService } from '@ptah-extension/core';
import { PTAH_CLOCK } from '@ptah-extension/ui';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PermissionRequest } from '@ptah-extension/shared';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteSessionView,
} from '../../services/machines-store';
import { initialSessionEventState } from '../../services/session-event-reducer';
import { RemoteSessionPaneComponent } from './remote-session-pane.component';

const REQUEST: PermissionRequest = {
  id: 'p1',
  toolName: 'Bash',
  toolInput: { command: 'ls' },
  timestamp: Date.now(),
  description: 'Run ls',
  timeoutAt: Date.now() + 60_000,
};

function view(overrides: Partial<RemoteSessionView> = {}): RemoteSessionView {
  return {
    ...initialSessionEventState('s1'),
    mode: 'log',
    epoch: 'e1',
    events: [],
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

function setup(initial: RemoteSessionView | null) {
  TestBed.resetTestingModule();
  const store = {
    respondPermission: jest
      .fn<Promise<MachinesOutcome>, [string, string, string, string]>()
      .mockResolvedValue({ ok: true, value: undefined }),
  };
  TestBed.configureTestingModule({
    imports: [RemoteSessionPaneComponent],
    providers: [
      { provide: MachinesStore, useValue: store },
      { provide: PTAH_CLOCK, useExisting: ClockService },
    ],
  });
  const fixture = TestBed.createComponent(RemoteSessionPaneComponent);
  fixture.componentRef.setInput('machineId', 'm1');
  fixture.componentRef.setInput('sessionId', 's1');
  fixture.componentRef.setInput('view', initial);
  fixture.componentRef.setInput('transcript', []);
  fixture.componentRef.setInput('machineName', 'Horus');
  fixture.componentRef.setInput('sessionTitle', 'Sprint log');
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

describe('RemoteSessionPaneComponent', () => {
  it('is the focusable, labelled transcript region', () => {
    const { fixture } = setup(view());
    const region = q(fixture, 'remote-transcript-region');
    expect(region?.tagName).toBe('SECTION');
    expect(region?.getAttribute('aria-label')).toBe('Transcript');
    expect(region?.getAttribute('tabindex')).toBe('0');
  });

  it('says it is opening before the first attach and while attaching', () => {
    const { fixture } = setup(null);
    expect(text(fixture, 'remote-opening')).toBe('Opening session…');
    fixture.componentRef.setInput('view', view({ mode: 'attaching' }));
    fixture.detectChanges();
    expect(q(fixture, 'remote-opening')?.getAttribute('role')).toBe('status');
  });

  it.each([
    [view(), 'No messages yet.'],
    [view({ mode: 'snapshot' }), 'Nothing was saved in this session yet.'],
    [view({ mode: 'detached' }), 'The session could not be opened.'],
    [
      view({ lockUnavailable: true }),
      'No saved history is available because the session could not be checked.',
    ],
  ])('names why the transcript is empty (%#)', (initial, expected) => {
    const { fixture } = setup(initial);
    expect(text(fixture, 'remote-empty')).toBe(expected);
    expect(q(fixture, 'remote-saved-divider')).toBeNull();
  });

  it('sets the approval mode from the view', () => {
    const { fixture } = setup(view({ pendingPermissions: [REQUEST] }));
    expect(q(fixture, 'approval-block')?.dataset['mode']).toBe('answerable');
    fixture.componentRef.setInput(
      'view',
      view({ pendingPermissions: [REQUEST], watchOnly: true }),
    );
    fixture.detectChanges();
    expect(q(fixture, 'approval-block')?.dataset['mode']).toBe('watch-only');
    fixture.componentRef.setInput(
      'view',
      view({ pendingPermissions: [REQUEST], lockUnavailable: true }),
    );
    fixture.detectChanges();
    expect(q(fixture, 'approval-block')?.dataset['mode']).toBe('cached');
  });

  it('answers through the store and shows a refusal on its block', async () => {
    const { fixture, store } = setup(view({ pendingPermissions: [REQUEST] }));
    store.respondPermission.mockResolvedValueOnce({
      ok: false,
      refused: 'not-open',
    });
    (q(fixture, 'approval-allow') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(store.respondPermission).toHaveBeenCalledWith(
      'm1',
      's1',
      'p1',
      'allow',
    );
    expect(text(fixture, 'approval-error')).toContain(
      'This session is not open.',
    );
  });

  it('a new session starts with no answer errors', async () => {
    const { fixture, store } = setup(view({ pendingPermissions: [REQUEST] }));
    store.respondPermission.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Boom' },
    });
    (q(fixture, 'approval-allow') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'approval-error')).not.toBeNull();
    fixture.componentRef.setInput('sessionId', 's2');
    fixture.detectChanges();
    expect(q(fixture, 'approval-error')).toBeNull();
  });

  it('an offline machine cannot be answered and says why', () => {
    const { fixture } = setup(view({ pendingPermissions: [REQUEST] }));
    fixture.componentRef.setInput('connected', false);
    fixture.detectChanges();
    expect(text(fixture, 'approval-hint')).toBe('Horus is not connected.');
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('an answer that settles after a session switch leaves the new session alone', async () => {
    const { fixture, store } = setup(view({ pendingPermissions: [REQUEST] }));
    let settleA!: (outcome: MachinesOutcome) => void;
    store.respondPermission.mockReturnValueOnce(
      new Promise<MachinesOutcome>((resolve) => (settleA = resolve)),
    );
    (q(fixture, 'approval-allow') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      true,
    );

    // Session B shows a request with the same id, and answers it while A's
    // answer is still in flight.
    fixture.componentRef.setInput('sessionId', 's2');
    fixture.detectChanges();
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      false,
    );
    let settleB!: (outcome: MachinesOutcome) => void;
    store.respondPermission.mockReturnValueOnce(
      new Promise<MachinesOutcome>((resolve) => (settleB = resolve)),
    );
    (q(fixture, 'approval-deny') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.respondPermission).toHaveBeenLastCalledWith(
      'm1',
      's2',
      'p1',
      'deny',
    );

    settleA({ ok: false, error: { message: 'Session A failed' } });
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'approval-error')).toBeNull();
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      true,
    );

    settleB({ ok: true, value: undefined });
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'approval-error')).toBeNull();
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('an answer from a session left and re-entered is not applied', async () => {
    const { fixture, store } = setup(view({ pendingPermissions: [REQUEST] }));
    let settle!: (outcome: MachinesOutcome) => void;
    store.respondPermission.mockReturnValueOnce(
      new Promise<MachinesOutcome>((resolve) => (settle = resolve)),
    );
    (q(fixture, 'approval-allow') as HTMLButtonElement).click();
    fixture.componentRef.setInput('sessionId', 's2');
    fixture.detectChanges();
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.detectChanges();
    settle({ ok: false, error: { message: 'Late' } });
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'approval-error')).toBeNull();
  });

  it('a rejected answer shows a fixed line on its block and frees it', async () => {
    const { fixture, store } = setup(view({ pendingPermissions: [REQUEST] }));
    store.respondPermission.mockRejectedValueOnce(
      new Error(
        '401 from provider, key sk-test-SECRET, /home/horus/.ptah/auth',
      ),
    );
    (q(fixture, 'approval-allow') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(text(fixture, 'approval-error')).toContain(
      'The answer could not be sent. Check the connection to the machine and try again.',
    );
    const block = q(fixture, 'approval-block')?.textContent ?? '';
    expect(block).not.toContain('sk-test-SECRET');
    expect(block).not.toContain('/home/horus');
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
