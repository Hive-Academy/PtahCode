import { Clipboard } from '@angular/cdk/clipboard';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  MachineReadinessCheck,
  MachinesReadinessResult,
} from '@ptah-extension/shared';
import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import { ReadinessPanelComponent } from './readiness-panel.component';

const HORUS: RemoteMachine = {
  machineId: 'm1',
  alias: 'horus',
  displayName: 'Horus',
  state: 'connected',
};

const SEVEN_CHECKS: readonly MachineReadinessCheck[] = [
  { id: 'os', label: 'Operating system', status: 'pass', detail: 'Linux 6.8' },
  {
    id: 'node',
    label: 'Node 22 and SQLite',
    status: 'pass',
    detail: 'Node 22.4',
  },
  {
    id: 'versions',
    label: 'Versions compatible',
    status: 'pass',
    detail: 'Ptah 0.1.70, protocol 3',
  },
  {
    id: 'listener',
    label: 'Worker service reachable',
    status: 'pass',
    detail: 'Loopback 127.0.0.1:7421',
  },
  {
    id: 'workspaces',
    label: 'Workspace folders readable',
    status: 'pass',
    detail: '2 workspaces found',
  },
  {
    id: 'provider',
    label: 'Claude provider not signed in',
    status: 'fail',
    detail: 'Sign in on Horus, then re-check.',
    fix: 'claude login',
  },
  {
    id: 'lock',
    label: 'Driver lock',
    status: 'warn',
    detail: 'Desktop app is older',
    fix: 'Update the Ptah desktop app',
  },
];

const result = (
  overrides: Partial<MachinesReadinessResult> = {},
): MachinesReadinessResult => ({
  machineId: 'm1',
  remote: { ready: false, checks: SEVEN_CHECKS },
  local: { ready: true, checks: [] },
  ...overrides,
});

const ok = <T>(value: T): MachinesOutcome<T> => ({ ok: true, value });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function setup(
  outcome: MachinesOutcome<MachinesReadinessResult> = ok(result()),
) {
  TestBed.resetTestingModule();
  const store = { readiness: jest.fn().mockResolvedValue(outcome) };
  const clipboard = { copy: jest.fn().mockReturnValue(true) };
  TestBed.configureTestingModule({
    imports: [ReadinessPanelComponent],
    providers: [
      { provide: MachinesStore, useValue: store },
      { provide: Clipboard, useValue: clipboard },
    ],
  });
  const fixture = TestBed.createComponent(ReadinessPanelComponent);
  fixture.componentRef.setInput('machine', HORUS);
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
  return { fixture, store, clipboard };
}

const q = (fixture: ComponentFixture<ReadinessPanelComponent>, id: string) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${id}"]`,
  );
const checks = (fixture: ComponentFixture<ReadinessPanelComponent>) =>
  Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '[data-testid="readiness-check"]',
    ),
  );

