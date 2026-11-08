import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';
import type { RpcUserErrorCode } from '@ptah-extension/shared';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import { AddMachinePaneComponent } from './add-machine-pane.component';

const UNPAIRED: RemoteMachine = {
  machineId: 'm1',
  alias: 'horus',
  displayName: 'Horus',
  state: 'unpaired',
};
const CONNECTED: RemoteMachine = { ...UNPAIRED, state: 'connected' };

const ok = <T>(value: T): MachinesOutcome<T> => ({ ok: true, value });
const fail = (
  message: string,
  code?: RpcUserErrorCode,
): MachinesOutcome<RemoteMachine> => ({
  ok: false,
  error: { message, ...(code ? { code } : {}) },
});
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function setup(
  options: {
    machine?: RemoteMachine | null;
    machines?: readonly RemoteMachine[];
    aliases?: MachinesOutcome<readonly string[]>;
  } = {},
) {
  TestBed.resetTestingModule();
  const store = {
    machines: signal(options.machines ?? []),
    sshAliases: jest
      .fn()
      .mockResolvedValue(
        options.aliases ?? ok(['horus', 'anubis', '-oProxyCommand=x']),
      ),
    add: jest.fn().mockResolvedValue(ok(UNPAIRED)),
    pair: jest.fn().mockResolvedValue(ok(CONNECTED)),
    pairViaSsh: jest.fn().mockResolvedValue(ok(CONNECTED)),
  };
  TestBed.configureTestingModule({
    imports: [AddMachinePaneComponent],
    providers: [{ provide: MachinesStore, useValue: store }],
  });
  const fixture = TestBed.createComponent(AddMachinePaneComponent);
  if (options.machine !== undefined)
    fixture.componentRef.setInput('machine', options.machine);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
  const paired: RemoteMachine[] = [];
  const cancelled: void[] = [];
  fixture.componentInstance.paired.subscribe((m) => paired.push(m));
  fixture.componentInstance.cancelled.subscribe(() =>
    cancelled.push(undefined),
  );
  return { fixture, store, paired, cancelled };
}

const host = (fixture: ComponentFixture<AddMachinePaneComponent>) =>
  fixture.nativeElement as HTMLElement;
const q = <T extends HTMLElement>(
  fixture: ComponentFixture<AddMachinePaneComponent>,
  id: string,
) => host(fixture).querySelector<T>(`[data-testid="${id}"]`);
const cells = (fixture: ComponentFixture<AddMachinePaneComponent>) =>
  Array.from(
    host(fixture).querySelectorAll<HTMLInputElement>(
      '[data-testid="add-machine-code-cell"]',
    ),
  );

function typeAlias(
  fixture: ComponentFixture<AddMachinePaneComponent>,
  value: string,
): void {
  const input = q<HTMLInputElement>(fixture, 'add-machine-alias');
  if (!input) throw new Error('alias input missing');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function paste(target: HTMLInputElement, text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  });
  target.dispatchEvent(event);
}

