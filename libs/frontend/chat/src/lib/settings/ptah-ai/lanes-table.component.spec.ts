import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  LanesTableComponent,
  type LaneTableRow,
} from './lanes-table.component';

const instance = (
  id: string,
  patch: Partial<Extract<LaneTableRow, { kind: 'instance' }>> = {},
): LaneTableRow => ({
  kind: 'instance',
  id,
  name: `Lane ${id}`,
  status: { kind: 'ready', label: 'Ready', tone: 'success' },
  enabled: true,
  interactive: true,
  permission: { label: 'Ask', detail: 'Ask before edits' },
  runtimeStatus: null,
  providerId: 'local',
  provider: 'Local',
  keyStatus: { kind: 'keyless', label: 'No key needed' },
  tiers: [],
  selectedModel: null,
  effort: '',
  lastTest: null,
  ...patch,
});

const system = (
  id: 'codex' | 'copilot',
  patch: Partial<Extract<LaneTableRow, { kind: 'system' }>> = {},
): LaneTableRow => ({
  kind: 'system',
  id,
  name: id === 'codex' ? 'Codex' : 'Copilot',
  status: { kind: 'ready', label: 'Ready', tone: 'success' },
  enabled: true,
  interactive: true,
  permission: { label: 'Ask', detail: 'Ask before edits' },
  cli: id,
  installed: true,
  version: '1.2.3',
  versionLabel: 'v1.2.3',
  codexStatusLine: null,
  provider: null,
  model: { key: 'codexModel', value: '' },
  effort: null,
  credentialAction: false,
  ...patch,
});

const uninstalled = (id: 'codex' | 'copilot'): LaneTableRow =>
  system(id, {
    installed: false,
    enabled: false,
    version: null,
    versionLabel: null,
    status: { kind: 'not-installed', label: 'Not installed', tone: 'neutral' },
  });

