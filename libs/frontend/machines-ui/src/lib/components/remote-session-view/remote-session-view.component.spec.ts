import { ClockService } from '@ptah-extension/core';
import { PTAH_CLOCK } from '@ptah-extension/ui';
import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SURFACE_ACTIVE } from '@ptah-extension/core';
import { provideMarkdownRendering } from '@ptah-extension/markdown';
import type {
  FlatStreamEventUnion,
  PermissionRequest,
} from '@ptah-extension/shared';
import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteMachine,
  type RemoteSessionView,
} from '../../services/machines-store';
import {
  initialSessionEventState,
  reduceSessionEvent,
} from '../../services/session-event-reducer';
import {
  HISTORY_MESSAGE,
  sessionEvent,
} from '../../services/testing/machines-fixtures';
import { RemoteSessionViewComponent } from './remote-session-view.component';

const HORUS: RemoteMachine = {
  machineId: 'm1',
  alias: 'horus',
  displayName: 'Horus',
  state: 'connected',
};

const USER_MESSAGE: readonly FlatStreamEventUnion[] = [
  {
    id: 'u-start',
    eventType: 'message_start',
    timestamp: 1,
    messageId: 'msg-0',
    role: 'user',
    source: 'history',
  },
  {
    id: 'u-text',
    eventType: 'text_delta',
    timestamp: 1,
    messageId: 'msg-0',
    delta: 'Summarise the log',
    blockIndex: 0,
    source: 'history',
  },
];

const REQUEST: PermissionRequest = {
  id: 'p1',
  toolName: 'Bash',
  toolInput: { command: 'rm -rf build' },
  timestamp: Date.now(),
  description: 'Run rm',
  timeoutAt: Date.now() + 60_000,
};

const ok = (): MachinesOutcome => ({ ok: true, value: undefined });

