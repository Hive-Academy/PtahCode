import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  RemoteMachineSessionSummary,
  RemoteMachineWorkspace,
} from '@ptah-extension/shared';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import {
  RemoteSessionListComponent,
  type RemoteSessionOpenRequest,
} from './remote-session-list.component';

const HORUS: RemoteMachine = {
  machineId: 'm1',
  alias: 'horus',
  displayName: 'Horus',
  state: 'connected',
};
const WORKSPACE: RemoteMachineWorkspace = {
  workspaceId: 'w1',
  name: 'ptah-extension',
  path: '~/work/ptah-extension',
};
const SESSIONS: readonly RemoteMachineSessionSummary[] = [
  {
    sessionId: 's1',
    title: 'Refactor RPC registry',
    state: 'running',
    updatedAt: Date.now() - 120_000,
    provider: 'claude',
    logged: true,
  },
  {
    sessionId: 's2',
    title: 'Migrate settings',
    state: 'interrupted',
    updatedAt: Date.now() - 14 * 60_000,
    provider: 'claude',
    logged: true,
    driver: { kind: 'desktop', label: 'Horus keyboard' },
  },
];

const ok = <T>(value: T): MachinesOutcome<T> => ({ ok: true, value });

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function setup(machine: RemoteMachine = HORUS) {
  TestBed.resetTestingModule();
  const workspaces = signal<readonly RemoteMachineWorkspace[]>([]);
  const sessions = signal<readonly RemoteMachineSessionSummary[]>([]);
  const store = {
    workspaces: () => workspaces,
    sessionsByWorkspace: () =>
      computed(() =>
        workspaces().map((workspace) => ({ workspace, sessions: sessions() })),
      ),
    loadWorkspaces: jest.fn(async () => {
      workspaces.set([WORKSPACE]);
      return ok(undefined);
    }),
    loadSessions: jest.fn(async () => {
      sessions.set(SESSIONS);
      return ok(undefined);
    }),
    startSession: jest.fn().mockResolvedValue(ok('s9')),
  };
  TestBed.configureTestingModule({
    imports: [RemoteSessionListComponent],
    providers: [{ provide: MachinesStore, useValue: store }],
  });
  const fixture = TestBed.createComponent(RemoteSessionListComponent);
  fixture.componentRef.setInput('machine', machine);
  const opened: RemoteSessionOpenRequest[] = [];
  fixture.componentInstance.opened.subscribe((r) => opened.push(r));
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
  return { fixture, store, opened, workspaces, sessions };
}

const all = (fixture: ComponentFixture<unknown>, id: string) =>
  Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      `[data-testid="${id}"]`,
    ),
  );
const q = (fixture: ComponentFixture<unknown>, id: string) =>
  all(fixture, id)[0] ?? null;