async function mount(
  rows: readonly LaneTableRow[],
  orderMode = false,
): Promise<{
  fixture: ComponentFixture<LanesTableComponent>;
  host: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [LanesTableComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(LanesTableComponent);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('orderMode', orderMode);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

const q = (host: HTMLElement, sel: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(sel);

describe('LanesTableComponent', () => {
  it('keeps instance row hooks and emits toggle and actions', async () => {
    const row = instance('local-one', { name: 'Local one' });
    const { fixture, host } = await mount([row]);
    const toggled = jest.fn();
    const tested = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    fixture.componentInstance.test.subscribe(tested);

    expect(q(host, '[data-testid="cli-matrix-row-local-one"]')).not.toBeNull();
    q(host, '[aria-label="Local one enabled"]')?.click();
    expect(toggled).toHaveBeenCalledWith(expect.objectContaining({ row }));

    q(host, '[aria-label="More actions for Local one"]')?.click();
    fixture.detectChanges();
    q(host, '[data-testid="cli-matrix-test-local-one"]')?.click();
    expect(tested).toHaveBeenCalledWith(row);
  });

  it('emits edit, delete and capabilities from the actions menu', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    const edit = jest.fn();
    const del = jest.fn();
    const caps = jest.fn();
    fixture.componentInstance.edit.subscribe(edit);
    fixture.componentInstance.delete.subscribe(del);
    fixture.componentInstance.capabilities.subscribe(caps);

    q(host, '[aria-label="More actions for Lane a"]')?.click();
    fixture.detectChanges();
    q(host, '[data-testid="cli-matrix-edit-a"]')?.click();
    q(host, '[data-testid="cli-matrix-delete-a"]')?.click();
    const all = Array.from(host.querySelectorAll<HTMLElement>('button')).find(
      (b) => b.textContent?.trim() === 'All capabilities',
    );
    all?.click();

    expect(edit).toHaveBeenCalledWith(row);
    expect(del).toHaveBeenCalledWith(row);
    expect(caps).toHaveBeenCalledWith(row);
  });

  describe('order', () => {
    it('emits moved up and down and disables the ends', async () => {
      const a = instance('a');
      const b = instance('b');
      const { fixture, host } = await mount([a, b], true);
      const moved = jest.fn();
      fixture.componentInstance.moved.subscribe(moved);
      const rowA = q(host, '[data-testid="cli-matrix-row-a"]') as HTMLElement;
      const rowB = q(host, '[data-testid="cli-matrix-row-b"]') as HTMLElement;
      const btn = (r: HTMLElement, dir: 'up' | 'down') =>
        r.querySelector<HTMLButtonElement>(
          `[data-order-${dir}]`,
        ) as HTMLButtonElement;

      expect(btn(rowA, 'up').disabled).toBe(true);
      expect(btn(rowA, 'down').disabled).toBe(false);
      expect(btn(rowB, 'up').disabled).toBe(false);
      expect(btn(rowB, 'down').disabled).toBe(true);

      btn(rowA, 'down').click();
      btn(rowB, 'up').click();
      expect(moved).toHaveBeenNthCalledWith(1, { row: a, direction: 1 });
      expect(moved).toHaveBeenNthCalledWith(2, { row: b, direction: -1 });
    });

    it('counts positioned rows only, so the last one before an uninstalled row cannot move down', async () => {
      const { host } = await mount(
        [instance('a'), instance('b'), uninstalled('copilot')],
        true,
      );
      const rowB = q(host, '[data-testid="cli-matrix-row-b"]') as HTMLElement;
      const rowA = q(host, '[data-testid="cli-matrix-row-a"]') as HTMLElement;
      expect(
        (rowB.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (rowA.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('skips an uninstalled row in the middle when indexing', async () => {
      const { host } = await mount(
        [instance('a'), uninstalled('copilot'), instance('b')],
        true,
      );
      const rowA = q(host, '[data-testid="cli-matrix-row-a"]') as HTMLElement;
      const rowB = q(host, '[data-testid="cli-matrix-row-b"]') as HTMLElement;
      expect(
        (rowA.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(
        (rowB.querySelector('[data-order-up]') as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(
        (rowB.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('shows the rank when order mode is off', async () => {
      const { host } = await mount([
        instance('a', {}),
        { ...instance('b'), order: 7 },
      ]);
      expect(host.querySelector('[data-order-up]')).toBeNull();
      const cells = (id: string) =>
        q(host, `[data-testid="cli-matrix-row-${id}"] td`)?.textContent?.trim();
      expect(cells('a')).toBe('1');
      expect(cells('b')).toBe('7');
    });
  });

  describe('uninstalled system row', () => {
    it('is muted, shows a dash, no order buttons and a disabled toggle', async () => {
      const { fixture, host } = await mount([uninstalled('copilot')], true);
      const attention = jest.fn();
      fixture.componentInstance.attention.subscribe(attention);
      const row = q(host, '[data-testid="cli-provider-card-copilot"]');
      expect(row?.getAttribute('data-state')).toBe('muted');
      expect(row?.querySelector('td')?.textContent?.trim()).toBe('—');
      expect(row?.querySelector('[data-order-up]')).toBeNull();
      expect(
        (q(host, '[aria-label="Copilot enabled"]') as HTMLInputElement)
          .disabled,
      ).toBe(true);
      const guide = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Install guide',
      );
      guide?.click();
      expect(attention).toHaveBeenCalledTimes(1);
    });
  });

  describe('system row', () => {
    it('has card and version hooks and a clean model label', async () => {
      const { host } = await mount([
        system('codex', {
          model: { key: 'codexModel', value: 'gpt-5\tGPT 5' },
        }),
      ]);
      expect(q(host, '[data-testid="cli-provider-card-codex"]')).not.toBeNull();
      const version = q(host, '[data-testid="cli-matrix-version"]');
      expect(version?.textContent).toContain('v1.2.3');
      expect(version?.getAttribute('title')).toBe('v1.2.3');
      const model = q(host, '[data-testid="cli-matrix-model"]');
      expect(model?.textContent?.trim()).toBe('gpt-5');
      expect(model?.getAttribute('title')).toBe('gpt-5 (GPT 5)');
    });

    it('shows CLI default for an empty model', async () => {
      const { host } = await mount([system('codex')]);
      expect(
        q(host, '[data-testid="cli-matrix-model"]')?.textContent?.trim(),
      ).toBe('CLI default');
    });
  });

  describe('instance status', () => {
    it('shows Sign in for needs-key and emits attention', async () => {
      const row = instance('a', {
        status: { kind: 'needs-key', label: 'Needs API key', tone: 'warning' },
      });
      const { fixture, host } = await mount([row]);
      const attention = jest.fn();
      fixture.componentInstance.attention.subscribe(attention);
      const signIn = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Sign in',
      );
      expect(signIn).toBeDefined();
      signIn?.click();
      expect(attention).toHaveBeenCalledWith(row);
      expect(
        q(host, '[data-testid="cli-matrix-status"]')?.getAttribute('data-tone'),
      ).toBe('warn');
    });

    it('shows the runtime status and a missing key', async () => {
      const { host } = await mount([
        instance('a', {
          runtimeStatus: 'Error',
          keyStatus: { kind: 'missing', label: 'Key missing' },
        }),
      ]);
      expect(
        q(
          host,
          '[data-testid="cli-matrix-runtime-status"]',
        )?.textContent?.trim(),
      ).toBe('Error');
      expect(
        q(host, '[data-testid="cli-matrix-key-status"]')?.textContent?.trim(),
      ).toBe('Key missing');
    });

    it('hides the key badge when a key is set or not needed', async () => {
      const { host } = await mount([instance('a')]);
      expect(q(host, '[data-testid="cli-matrix-key-status"]')).toBeNull();
      expect(q(host, '[data-testid="cli-matrix-runtime-status"]')).toBeNull();
    });

    it('tells a loaded empty model from a model that is not loaded', async () => {
      const { host } = await mount([
        instance('a', { selectedModel: '' }),
        instance('b', { selectedModel: null }),
      ]);
      const model = (id: string) =>
        q(
          host,
          `[data-testid="cli-matrix-row-${id}"] [data-testid="cli-matrix-model"]`,
        )?.textContent?.trim();
      expect(model('a')).toBe('provider default');
      expect(model('b')).toBe('—');
    });
  });

  it('gives the config file hint an img role', async () => {
    const { host } = await mount([
      instance('a', { configFileHint: '~/.config/a.json' }),
    ]);
    const hint = q(host, '[role="img"]');
    expect(hint?.getAttribute('aria-label')).toBe('~/.config/a.json');
  });

  it('shows the empty state in a message cell', async () => {
    const { host } = await mount([]);
    const cell = q(host, 'td.ptah-table-message-cell');
    expect(cell?.textContent).toContain('No lanes available.');
    expect(cell?.getAttribute('colspan')).toBe('9');
  });

  it('toggles the detail row through the expander', async () => {
    const { fixture, host } = await mount([instance('a')]);
    const detail = q(host, '#lane-detail-a') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail.hidden).toBe(true);
    const button = q(
      host,
      'ptah-table-row-expander button',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('lane-detail-a');
  });
});