function view(overrides: Partial<RemoteSessionView> = {}): RemoteSessionView {
  return {
    ...initialSessionEventState('s1'),
    mode: 'log',
    epoch: 'e1',
    events: [...USER_MESSAGE, ...HISTORY_MESSAGE],
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

function snapshot(drivenBy: string | null): Partial<RemoteSessionView> {
  return { mode: 'snapshot', epoch: null, drivenBy, watchOnly: true };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function setup(initial: RemoteSessionView = view()) {
  TestBed.resetTestingModule();
  const machines = signal<readonly RemoteMachine[]>([HORUS]);
  const current = signal<RemoteSessionView | null>(initial);
  const store = {
    machine: (id: string) =>
      computed(() => machines().find((m) => m.machineId === id) ?? null),
    sessionView: () => current,
    openSession: jest.fn().mockResolvedValue(ok()),
    closeSession: jest.fn().mockResolvedValue(ok()),
    sendPrompt: jest.fn().mockResolvedValue(ok()),
    stopSession: jest.fn().mockResolvedValue(ok()),
    respondPermission: jest.fn().mockResolvedValue(ok()),
  };
  TestBed.configureTestingModule({
    imports: [RemoteSessionViewComponent],
    providers: [
      { provide: MachinesStore, useValue: store },
      { provide: SURFACE_ACTIVE, useValue: signal(true) },
      { provide: PTAH_CLOCK, useExisting: ClockService },
      provideMarkdownRendering({ extensions: 'basic' }),
    ],
  });
  const fixture = TestBed.createComponent(RemoteSessionViewComponent);
  fixture.componentRef.setInput('machineId', 'm1');
  fixture.componentRef.setInput('sessionId', 's1');
  fixture.componentRef.setInput('title', 'Summarise sprint log');
  fixture.componentRef.setInput('workspacePath', '~/work/notes');
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
  const set = async (next: RemoteSessionView | null) => {
    current.set(next);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
  };
  return { fixture, store, machines, current, set };
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

async function type(
  fixture: ComponentFixture<unknown>,
  value: string,
): Promise<void> {
  input(fixture).value = value;
  input(fixture).dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('RemoteSessionViewComponent', () => {
  it('attaches on open and detaches on leaving', async () => {
    const { fixture, store } = await setup();
    expect(store.openSession).toHaveBeenCalledWith('m1', 's1');
    fixture.destroy();
    expect(store.closeSession).toHaveBeenCalledWith('m1', 's1');
  });

  it('4.6: header and "Claude on <Machine>" author label', async () => {
    const { fixture } = await setup();
    expect(text(fixture, 'remote-session-title')).toBe('Summarise sprint log');
    expect(text(fixture, 'remote-session-meta')).toBe(
      'on Horus · ~/work/notes',
    );
    expect(text(fixture, 'remote-message-author')).toBe('Claude on Horus');
    expect(q(fixture, 'remote-message-user')?.textContent).toContain('You:');
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'ptah-markdown-block',
      ),
    ).toHaveLength(2);
    expect(text(fixture, 'session-sync-chip')).toBe('Caught up');
  });

  it('4.6 composer: Send needs text; a turn in flight keeps the input focusable', async () => {
    const { fixture, store, set } = await setup();
    expect(input(fixture).placeholder).toBe('Message Claude on Horus');
    expect(send(fixture).disabled).toBe(true);
    await type(fixture, 'Next step');
    expect(send(fixture).disabled).toBe(false);

    await set(view({ turnId: 't1' }));
    expect(input(fixture).disabled).toBe(false);
    expect(input(fixture).placeholder).toBe(
      'Message Claude on Horus (a turn is in progress)',
    );
    expect(send(fixture).disabled).toBe(true);
    expect(text(fixture, 'remote-live')).toBe('Claude is responding');
    expect((q(fixture, 'remote-stop') as HTMLButtonElement).disabled).toBe(
      false,
    );

    await set(view());
    send(fixture).click();
    await flush();
    fixture.detectChanges();
    expect(store.sendPrompt).toHaveBeenCalledWith('m1', 's1', 'Next step');
    expect(input(fixture).value).toBe('');
  });

  it('4.9 (9): a driven snapshot is the last saved state and watch-only', async () => {
    const { fixture, store } = await setup(view(snapshot('Horus keyboard')));
    const banner = q(fixture, 'remote-watch-banner');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.textContent).toContain(
      'Horus keyboard is driving this session.',
    );
    expect(text(fixture, 'remote-owner-chip')).toBe('Driver: Horus keyboard');
    expect(text(fixture, 'remote-snapshot-label')).toBe(
      'Showing the last saved state',
    );
    expect(text(fixture, 'remote-saved-divider')).toMatch(
      /Newer activity is not shown\.$/,
    );
    expect(input(fixture).disabled).toBe(true);
    expect(input(fixture).placeholder).toBe(
      'Sending is unavailable: driven from Horus',
    );
    expect(input(fixture).getAttribute('aria-describedby')).toBe(
      'ptah-remote-session-reason-composer',
    );
    expect(send(fixture).disabled).toBe(true);
    const stop = q(fixture, 'remote-stop') as HTMLButtonElement;
    expect(stop.disabled).toBe(true);
    expect(stop.getAttribute('aria-describedby')).toBe(banner?.id);
    expect(text(fixture, 'remote-live')).toBe(
      'This session is driven by Horus keyboard. Watch only.',
    );

    (q(fixture, 'remote-refresh') as HTMLButtonElement).click();
    await flush();
    expect(store.openSession).toHaveBeenCalledTimes(2);
  });

  it('9b: the fix line names the release command for this session', async () => {
    const { fixture } = await setup(
      view(snapshot('another Ptah process (not responding)')),
    );
    expect(q(fixture, 'remote-watch-banner')?.dataset['tone']).toBe('need');
    expect(text(fixture, 'remote-watch-command')).toBe(
      `${WORKER_REMOTE_COMMAND} locks release s1`,
    );
  });

  it('9c: lock not checked, no history: alert, no owner text anywhere', async () => {
    const { fixture } = await setup(
      view({
        mode: 'detached',
        events: [],
        watchOnly: true,
        lockUnavailable: true,
        error: {
          message: 'The session driver lock is unavailable.',
          code: 'SESSION_DRIVER_LOCK_UNAVAILABLE',
        },
      }),
    );
    const banner = q(fixture, 'remote-watch-banner');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent).toContain('Cannot check who has this session');
    expect(text(fixture, 'remote-watch-code')).toBe('DRIVER_LOCK_UNAVAILABLE');
    expect(text(fixture, 'remote-owner-chip')).toBe('Not available');
    expect(text(fixture, 'remote-empty')).toBe(
      'No saved history is available because the session could not be checked.',
    );
    expect(input(fixture).placeholder).toBe('Sending is unavailable');
    expect(text(fixture, 'remote-composer-reason')).toBe(
      'This app could not check who has this session. Sending is unavailable.',
    );
    expect(q(fixture, 'remote-error')).toBeNull();
    const host = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(host).not.toMatch(
      /driving|driven from|SESSION_DRIVER_LOCK_UNAVAILABLE/,
    );
  });

  it('9c with a cached view: labelled cached, request read-only', async () => {
    const { fixture } = await setup(
      view({
        mode: 'detached',
        watchOnly: true,
        lockUnavailable: true,
        pendingPermissions: [REQUEST],
      }),
    );
    expect(text(fixture, 'remote-snapshot-label')).toMatch(
      /^Cached from .+, may be out of date$/,
    );
    expect(q(fixture, 'approval-block')?.dataset['mode']).toBe('cached');
    expect(q(fixture, 'approval-allow')).toBeNull();
  });

  it('9d: a re-check that finds the session free enables sending again', async () => {
    const { fixture, set } = await setup(view(snapshot('Horus keyboard')));
    await type(fixture, 'Draft kept');
    await set(view());
    const banner = q(fixture, 'remote-watch-banner');
    expect(banner?.dataset['tone']).toBe('done');
    expect(banner?.textContent).toContain(
      'Horus keyboard finished. You can send messages again.',
    );
    expect(text(fixture, 'remote-owner-chip')).toBe('Idle');
    expect(input(fixture).disabled).toBe(false);
    expect(input(fixture).value).toBe('Draft kept');
    expect(send(fixture).disabled).toBe(false);

    (q(fixture, 'remote-freed-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(fixture, 'remote-watch-banner')).toBeNull();
  });

  it('4.7: answers a pending request; 7c shows the neutral denial', async () => {
    const { fixture, store } = await setup(
      view({ pendingPermissions: [REQUEST] }),
    );
    expect(q(fixture, 'approval-block')?.dataset['mode']).toBe('answerable');
    store.respondPermission.mockResolvedValueOnce({
      ok: false,
      error: {
        message: 'The machine or session was not found or access is denied.',
        code: 'MACHINE_NOT_FOUND_OR_FORBIDDEN',
      },
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
      'This request could not be answered from this app.',
    );
    expect((q(fixture, 'approval-allow') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('decision 27: a request the worker denied on timeout says so', async () => {
    const { fixture } = await setup(view({ timedOutPermissions: [REQUEST] }));
    expect(text(fixture, 'approval-timed-out')).toBe(
      'No answer within 60 s — the worker denied this request.',
    );
    expect((q(fixture, 'approval-deny') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('3.4: an offline machine keeps the view as last known state', async () => {
    const { fixture, machines, set } = await setup();
    machines.set([{ ...HORUS, state: 'offline' }]);
    await set(view({ machineState: 'offline', stale: true }));
    expect(text(fixture, 'remote-stale')).toContain('Horus is not connected.');
    expect(fixture.nativeElement.textContent).not.toMatch(/failed/i);
    await type(fixture, 'later');
    expect(send(fixture).disabled).toBe(true);
    expect(text(fixture, 'remote-composer-reason')).toBe(
      'Horus is not connected.',
    );
  });

  it('4.8: reconnecting shows the replay banner and the gap chip', async () => {
    const { fixture, machines, set } = await setup(
      view({ last: 1204, target: 1204 }),
    );
    machines.set([{ ...HORUS, state: 'reconnecting' }]);
    await set(view({ last: 1204, target: 1204, stale: true }));
    machines.set([HORUS]);
    fixture.detectChanges();
    await flush();
    await set(
      view({
        last: 1210,
        target: 1210,
        held: [sessionEvent(1212, 'session:stats', {})],
        catchingUp: true,
        recovery: 'requested',
      }),
    );
    expect(text(fixture, 'session-sync-chip')).toBe('Fetching missing events');
    expect(text(fixture, 'reconnect-banner-text')).toContain(
      'Replaying events from #1204',
    );

    await set(view({ last: 1241, target: 1241 }));
    expect(text(fixture, 'reconnect-banner-text')).toBe(
      'Replayed 37 events from #1204 to #1241 while the link was down. No gaps, duplicates removed.',
    );
    (q(fixture, 'reconnect-banner-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(fixture, 'reconnect-banner')).toBeNull();
  });

  it('never opens a remote file path on this machine', async () => {
    const { fixture } = await setup();
    await fixture.componentInstance.open({ path: '/home/horus/src/app.ts' });
    fixture.detectChanges();
    expect(text(fixture, 'remote-file-notice')).toBe(
      '/home/horus/src/app.ts is on Horus. Open it there.',
    );
  });

  it('G: an ordered list in remote markdown keeps its numbers', async () => {
    const list: FlatStreamEventUnion = {
      id: 'list-text',
      eventType: 'text_delta',
      timestamp: 1,
      messageId: 'msg-0',
      delta: '1. one\n2. two\n3. three',
      blockIndex: 0,
      source: 'history',
    };
    const { fixture } = await setup(
      view({ events: [USER_MESSAGE[0], list, ...HISTORY_MESSAGE] }),
    );
    const root = q(fixture, 'remote-transcript');
    const ol = root?.querySelector('.prose ol');
    expect(ol?.querySelectorAll('li')).toHaveLength(3);
    // Preflight sets `list-style: none` on every `ol`; the root's
    // arbitrary variant restores decimal markers for markdown lists only.
    expect(root?.classList.contains('[&_.prose_ol]:list-decimal')).toBe(true);
  });

  it('H: a denied tool reads "Failed", a finished one "Completed"', async () => {
    const tool = (callId: string, isError: boolean): FlatStreamEventUnion[] => [
      {
        id: `${callId}-start`,
        eventType: 'tool_start',
        timestamp: 2,
        messageId: 'msg-1',
        toolCallId: callId,
        toolName: 'Write',
        isTaskTool: false,
        toolInput: { file_path: '/tmp/x.txt', content: 'x' },
        source: 'history',
      },
      {
        id: `${callId}-result`,
        eventType: 'tool_result',
        timestamp: 3,
        messageId: 'msg-1',
        toolCallId: callId,
        output: isError ? "The user doesn't want to proceed." : 'Wrote file',
        isError,
        source: 'history',
      },
    ];
    const { fixture } = await setup(
      view({
        events: [
          ...USER_MESSAGE,
          ...HISTORY_MESSAGE,
          ...tool('denied', true),
          ...tool('done', false),
        ],
      }),
    );
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '[data-testid="remote-tool"]',
      ),
    );
    const status = (row: HTMLElement) =>
      row.querySelector('[data-testid="tool-status"]')?.textContent?.trim();
    expect(rows.map(status)).toEqual(['Failed', 'Completed']);
    expect(rows[0].querySelector('[data-testid="tool-failed"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="tool-failed"]')).toBeNull();
  });

  it('S6: a markdown link in remote text is inert and shows its real target', async () => {
    const deceptive: FlatStreamEventUnion = {
      id: 'link-text',
      eventType: 'text_delta',
      timestamp: 1,
      messageId: 'msg-0',
      delta: 'See [https://ptah.dev/docs](https://evil.example/steal)',
      blockIndex: 0,
      source: 'history',
    };
    const { fixture } = await setup(
      view({ events: [USER_MESSAGE[0], deceptive, ...HISTORY_MESSAGE] }),
    );
    const anchor = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLAnchorElement>('ptah-remote-transcript a');
    expect(anchor).not.toBeNull();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor?.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(text(fixture, 'remote-file-notice')).toBe(
      'Links from Horus do not open here. This one points to https://evil.example/steal.',
    );
  });

  it('S6: raw HTML and bidi characters in remote text never reach the DOM as such', async () => {
    const hostile: FlatStreamEventUnion = {
      id: 'html-text',
      eventType: 'text_delta',
      timestamp: 1,
      messageId: 'msg-0',
      delta:
        'ok <img src=x onerror="alert(1)"><script>alert(2)</script> evil\u202Etxt.exe',
      blockIndex: 0,
      source: 'history',
    };
    const { fixture, set } = await setup(view({ events: [] }));
    // Through the reducer's boundary, as a snapshot would arrive.
    const events = reduceSessionEvent(initialSessionEventState('s1'), {
      kind: 'attach-succeeded',
      result: {
        mode: 'snapshot',
        events: [USER_MESSAGE[0], hostile],
        live: false,
      },
    }).state.events;
    await set(view({ events }));
    const region = q(fixture, 'remote-transcript-region') as HTMLElement;
    expect(region.querySelector('img, script')).toBeNull();
    expect(region.textContent).not.toContain('\u202E');
    expect(region.textContent).toContain('eviltxt.exe');
  });

  it('a failed Stop shows on the composer error line', async () => {
    const { fixture, store, set } = await setup();
    await set(view({ turnId: 't1' }));
    store.stopSession.mockResolvedValueOnce({ ok: false, refused: 'not-open' });
    (q(fixture, 'remote-stop') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(text(fixture, 'remote-send-error')).toBe(
      'This session is not open.',
    );
  });
});