describe('RemoteSessionListComponent', () => {
  it('loads workspaces and sessions when the machine is connected', async () => {
    const { fixture, store } = await setup();
    expect(store.loadWorkspaces).toHaveBeenCalledWith('m1');
    expect(store.loadSessions).toHaveBeenCalledWith('m1', 'w1');
    // The approved section title has no machine name.
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('#ptah-remote-sessions-title')
        ?.textContent?.trim(),
    ).toBe('Sessions');
    // The approved row is flat: no workspace heading above the rows.
    expect(q(fixture, 'remote-session-workspace')).toBeNull();
    const [first] = all(fixture, 'remote-session-row');
    expect(first?.textContent).toContain('Refactor RPC registry');
    expect(first?.textContent).toContain('claude');
    expect(first?.textContent).toMatch(/\b\d+ min\b/);
    expect(all(fixture, 'remote-session-row')).toHaveLength(2);
    expect(all(fixture, 'remote-session-state').map((e) => e.textContent?.trim())).toEqual([
      'Running',
      'Interrupted',
    ]);
  });

  it('Open buttons are named per session; a driven one says watch only', async () => {
    const { fixture, opened } = await setup();
    const buttons = all(fixture, 'remote-session-open');
    // The accessible name replaces the row text, so it carries the visible
    // provider, age and state too.
    const names = buttons.map((b) => b.getAttribute('aria-label') ?? '');
    expect(names[0]).toMatch(
      /^Open session: Refactor RPC registry, claude, \d+ min, Running$/,
    );
    expect(names[1]).toMatch(
      /^Open session: Migrate settings, \S+, .+, Interrupted, driven by Horus keyboard, watch only$/,
    );
    for (const [index, button] of buttons.entries()) {
      const state = button
        .querySelector('[data-testid="remote-session-state"]')
        ?.textContent?.trim();
      expect(state).toBeTruthy();
      expect(names[index]).toContain(state);
    }
    expect(q(fixture, 'remote-session-driver')?.textContent?.trim()).toBe(
      'Driver: Horus keyboard',
    );
    buttons[0].click();
    expect(opened).toEqual([
      {
        sessionId: 's1',
        title: 'Refactor RPC registry',
        workspacePath: '~/work/ptah-extension',
      },
    ]);
  });

  it('3.4: a machine that is not connected shows Unknown, never failed, and loads nothing', async () => {
    const { fixture, store, workspaces, sessions } = await setup({
      ...HORUS,
      state: 'offline',
    });
    expect(store.loadWorkspaces).not.toHaveBeenCalled();
    expect(q(fixture, 'remote-sessions-empty')?.textContent).toContain(
      'Sessions show once Horus is connected.',
    );
    workspaces.set([WORKSPACE]);
    sessions.set(SESSIONS);
    fixture.detectChanges();
    expect(
      all(fixture, 'remote-session-state').map((e) => e.textContent?.trim()),
    ).toEqual(['Unknown', 'Unknown']);
    expect(fixture.nativeElement.textContent).not.toMatch(/failed/i);
    expect(q(fixture, 'remote-session-new')).toBeNull();
  });

  it('shows a load error with Try again', async () => {
    TestBed.resetTestingModule();
    const { fixture, store } = await setup();
    store.loadWorkspaces.mockResolvedValueOnce({
      ok: false,
      error: { message: 'The machine is unreachable.' },
    });
    (q(fixture, 'remote-sessions-reload') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    const error = q(fixture, 'remote-sessions-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('The machine is unreachable.');
  });

  it('New session starts on the chosen workspace and opens it', async () => {
    const { fixture, store, opened } = await setup();
    (q(fixture, 'remote-session-new') as HTMLButtonElement).click();
    fixture.detectChanges();
    const prompt = q(fixture, 'remote-session-new-prompt') as HTMLTextAreaElement;
    expect(prompt.placeholder).toBe('Message Claude on Horus');
    const start = q(fixture, 'remote-session-new-start') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    prompt.value = 'Write the release notes';
    prompt.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(start.disabled).toBe(false);
    start.click();
    await flush();
    fixture.detectChanges();
    expect(store.startSession).toHaveBeenCalledWith(
      'm1',
      'w1',
      'Write the release notes',
    );
    expect(opened).toEqual([
      {
        sessionId: 's9',
        title: 'Write the release notes',
        workspacePath: '~/work/ptah-extension',
      },
    ]);
    expect(q(fixture, 'remote-session-new-form')).toBeNull();
  });

  it('a state push for the same machine keeps the form open and reloads nothing', async () => {
    const { fixture, store } = await setup();
    (q(fixture, 'remote-session-new') as HTMLButtonElement).click();
    fixture.detectChanges();
    const prompt = q(
      fixture,
      'remote-session-new-prompt',
    ) as HTMLTextAreaElement;
    prompt.value = 'Draft the plan';
    prompt.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    store.loadWorkspaces.mockClear();
    store.loadSessions.mockClear();
    // MachinesStore replaces the machine object on every push.
    fixture.componentRef.setInput('machine', { ...HORUS, lastSeenAt: 2 });
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'remote-session-new-form')).not.toBeNull();
    expect(
      (q(fixture, 'remote-session-new-prompt') as HTMLTextAreaElement).value,
    ).toBe('Draft the plan');
    expect(store.loadWorkspaces).not.toHaveBeenCalled();
    expect(store.loadSessions).not.toHaveBeenCalled();
  });
});
