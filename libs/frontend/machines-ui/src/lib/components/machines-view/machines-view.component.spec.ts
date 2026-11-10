import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SURFACE_ACTIVE } from '@ptah-extension/core';
import { provideMarkdownRendering } from '@ptah-extension/markdown';
import { InboxLayoutComponent } from '@ptah-extension/ui';
import { initialSessionEventState } from '../../services/session-event-reducer';
import {
  MachinesStore,
  type MachinesError,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import { MachinesViewComponent } from './machines-view.component';

const HORUS: RemoteMachine = {
  machineId: 'm1',
  alias: 'horus',
  displayName: 'Horus',
  state: 'connected',
  versions: {
    local: { ptahVersion: '0.1.70', protocol: { min: 3, max: 3 } },
    remote: { ptahVersion: '0.1.70', protocol: { min: 3, max: 3 } },
  },
};
const ANUBIS: RemoteMachine = {
  machineId: 'm2',
  alias: 'anubis',
  displayName: 'Anubis',
  state: 'reconnecting',
  lastSeenAt: 1_000_000,
  nextRetryAt: 1_017_000,
};

const ok = <T>(value: T): MachinesOutcome<T> => ({ ok: true, value });

/** Microtask flush: works with real and fake timers alike. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function setup(
  machines: readonly RemoteMachine[] = [HORUS],
  extra: Record<string, unknown> = {},
) {
  TestBed.resetTestingModule();
  const list = signal<readonly RemoteMachine[]>(machines);
  const store = {
    machines: list,
    loading: signal(false),
    error: signal<MachinesError | null>(null),
    loadMachines: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(ok(HORUS)),
    remove: jest.fn().mockImplementation(async (id: string) => {
      list.update((all) => all.filter((m) => m.machineId !== id));
      return ok(undefined);
    }),
    readiness: jest.fn().mockResolvedValue(
      ok({
        machineId: 'm1',
        remote: { ready: true, checks: [] },
        local: { ready: true, checks: [] },
      }),
    ),
    sshAliases: jest.fn().mockResolvedValue(ok(['horus'])),
    add: jest.fn(),
    pair: jest.fn().mockResolvedValue(ok(HORUS)),
    pairViaSsh: jest.fn(),
    // Approval counts the header badge and the overview notice read (B1).
    pendingApprovalsByMachine: signal(new Map<string, number>()),
    pendingApprovalCount: signal(0),
    pendingApprovalRequestsByMachine: signal(new Map()),
    respondPermission: jest.fn().mockResolvedValue(ok(undefined)),
    // The detail's session list (Batch 25).
    workspaces: () => signal([]),
    sessionsByWorkspace: () => signal([]),
    loadWorkspaces: jest.fn().mockResolvedValue(ok(undefined)),
    loadSessions: jest.fn().mockResolvedValue(ok(undefined)),
    ...extra,
  };
  TestBed.configureTestingModule({
    imports: [MachinesViewComponent],
    providers: [
      { provide: MachinesStore, useValue: store },
      { provide: SURFACE_ACTIVE, useValue: signal(true) },
      provideMarkdownRendering({ extensions: 'basic' }),
    ],
  });
  const fixture = TestBed.createComponent(MachinesViewComponent);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
  return { fixture, store, list };
}

const host = (fixture: ComponentFixture<MachinesViewComponent>) =>
  fixture.nativeElement as HTMLElement;
const q = <T extends HTMLElement = HTMLElement>(
  fixture: ComponentFixture<MachinesViewComponent>,
  id: string,
) => host(fixture).querySelector<T>(`[data-testid="${id}"]`);
const banners = (fixture: ComponentFixture<MachinesViewComponent>) =>
  Array.from(
    host(fixture).querySelectorAll<HTMLElement>(
      '[data-testid="machine-banner"]',
    ),
  );

async function click(
  fixture: ComponentFixture<MachinesViewComponent>,
  id: string,
): Promise<void> {
  q(fixture, id)?.click();
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
}

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('MachinesViewComponent', () => {
  it('loads machines on init', async () => {
    const { store } = await setup();
    expect(store.loadMachines).toHaveBeenCalledTimes(1);
  });

  it('empty (4.1): one primary Add machine in the pane, none in the list, and what is checked', async () => {
    const { fixture } = await setup([]);
    const empty = q(fixture, 'machines-empty');
    expect(empty?.textContent).toContain('No machines yet');
    expect(empty?.textContent).toContain('nothing is opened on your network');
    expect(q(fixture, 'machines-empty-add')?.classList).toContain(
      'btn-primary',
    );
    expect(q(fixture, 'machine-list-add')).toBeNull();
    expect(
      host(fixture).querySelectorAll('[data-testid="machines-checked"] li'),
    ).toHaveLength(7);

    await click(fixture, 'machines-empty-add');
    expect(q(fixture, 'add-machine-form')).not.toBeNull();
  });

  it('selects the first machine and shows its header', async () => {
    const { fixture } = await setup([HORUS, ANUBIS]);
    const detail = q(fixture, 'machine-detail');
    expect(detail?.querySelector('h2')?.textContent).toContain('Horus');
    expect(detail?.textContent).toContain('Connected');
    expect(
      q(fixture, 'machine-detail-meta')?.textContent?.replace(/\s+/g, ' '),
    ).toContain('via SSH alias horus · ptah 0.1.70 · protocol 3');
    expect(banners(fixture)).toHaveLength(0);
    expect(q(fixture, 'machines-add')).not.toBeNull();
    expect(q(fixture, 'machines-approvals-badge')).toBeNull();
    expect(q(fixture, 'machine-approvals-waiting')).toBeNull();
  });

  it('shows the approval badge in the page header and an answerable card in the overview', async () => {
    const request = {
      id: 'p1',
      toolName: 'Bash',
      toolInput: { command: 'npm run migrate' },
      toolUseId: 'tu1',
      timestamp: Date.now(),
      description: 'Run a command',
    };
    const { fixture, store } = await setup([HORUS], {
      pendingApprovalsByMachine: signal(new Map([['m1', 1]])),
      pendingApprovalCount: signal(1),
      pendingApprovalRequestsByMachine: signal(
        new Map([['m1', [{ sessionId: 's1', request, mode: 'answerable' }]]]),
      ),
    });
    expect(q(fixture, 'machines-approvals-badge')?.textContent).toContain(
      '1 approval waiting',
    );
    const card = q(fixture, 'machine-approvals-waiting');
    expect(card?.textContent).toContain('Bash');
    expect(card?.textContent).toContain('npm run migrate');
    q(fixture, 'approval-allow')?.click();
    await fixture.whenStable();
    expect(store.respondPermission).toHaveBeenCalledWith(
      'm1',
      's1',
      'p1',
      'allow',
    );
  });

  it('overview approval cards give no answer for watch-only and cached sessions', async () => {
    const request = (id: string) => ({
      id,
      toolName: 'Bash',
      toolInput: { command: 'npm run migrate' },
      toolUseId: `tu-${id}`,
      timestamp: Date.now(),
      description: 'Run a command',
    });
    const { fixture, store } = await setup([HORUS], {
      pendingApprovalRequestsByMachine: signal(
        new Map([
          [
            'm1',
            [
              { sessionId: 's1', request: request('p1'), mode: 'watch-only' },
              { sessionId: 's2', request: request('p2'), mode: 'cached' },
            ],
          ],
        ]),
      ),
    });
    const card = q(fixture, 'machine-approvals-waiting');
    expect(card?.textContent).toContain('Waiting at Horus');
    expect(card?.textContent).toContain('Saved request');
    const enabled = Array.from(
      card?.querySelectorAll<HTMLButtonElement>(
        '[data-testid="approval-allow"], [data-testid="approval-deny"]',
      ) ?? [],
    ).filter((button) => !button.disabled);
    expect(enabled).toHaveLength(0);
    expect(store.respondPermission).not.toHaveBeenCalled();
  });

  it('overview approval cards name a machine without a display name by its alias', async () => {
    const request = {
      id: 'p1',
      toolName: 'Bash',
      toolInput: { command: 'npm run migrate' },
      toolUseId: 'tu1',
      timestamp: Date.now(),
      description: 'Run a command',
    };
    const { fixture } = await setup(
      [{ ...HORUS, displayName: '', state: 'offline' }],
      {
        pendingApprovalRequestsByMachine: signal(
          new Map([['m1', [{ sessionId: 's1', request, mode: 'answerable' }]]]),
        ),
      },
    );
    expect(q(fixture, 'machine-approvals-waiting')?.textContent).toContain(
      'horus is not connected.',
    );
  });

  it('overview approval cards are disabled while the machine is not connected', async () => {
    const request = {
      id: 'p1',
      toolName: 'Bash',
      toolInput: { command: 'npm run migrate' },
      toolUseId: 'tu1',
      timestamp: Date.now(),
      description: 'Run a command',
    };
    const { fixture, store } = await setup([{ ...HORUS, state: 'offline' }], {
      pendingApprovalRequestsByMachine: signal(
        new Map([['m1', [{ sessionId: 's1', request, mode: 'answerable' }]]]),
      ),
    });
    const card = q(fixture, 'machine-approvals-waiting');
    expect(card?.textContent).toContain('Horus is not connected.');
    const allow = q<HTMLButtonElement>(fixture, 'approval-allow');
    expect(allow?.disabled).toBe(true);
    allow?.click();
    // An offline machine keeps a timer, so the fixture never becomes stable.
    await flush();
    expect(store.respondPermission).not.toHaveBeenCalled();
  });

  it('narrow: selecting a machine opens the detail pane; "All machines" returns to the list', async () => {
    const { fixture } = await setup([HORUS, ANUBIS]);
    const shell = fixture.debugElement.query(
      (node) => node.name === 'ptah-inbox-layout',
    );
    const detailOpen = () =>
      (shell?.componentInstance as InboxLayoutComponent).detailOpen();
    expect(detailOpen()).toBe(false);

    host(fixture)
      .querySelectorAll<HTMLButtonElement>('[data-testid="machine-row"]')[1]
      .click();
    fixture.detectChanges();
    expect(detailOpen()).toBe(true);

    await click(fixture, 'machines-narrow-back');
    expect(detailOpen()).toBe(false);
    // Only the narrow flag cleared; the machine stays selected.
    expect(
      q(fixture, 'machine-detail')?.querySelector('h2')?.textContent,
    ).toContain('Anubis');
  });

  it('selecting a row shows that machine', async () => {
    const { fixture } = await setup([HORUS, ANUBIS]);
    host(fixture)
      .querySelectorAll<HTMLButtonElement>('[data-testid="machine-row"]')[1]
      .click();
    fixture.detectChanges();
    expect(
      q(fixture, 'machine-detail')?.querySelector('h2')?.textContent,
    ).toContain('Anubis');
  });

  it('reconnecting: status banner says sessions are unknown, not failed, and counts down', async () => {
    jest.useFakeTimers({ now: 1_012_000 });
    const { fixture, store } = await setup([ANUBIS]);
    const [banner] = banners(fixture);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Lost contact 12 s ago.');
    expect(banner.textContent).toContain('shown as unknown, not failed');
    expect(banner.textContent).toContain('Next attempt in 5 s.');

    jest.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(banners(fixture)[0].textContent).toContain('Lost contact 14 s ago.');
    expect(banners(fixture)[0].textContent).toContain('Next attempt in 3 s.');

    await click(fixture, 'machine-retry');
    expect(store.retry).toHaveBeenCalledWith('m2');
  });

  it('runs no clock while the selected machine is connected, and stops it on destroy', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const stopped = jest.spyOn(globalThis, 'clearInterval');
    const { fixture, list } = await setup([ANUBIS]);
    const clockStarts = () =>
      started.mock.calls.filter(([, ms]) => ms === 1000).length;
    expect(clockStarts()).toBe(1);

    const stopsBefore = stopped.mock.calls.length;
    list.set([{ ...ANUBIS, state: 'connected' }]);
    fixture.detectChanges();
    await flush();
    expect(stopped.mock.calls.length).toBeGreaterThan(stopsBefore);

    list.set([ANUBIS]);
    fixture.detectChanges();
    expect(clockStarts()).toBe(2);
    const stopsAtDestroy = stopped.mock.calls.length;
    fixture.destroy();
    expect(stopped.mock.calls.length).toBeGreaterThan(stopsAtDestroy);
    started.mockRestore();
    stopped.mockRestore();
  });

  it('version mismatch: alert names both versions', async () => {
    const { fixture } = await setup([
      {
        ...HORUS,
        displayName: 'Chappie',
        state: 'version-mismatch',
        versions: {
          local: { ptahVersion: '0.1.70', protocol: { min: 3, max: 3 } },
          remote: { ptahVersion: '0.1.60', protocol: { min: 2, max: 2 } },
        },
      },
    ]);
    const [banner] = banners(fixture);
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('Version mismatch');
    expect(banner.textContent).toContain('Ptah 0.1.70');
    expect(banner.textContent).toContain(
      'Chappie runs Ptah 0.1.60, protocol 2',
    );
    expect(banner.textContent).toContain('Not connected.');
  });

  it('version mismatch without a remote version uses the no-worker-mode copy', async () => {
    const { fixture } = await setup([
      { ...HORUS, state: 'version-mismatch', versions: undefined },
    ]);
    expect(banners(fixture)[0].textContent).toContain(
      'This Ptah build on Horus has no worker mode. Update the Ptah desktop app there.',
    );
  });

  it.each([
    [
      'worker-identity-changed',
      'A different worker answers on this alias — re-pair this machine.',
    ],
    ['re-pair-required', 'Pairing expired — re-pair this machine.'],
  ] as const)(
    'reason %s: fixed copy and a Re-pair that opens the pair flow',
    async (reason, copy) => {
      const { fixture, store } = await setup([
        { ...HORUS, state: 'unpaired', reason },
      ]);
      const all = banners(fixture);
      expect(all).toHaveLength(1);
      expect(all[0].textContent).toContain(copy);
      expect(q(fixture, 'machine-repair')?.textContent?.trim()).toBe('Re-pair');

      await click(fixture, 'machine-repair');
      const alias = q<HTMLInputElement>(fixture, 'add-machine-alias');
      expect(alias?.readOnly).toBe(true);
      expect(alias?.value).toBe('horus');

      host(fixture)
        .querySelectorAll<HTMLInputElement>(
          '[data-testid="add-machine-code-cell"]',
        )
        .forEach((cell, i) => {
          cell.value = 'K7QM4X2P'[i];
          cell.dispatchEvent(new Event('input'));
        });
      q(fixture, 'add-machine-form')?.dispatchEvent(
        new Event('submit', { cancelable: true }),
      );
      await flush();
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      expect(store.add).not.toHaveBeenCalled();
      expect(store.pair).toHaveBeenCalledWith('m1', 'K7QM4X2P');
      // Pairing success goes straight to the readiness check (4.2).
      expect(
        host(fixture).querySelector('ptah-readiness-panel'),
      ).not.toBeNull();
    },
  );

  it('reason session-reattach-failed: fixed copy and Retry now', async () => {
    const { fixture, store } = await setup([
      { ...HORUS, reason: 'session-reattach-failed' },
    ]);
    const [banner] = banners(fixture);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain(
      'A session could not re-attach — retry.',
    );
    await click(fixture, 'machine-retry');
    expect(store.retry).toHaveBeenCalledWith('m1');
  });

  it('unpaired without a reason offers Pair', async () => {
    const { fixture } = await setup([{ ...HORUS, state: 'unpaired' }]);
    expect(banners(fixture)[0].textContent).toContain('Not paired');
    expect(q(fixture, 'machine-repair')?.textContent?.trim()).toBe('Pair');
  });

  it('remove: confirms with the token and tunnel text, focuses Cancel, then removes', async () => {
    const { fixture, store } = await setup([HORUS]);
    await click(fixture, 'machine-remove');
    const dialog = q(fixture, 'machine-remove-confirm');
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.textContent).toContain(
      'Deletes the stored token and stops the tunnel.',
    );
    expect(document.activeElement).toBe(
      q(fixture, 'machine-remove-confirm-no'),
    );

    await click(fixture, 'machine-remove-confirm-yes');
    expect(store.remove).toHaveBeenCalledWith('m1');
    expect(q(fixture, 'machines-empty')).not.toBeNull();
  });

  it('remove failure shows a sanitised alert and keeps the machine', async () => {
    const { fixture, store } = await setup([HORUS]);
    store.remove.mockResolvedValue({
      ok: false,
      error: { message: 'worker\u202E gone', code: 'MACHINE_UNREACHABLE' },
    });
    await click(fixture, 'machine-remove');
    await click(fixture, 'machine-remove-confirm-yes');
    const alert = q(fixture, 'machine-action-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('worker gone.');
    expect(q(fixture, 'machine-detail')).not.toBeNull();
  });

  it('opens the readiness check and goes back', async () => {
    const { fixture, store } = await setup([HORUS]);
    await click(fixture, 'machine-readiness');
    expect(store.readiness).toHaveBeenCalledWith('m1');
    expect(host(fixture).querySelector('ptah-readiness-panel')).not.toBeNull();
    await click(fixture, 'machines-back');
    expect(q(fixture, 'machine-detail')).not.toBeNull();
  });

  it('add machine from the header opens the form; cancel closes it', async () => {
    const { fixture } = await setup([HORUS]);
    await click(fixture, 'machines-add');
    expect(q(fixture, 'add-machine-form')).not.toBeNull();
    await click(fixture, 'add-machine-cancel');
    expect(q(fixture, 'machine-detail')).not.toBeNull();
  });
});

describe('MachinesViewComponent remote sessions', () => {
  it('opens a listed session in the pane and goes back to the machine', async () => {
    const workspace = {
      workspaceId: 'w1',
      name: 'notes',
      path: '~/work/notes',
    };
    const session = {
      sessionId: 's1',
      title: 'Summarise sprint log',
      state: 'idle' as const,
      updatedAt: 1,
      provider: 'claude',
      logged: true,
    };
    const openSession = jest.fn().mockResolvedValue(ok(undefined));
    const closeSession = jest.fn().mockResolvedValue(ok(undefined));
    const { fixture } = await setup([HORUS], {
      workspaces: () => signal([workspace]),
      sessionsByWorkspace: () => signal([{ workspace, sessions: [session] }]),
      machine: () => computed(() => HORUS),
      sessionView: () =>
        signal({
          ...initialSessionEventState('s1'),
          mode: 'log',
          machineId: 'm1',
          machineState: 'connected',
          stale: false,
          watchOnly: false,
          lockUnavailable: false,
          catchingUp: false,
          error: null,
        }),
      openSession,
      closeSession,
    });
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('[data-testid="remote-session-open"]')
      ?.click();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(openSession).toHaveBeenCalledWith('m1', 's1');
    expect(
      element
        .querySelector('[data-testid="remote-session-title"]')
        ?.textContent?.trim(),
    ).toBe('Summarise sprint log');

    element
      .querySelector<HTMLButtonElement>('[data-testid="machines-session-back"]')
      ?.click();
    fixture.detectChanges();
    expect(closeSession).toHaveBeenCalledWith('m1', 's1');
    expect(
      element.querySelector('[data-testid="remote-session-list"]'),
    ).not.toBeNull();
  });
});
