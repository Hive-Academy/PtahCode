import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  MachinesError,
  RemoteMachine,
} from '../../services/machines-store';
import { MachineListComponent } from './machine-list.component';

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
  lastSeenAt: 88_000,
};
const CHAPPIE: RemoteMachine = {
  machineId: 'm3',
  alias: 'chappie',
  displayName: 'Chappie',
  state: 'version-mismatch',
};

function render(
  inputs: Partial<{
    machines: readonly RemoteMachine[];
    selectedId: string | null;
    loading: boolean;
    error: MachinesError | null;
    now: number;
  }> = {},
): ComponentFixture<MachineListComponent> {
  TestBed.configureTestingModule({ imports: [MachineListComponent] });
  const fixture = TestBed.createComponent(MachineListComponent);
  fixture.componentRef.setInput('machines', inputs.machines ?? []);
  for (const [key, value] of Object.entries(inputs)) {
    if (key !== 'machines') fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<MachineListComponent>) =>
  fixture.nativeElement as HTMLElement;
const rows = (fixture: ComponentFixture<MachineListComponent>) =>
  Array.from(
    el(fixture).querySelectorAll<HTMLButtonElement>(
      '[data-testid="machine-row"]',
    ),
  );
const search = (fixture: ComponentFixture<MachineListComponent>) =>
  el(fixture).querySelector<HTMLInputElement>(
    '[data-testid="machine-list-search"]',
  )!;
const type = (
  fixture: ComponentFixture<MachineListComponent>,
  text: string,
) => {
  const input = search(fixture);
  input.value = text;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
};

describe('MachineListComponent', () => {
  it('empty: says so, keeps the add control ghost, and names the local machine footer', () => {
    const fixture = render();
    expect(el(fixture).textContent).toContain('No machines yet.');
    expect(el(fixture).textContent).toContain('This machine stays in Chat.');
    const add = el(fixture).querySelector('[data-testid="machine-list-add"]');
    expect(add?.classList).toContain('btn-ghost');
    expect(add?.classList).not.toContain('btn-primary');
  });

  it('loading: announces a busy status with three skeleton rows', () => {
    const host = el(render({ loading: true }));
    const status = host.querySelector('[data-testid="machine-list-loading"]');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.querySelectorAll('.skeleton')).toHaveLength(3);
  });

  it('error: shows the sanitised message and a retry', () => {
    const fixture = render({
      error: { message: 'boom‮', code: 'MACHINE_UNREACHABLE' },
    });
    const retries: void[] = [];
    fixture.componentInstance.retryLoad.subscribe(() =>
      retries.push(undefined),
    );
    const alert = el(fixture).querySelector(
      '[data-testid="machine-list-error"]',
    );
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('boom');
    expect(alert?.textContent).not.toContain('‮');
    el(fixture)
      .querySelector<HTMLButtonElement>('[data-testid="machine-list-retry"]')
      ?.click();
    expect(retries).toHaveLength(1);
  });

  it('lists machines as listbox options with name, alias, state and meta line', () => {
    const fixture = render({
      machines: [HORUS, ANUBIS, CHAPPIE],
      selectedId: 'm1',
      now: 100_000,
    });
    const listbox = el(fixture).querySelector('[role="listbox"]');
    expect(listbox?.getAttribute('aria-label')).toBe('Machine list');
    const [horus, anubis, chappie] = rows(fixture);
    expect(horus.textContent).toContain('Horus');
    expect(horus.textContent).toContain('horus');
    expect(horus.textContent).toContain('Connected');
    expect(horus.textContent).toContain('ptah 0.1.70');
    expect(anubis.textContent).toContain('Reconnecting');
    expect(anubis.textContent).toContain('Last seen 12 s ago');
    expect(chappie.textContent).toContain('Version mismatch');
    expect(chappie.textContent).toContain('Not connected');
    const add = el(fixture).querySelector('[data-testid="machine-list-add"]');
    expect(add?.classList).toContain('btn-primary');
  });

  it('marks the selected row and keeps one Tab stop', () => {
    const fixture = render({ machines: [HORUS, ANUBIS], selectedId: 'm2' });
    const [horus, anubis] = rows(fixture);
    expect(anubis.getAttribute('aria-current')).toBe('true');
    expect(horus.getAttribute('aria-current')).toBeNull();
    expect(anubis.getAttribute('aria-selected')).toBe('true');
    expect(horus.getAttribute('aria-selected')).toBe('false');
    expect(anubis.getAttribute('tabindex')).toBe('0');
    expect(horus.getAttribute('tabindex')).toBe('-1');
  });

  it('moves focus with arrow keys and selects on click', () => {
    const fixture = render({ machines: [HORUS, ANUBIS, CHAPPIE] });
    const picked: string[] = [];
    fixture.componentInstance.selected.subscribe((id) => picked.push(id));
    document.body.appendChild(el(fixture));
    const key = (index: number, name: string) =>
      rows(fixture)[index].dispatchEvent(
        new KeyboardEvent('keydown', { key: name, cancelable: true }),
      );

    key(0, 'ArrowDown');
    fixture.detectChanges();
    expect(document.activeElement).toBe(rows(fixture)[1]);
    expect(rows(fixture)[1].getAttribute('tabindex')).toBe('0');

    key(1, 'End');
    fixture.detectChanges();
    expect(document.activeElement).toBe(rows(fixture)[2]);

    key(2, 'Home');
    fixture.detectChanges();
    expect(document.activeElement).toBe(rows(fixture)[0]);

    rows(fixture)[2].click();
    expect(picked).toEqual(['m3']);
    el(fixture).remove();
  });

  it('search filters rows by name and alias, and says so when nothing matches', () => {
    const fixture = render({ machines: [HORUS, ANUBIS, CHAPPIE] });

    type(fixture, 'anu');
    expect(rows(fixture)).toHaveLength(1);
    expect(rows(fixture)[0].textContent).toContain('Anubis');

    type(fixture, 'HOR');
    expect(rows(fixture)).toHaveLength(1);
    expect(rows(fixture)[0].textContent).toContain('Horus');

    type(fixture, 'zzz');
    expect(rows(fixture)).toHaveLength(0);
    const noMatch = el(fixture).querySelector(
      '[data-testid="machine-list-no-match"]',
    );
    expect(noMatch?.textContent).toContain('No machine matches "zzz".');

    type(fixture, '');
    expect(rows(fixture)).toHaveLength(3);
  });

  it('sanitises worker-supplied names', () => {
    const fixture = render({
      machines: [{ ...HORUS, displayName: 'Ho‮rus\n' + 'x'.repeat(120) }],
    });
    const name = rows(fixture)[0].querySelector('.font-medium');
    expect(name?.textContent).not.toContain('‮');
    expect(Array.from(name?.textContent ?? '').length).toBeLessThanOrEqual(80);
  });

  it('emits add', () => {
    const fixture = render();
    const adds: void[] = [];
    fixture.componentInstance.add.subscribe(() => adds.push(undefined));
    el(fixture)
      .querySelector<HTMLButtonElement>('[data-testid="machine-list-add"]')
      ?.click();
    expect(adds).toHaveLength(1);
  });
});