describe('ReadinessPanelComponent', () => {
  it('loading: shows a status while the first check runs', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReadinessPanelComponent],
      providers: [
        {
          provide: MachinesStore,
          useValue: { readiness: () => new Promise(() => undefined) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ReadinessPanelComponent);
    fixture.componentRef.setInput('machine', HORUS);
    fixture.detectChanges();
    expect(q(fixture, 'readiness-loading')?.getAttribute('role')).toBe(
      'status',
    );
    expect(
      (q(fixture, 'readiness-check-again') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('lists all seven checks with a text status and mark', async () => {
    const { fixture, store } = await setup();
    expect(store.readiness).toHaveBeenCalledWith('m1');
    const rows = checks(fixture);
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('Pass · Operating system');
    expect(rows[0].textContent).toContain('Linux 6.8');
    expect(rows[5].textContent).toContain(
      'Fail · Claude provider not signed in',
    );
    expect(rows[6].textContent).toContain('Warning · Driver lock');
    expect(rows[5].querySelector('[aria-hidden="true"]')?.textContent).toBe(
      '✗',
    );
  });

  it('not ready: summary counts failing and warning checks', async () => {
    const { fixture } = await setup();
    const summary = q(fixture, 'readiness-summary');
    expect(summary?.getAttribute('role')).toBe('status');
    expect(summary?.textContent).toContain('Not ready');
    expect(summary?.textContent).toContain(
      '2 of 7 checks need your attention. Sessions cannot start on Horus until they pass.',
    );
  });

  it('shows a copyable fix only on failing and warning rows', async () => {
    const { fixture } = await setup();
    const rows = checks(fixture);
    expect(rows[0].querySelector('ptah-copy-command')).toBeNull();
    expect(
      rows[5].querySelector('[data-testid="copy-command-text"]')?.textContent,
    ).toContain('claude login');
    expect(rows[6].querySelector('ptah-copy-command')).not.toBeNull();
  });

  it('ready: says sessions can start', async () => {
    const { fixture } = await setup(
      ok(
        result({
          remote: {
            ready: true,
            checks: SEVEN_CHECKS.map((c) => ({
              ...c,
              status: 'pass' as const,
            })),
          },
        }),
      ),
    );
    const summary = q(fixture, 'readiness-summary');
    expect(summary?.textContent).toContain('Ready');
    expect(summary?.textContent).toContain('All 7 checks pass.');
  });

  it('not connected: explains that the machine checks cannot run, still lists local checks', async () => {
    const { fixture } = await setup(
      ok(
        result({
          remote: null,
          local: {
            ready: true,
            checks: [
              { id: 'lock', label: 'Driver lock self-test', status: 'pass' },
            ],
          },
        }),
      ),
    );
    expect(q(fixture, 'readiness-summary')?.textContent).toContain(
      'Horus is not connected',
    );
    expect(checks(fixture)).toHaveLength(1);
  });

  it('error: shows the sanitised failure and allows Check again', async () => {
    const { fixture, store } = await setup({
      ok: false,
      error: { message: 'timed out\u202E', code: 'MACHINE_UNREACHABLE' },
    });
    const alert = q(fixture, 'readiness-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('timed out.');
    expect(alert?.textContent).not.toContain('\u202E');
    store.readiness.mockResolvedValue(ok(result()));
    q(fixture, 'readiness-check-again')?.click();
    await flush();
    fixture.detectChanges();
    expect(store.readiness).toHaveBeenCalledTimes(2);
    expect(checks(fixture)).toHaveLength(7);
  });

  it('sanitises worker labels, details and fixes', async () => {
    const { fixture } = await setup(
      ok(
        result({
          remote: {
            ready: false,
            checks: [
              {
                id: 'x',
                label: 'Lab\u202Eel',
                status: 'fail',
                detail: 'd'.repeat(500),
                fix: 'rm\u2066 -rf',
              },
            ],
          },
        }),
      ),
    );
    const row = checks(fixture)[0];
    expect(row.textContent).toContain('Label');
    expect(row.textContent).not.toContain('d'.repeat(250));
    expect(row.textContent).not.toContain('\u2066');
  });

  it('treats an unknown status as a warning, never a pass', async () => {
    const { fixture } = await setup(
      ok(
        result({
          remote: {
            ready: false,
            checks: [
              {
                id: 'x',
                label: 'New check',
                status: 'skipped' as MachineReadinessCheck['status'],
              },
            ],
          },
        }),
      ),
    );
    expect(checks(fixture)[0].textContent).toContain('Warning · New check');
  });

  it('copies a plain-text report', async () => {
    const { fixture, clipboard } = await setup();
    q(fixture, 'readiness-copy-report')?.click();
    fixture.detectChanges();
    const report = clipboard.copy.mock.calls[0][0] as string;
    expect(report).toContain('Horus: readiness check');
    expect(report).toContain('Fail · Claude provider not signed in');
    expect(report).toContain('Fix: claude login');
    expect(q(fixture, 'readiness-copy-report')?.textContent?.trim()).toBe(
      'Copied',
    );
  });

  it('footer names WORKER_REMOTE_COMMAND status', async () => {
    const { fixture } = await setup();
    expect(q(fixture, 'readiness-footer')?.textContent).toContain(
      `${WORKER_REMOTE_COMMAND} status`,
    );
  });

  it('ignores an older answer after Check again', async () => {
    const { fixture, store } = await setup();
    let resolveFirst: (
      v: MachinesOutcome<MachinesReadinessResult>,
    ) => void = () => undefined;
    store.readiness
      .mockReturnValueOnce(
        new Promise((r) => {
          resolveFirst = r;
        }),
      )
      .mockResolvedValueOnce(
        ok(result({ remote: { ready: true, checks: [] } })),
      );
    q(fixture, 'readiness-check-again')?.click();
    (
      fixture.componentInstance as unknown as { checkAgain(): void }
    ).checkAgain();
    await flush();
    resolveFirst(ok(result()));
    await flush();
    fixture.detectChanges();
    expect(checks(fixture)).toHaveLength(0);
  });

  it('a state push for the same machine does not re-run the check', async () => {
    const { fixture, store } = await setup();
    expect(store.readiness).toHaveBeenCalledTimes(1);
    // MachinesStore replaces the machine object on every push.
    fixture.componentRef.setInput('machine', { ...HORUS, lastSeenAt: 2 });
    fixture.detectChanges();
    await flush();
    expect(store.readiness).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('machine', { ...HORUS, machineId: 'm2' });
    fixture.detectChanges();
    await flush();
    expect(store.readiness).toHaveBeenCalledTimes(2);
    expect(store.readiness).toHaveBeenLastCalledWith('m2');
  });
});