async function submit(
  fixture: ComponentFixture<AddMachinePaneComponent>,
): Promise<void> {
  q<HTMLFormElement>(fixture, 'add-machine-form')?.dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  fixture.detectChanges();
  await flush();
  fixture.detectChanges();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AddMachinePaneComponent', () => {
  it('suggests valid SSH aliases in a datalist and allows free text', async () => {
    const { fixture } = await setup();
    const options = Array.from(
      host(fixture).querySelectorAll<HTMLOptionElement>(
        '[data-testid="add-machine-aliases"] option',
      ),
    ).map((o) => o.value);
    expect(options).toEqual(['horus', 'anubis']);
    const alias = q<HTMLInputElement>(fixture, 'add-machine-alias');
    expect(alias?.getAttribute('list')).toBe(
      q(fixture, 'add-machine-aliases')?.id,
    );
    expect(alias?.readOnly).toBe(false);
  });

  it('keeps working without suggestions when the alias list fails', async () => {
    const { fixture } = await setup({
      aliases: { ok: false, error: { message: 'no config' } },
    });
    expect(
      host(fixture).querySelectorAll(
        '[data-testid="add-machine-aliases"] option',
      ),
    ).toHaveLength(0);
    expect(q(fixture, 'add-machine-failure')).toBeNull();
  });

  it('shows the pairing command built from WORKER_REMOTE_COMMAND', async () => {
    const { fixture } = await setup();
    expect(q(fixture, 'copy-command-text')?.textContent?.trim()).toBe(
      `${WORKER_REMOTE_COMMAND} pair`,
    );
    expect(host(fixture).textContent).toContain('expires in 5 minutes');
  });

  it('renders 8 labelled code cells', async () => {
    const { fixture } = await setup();
    const all = cells(fixture);
    expect(all).toHaveLength(8);
    expect(all.map((c) => c.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 8 }, (_, i) => `Character ${i + 1}`),
    );
  });

  it('paste of a whole code fills every cell, whatever cell has focus', async () => {
    const { fixture } = await setup();
    paste(cells(fixture)[3], ' k7qm-4x2p ');
    fixture.detectChanges();
    expect(
      cells(fixture)
        .map((c) => c.value)
        .join(''),
    ).toBe('K7QM4X2P');
    expect(document.activeElement).toBe(cells(fixture)[7]);
  });

  it('typing advances and Backspace on an empty cell moves back', async () => {
    const { fixture } = await setup();
    const [first, second] = cells(fixture);
    first.value = 'k';
    first.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(first.value).toBe('K');
    expect(document.activeElement).toBe(second);

    second.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }),
    );
    fixture.detectChanges();
    expect(document.activeElement).toBe(first);
    expect(first.value).toBe('');
  });

  it('refuses an incomplete code without calling the machine', async () => {
    const { fixture, store } = await setup();
    typeAlias(fixture, 'horus');
    paste(cells(fixture)[0], 'K7QM');
    await submit(fixture);
    expect(q(fixture, 'add-machine-code-error')?.textContent).toContain(
      'Enter all 8 characters',
    );
    expect(store.add).not.toHaveBeenCalled();
    expect(store.pair).not.toHaveBeenCalled();
  });

  it('refuses an alias that is not an SSH Host name', async () => {
    const { fixture, store } = await setup();
    typeAlias(fixture, '-oProxyCommand=evil');
    paste(cells(fixture)[0], 'K7QM4X2P');
    await submit(fixture);
    expect(q(fixture, 'add-machine-alias-error')).not.toBeNull();
    expect(store.add).not.toHaveBeenCalled();
  });

  it('success: adds the alias, pairs with the normalised code and emits paired', async () => {
    const { fixture, store, paired } = await setup();
    typeAlias(fixture, 'horus');
    paste(cells(fixture)[0], 'k7qm-4x2p');
    await submit(fixture);
    expect(store.add).toHaveBeenCalledWith('horus');
    expect(store.pair).toHaveBeenCalledWith('m1', 'K7QM4X2P');
    expect(paired).toEqual([CONNECTED]);
  });

  it('reuses a registered unpaired machine with the same alias', async () => {
    const { fixture, store } = await setup({ machines: [UNPAIRED] });
    typeAlias(fixture, 'horus');
    paste(cells(fixture)[0], 'K7QM4X2P');
    await submit(fixture);
    expect(store.add).not.toHaveBeenCalled();
    expect(store.pair).toHaveBeenCalledWith('m1', 'K7QM4X2P');
  });

  it('pairing: the button says Pairing... and is disabled; Cancel stays enabled', async () => {
    const { fixture, store, cancelled } = await setup();
    let resolve: (value: MachinesOutcome<RemoteMachine>) => void = () =>
      undefined;
    store.pair.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    typeAlias(fixture, 'horus');
    paste(cells(fixture)[0], 'K7QM4X2P');
    await submit(fixture);
    const button = q<HTMLButtonElement>(fixture, 'add-machine-submit');
    expect(button?.textContent?.trim()).toBe('Pairing...');
    expect(button?.disabled).toBe(true);
    expect(q<HTMLButtonElement>(fixture, 'add-machine-ssh')?.disabled).toBe(
      true,
    );
    const cancel = q<HTMLButtonElement>(fixture, 'add-machine-cancel');
    expect(cancel?.disabled).toBe(false);
    cancel?.click();
    expect(cancelled).toHaveLength(1);
    resolve(ok(CONNECTED));
    await flush();
  });

  it('rejected code: 4.3 banner without a cause or an attempts count, cells invalid, focus on the first', async () => {
    const { fixture, store } = await setup();
    store.pair.mockResolvedValue(
      fail('Pairing rejected', 'MACHINE_PAIRING_REJECTED'),
    );
    typeAlias(fixture, 'horus');
    paste(cells(fixture)[0], 'K7QM4X2P');
    await submit(fixture);
    const banner = q(fixture, 'add-machine-failure');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent).toContain('Pairing failed');
    expect(banner?.textContent).toContain(
      'It may be wrong, expired or already used; Ptah cannot tell which.',
    );
    expect(banner?.textContent).toContain('open a new one on horus');
    expect(banner?.textContent).not.toMatch(/attempts? left/);
    expect(q(fixture, 'add-machine-nothing-stored')?.textContent).toContain(
      'Nothing was stored. No token exists for horus on this machine.',
    );
    expect(
      cells(fixture).every((c) => c.getAttribute('aria-invalid') === 'true'),
    ).toBe(true);
    expect(document.activeElement).toBe(cells(fixture)[0]);
  });

  it('pair automatically via SSH needs no code and shows the SSH message with its attempts count', async () => {
    const { fixture, store } = await setup();
    store.pairViaSsh.mockResolvedValue(
      fail(
        'Pairing window closed (2 attempts left)',
        'MACHINE_PAIRING_REJECTED',
      ),
    );
    typeAlias(fixture, 'horus');
    q<HTMLButtonElement>(fixture, 'add-machine-ssh')?.click();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(store.pairViaSsh).toHaveBeenCalledWith('m1');
    expect(store.pair).not.toHaveBeenCalled();
    expect(q(fixture, 'add-machine-failure')?.textContent).toContain(
      '2 attempts left',
    );
  });

  it('cannot reach host: names the alias and the SSH message', async () => {
    const { fixture, store } = await setup();
    store.pairViaSsh.mockResolvedValue(
      fail('connection timed out', 'MACHINE_UNREACHABLE'),
    );
    typeAlias(fixture, 'horus');
    q<HTMLButtonElement>(fixture, 'add-machine-ssh')?.click();
    await flush();
    fixture.detectChanges();
    const banner = q(fixture, 'add-machine-failure');
    expect(banner?.textContent).toContain('Cannot reach host');
    expect(banner?.textContent).toContain(
      'SSH to horus failed: connection timed out. Check the alias',
    );
    expect(q(fixture, 'add-machine-nothing-stored')).toBeNull();
  });

  it('version mismatch with no message falls back to the no-worker-mode copy', async () => {
    const { fixture, store } = await setup();
    store.pairViaSsh.mockResolvedValue(fail('', 'MACHINE_VERSION_MISMATCH'));
    typeAlias(fixture, 'horus');
    q<HTMLButtonElement>(fixture, 'add-machine-ssh')?.click();
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'add-machine-failure')?.textContent).toContain(
      'This Ptah build on horus has no worker mode. Update the Ptah desktop app there.',
    );
  });

  it('sanitises worker error text', async () => {
    const { fixture, store } = await setup();
    store.pairViaSsh.mockResolvedValue(
      fail('bad\u202Ehost\n\n' + 'z'.repeat(400), 'MACHINE_UNREACHABLE'),
    );
    typeAlias(fixture, 'horus');
    q<HTMLButtonElement>(fixture, 'add-machine-ssh')?.click();
    await flush();
    fixture.detectChanges();
    const text = q(fixture, 'add-machine-failure')?.textContent ?? '';
    expect(text).not.toContain('\u202E');
    expect(text).not.toContain('z'.repeat(250));
  });

  it('re-pair: alias is fixed, the reason copy shows, and no machine is added', async () => {
    const { fixture, store, paired } = await setup({
      machine: { ...UNPAIRED, reason: 'worker-identity-changed' },
    });
    expect(host(fixture).textContent).toContain('Re-pair Horus');
    expect(q(fixture, 'add-machine-reason')?.textContent).toContain(
      'A different worker answers on this alias — re-pair this machine.',
    );
    const alias = q<HTMLInputElement>(fixture, 'add-machine-alias');
    expect(alias?.readOnly).toBe(true);
    expect(alias?.value).toBe('horus');
    paste(cells(fixture)[0], 'K7QM4X2P');
    await submit(fixture);
    expect(store.add).not.toHaveBeenCalled();
    expect(store.pair).toHaveBeenCalledWith('m1', 'K7QM4X2P');
    expect(paired).toHaveLength(1);
  });

  it('an alias that is already connected is not paired again', async () => {
    const { fixture, store } = await setup({ machines: [CONNECTED] });
    typeAlias(fixture, 'horus');
    q<HTMLButtonElement>(fixture, 'add-machine-ssh')?.click();
    await flush();
    fixture.detectChanges();
    expect(q(fixture, 'add-machine-failure')?.textContent).toContain(
      'already added and connected',
    );
    expect(store.pairViaSsh).not.toHaveBeenCalled();
  });

  it('Escape and Cancel emit cancelled', async () => {
    const { fixture, cancelled } = await setup();
    q(fixture, 'add-machine-form')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    q<HTMLButtonElement>(fixture, 'add-machine-cancel')?.click();
    expect(cancelled).toHaveLength(2);
  });
});
