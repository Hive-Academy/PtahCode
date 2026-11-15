import { TestBed } from '@angular/core/testing';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { CliProviderCardComponent } from './cli-provider-card.component';
import { CliProviderGridComponent } from './cli-provider-grid.component';

const row = (cli: SystemCliMatrixRow['cli'] = 'codex', installed = true): SystemCliMatrixRow => ({
  id: cli, cli, kind: 'system', name: cli === 'cursor' ? 'Cursor' : 'Codex',
  status: { kind: installed ? 'ready' : 'not-installed', label: installed ? 'Ready' : 'Not installed', tone: installed ? 'success' : 'neutral' },
  enabled: true, interactive: installed, installed, manifest: undefined,
  permission: { badge: 'Ask', detail: 'The CLI asks before edits.', tone: 'info' },
  version: null, versionLabel: null, codexStatusLine: null, provider: null,
  model: { key: cli === 'cursor' ? 'cursorModel' : 'codexModel', value: '' },
  effort: cli === 'cursor' ? null : { key: 'codexReasoningEffort', value: '' },
  credentialAction: cli === 'cursor',
});

describe('CliProviderCardComponent', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open'); };
  });
  function setup(value = row()) {
    const fixture = TestBed.createComponent(CliProviderCardComponent);
    fixture.componentRef.setInput('row', value);
    fixture.detectChanges();
    return fixture;
  }
  it('labels native CLI behavior separately from the saved Lane default', () => {
    const root = setup().nativeElement as HTMLElement;
    const term = [...root.querySelectorAll('dt')].find(element => element.textContent?.trim() === 'Native CLI behavior');
    expect(term).toBeDefined();
    expect(term?.closest('[data-ptah-description-row]')?.getAttribute('title')).toContain('Lane default');
    expect(term?.closest('[data-ptah-description-row]')?.querySelector('[data-popover-kind="permission"]')?.textContent?.trim()).toBe('Ask');
  });
  it('shows read-only facts as one description list with full, unclipped values', () => {
    const root = setup({ ...row(), version: 'codex-cli 0.169.0', versionLabel: 'v0.169.0', codexStatusLine: 'Installed Codex 0.169.0', provider: 'OpenAI Codex' }).nativeElement as HTMLElement;
    const facts = root.querySelector('[data-testid="cli-provider-facts"] dl');
    expect(facts?.getAttribute('aria-label')).toBe('Codex details');
    const value = (term: string) => [...root.querySelectorAll('dt')].find(element => element.textContent?.trim() === term)?.nextElementSibling;
    expect(value('Version')?.querySelector('[data-testid="cli-matrix-version"]')?.textContent?.trim()).toBe('v0.169.0');
    expect(value('Executable')?.textContent?.trim()).toBe('Installed Codex 0.169.0');
    expect(value('Provider')?.textContent?.trim()).toBe('OpenAI Codex');
    expect(root.querySelector('dd.truncate')).toBeNull();
  });
  it('shows every capability summary as a full row and keeps the All capabilities detail', () => {
    const root = setup().nativeElement as HTMLElement;
    const list = root.querySelector('[data-testid="cli-capability-summary"] dl');
    expect(list?.getAttribute('aria-label')).toBe('Capabilities');
    const terms = [...(list?.querySelectorAll('dt') ?? [])].map(element => element.textContent?.trim());
    expect(terms).toEqual(['Messaging', 'Permission', 'Network', 'MCP', 'Limit']);
    expect(list?.querySelector('[data-ptah-badge]')).toBeNull();
    expect(root.querySelector('[data-popover-kind="capabilities"]')?.textContent?.trim()).toBe('All capabilities');
  });
  it('shows one status: a badge and no second Installed line', () => {
    const root = setup({ ...row(), codexStatusLine: 'Installed Codex 0.169.0' }).nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-status]')).toHaveLength(1);
    expect(root.querySelector('.status-slot')?.textContent?.trim()).toBe('Enabled');
    expect(root.querySelector('header')?.textContent).not.toContain('Installed');
  });
  it.each([
    [row('codex', false), 'Not installed'],
    [{ ...row('cursor', false), status: { kind: 'needs-key', label: 'Needs API key', tone: 'warning' } } as SystemCliMatrixRow, 'Needs API key'],
    [{ ...row(), enabled: false, status: { kind: 'disabled', label: 'Disabled', tone: 'neutral' } } as SystemCliMatrixRow, 'Disabled'],
  ])('derives the card status from the row status (%#)', (value, expected) => {
    expect((setup(value).nativeElement as HTMLElement).querySelector('.status-slot')?.textContent?.trim()).toBe(expected);
  });
  it('uses the inset surface with a faint border and no outer padding', () => {
    const article = (setup().nativeElement as HTMLElement).querySelector('article');
    expect(article?.classList.contains('ptah-card')).toBe(true);
    expect(article?.classList.contains('rounded-lg')).toBe(true);
    expect(article?.getAttribute('data-variant')).toBe('inset');
    expect(article?.getAttribute('data-border')).toBe('faint');
    expect(article?.getAttribute('data-padding')).toBe('none');
    expect(article?.classList.contains('bg-base-100')).toBe(false);
    expect(article?.classList.contains('border-base-content/10')).toBe(false);
  });
  it('emits toggle, test and Codex settings actions', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const toggle = jest.fn(), test = jest.fn(), settings = jest.fn();
    component.toggled.subscribe(toggle);
    component.testRequested.subscribe(test);
    component.codexSettingsRequested.subscribe(settings);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.test-button')?.click();
    const codexSettings = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(button => button.textContent?.trim() === 'Codex settings');
    expect(codexSettings?.classList.contains('btn-outline')).toBe(true);
    codexSettings?.click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledWith('codex');
    expect(settings).toHaveBeenCalledTimes(1);
  });
  it('shows Credentials only for Cursor', () => {
    const codex = setup(row('codex'));
    const credentials = '[data-popover-kind="credentials"]';
    expect((codex.nativeElement as HTMLElement).querySelector(credentials)).toBeNull();
    const cursor = setup(row('cursor'));
    expect((cursor.nativeElement as HTMLElement).querySelector(credentials)?.textContent?.trim()).toBe('Credentials');
  });
  it('keeps Credentials on an uninstalled Cursor and offers its install guide', () => {
    const fixture = setup(row('cursor', false));
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Credentials');
    expect(root.textContent).toContain('Install guide');
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
  });
  it.each([
    ['running', { testing: true, testText: '' }, 'Running'],
    ['failed', { testing: false, testText: 'The connection test failed. Timeout' }, 'Test failed'],
    ['unsupported', { testing: false, testText: 'Unsupported combination' }, 'Enabled'],
    ['unavailable', { testing: false, testText: 'Permission unavailable' }, 'Enabled'],
  ])('keeps status and live slots for %s', (_name, state, expected) => {
    const fixture = setup();
    fixture.componentRef.setInput('testing', state.testing);
    fixture.componentRef.setInput('testText', state.testText);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.status-slot')?.textContent).toContain(expected);
    expect(root.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
  it('forwards reset and confirmed defaults through separate outputs', () => {
    const fixture = setup();
    const reset = jest.fn(), selected = jest.fn();
    fixture.componentInstance.defaultResetRequested.subscribe(reset);
    fixture.componentInstance.defaultSelected.subscribe(selected);
    fixture.componentInstance.defaultResetRequested.emit();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(selected).not.toHaveBeenCalled();
  });
});

describe('CliProviderGridComponent', () => {
  it('allows only one open popover across cards', () => {
    const fixture = TestBed.createComponent(CliProviderGridComponent);
    fixture.componentRef.setInput('rows', [row('codex'), row('cursor')]);
    fixture.detectChanges();
    const cards = fixture.debugElement.children[0].children.map(child => child.componentInstance as CliProviderCardComponent);
    cards[0].popoverRequested.emit('info');
    fixture.detectChanges();
    expect(cards[0].openKind()).toBe('info');
    cards[1].popoverRequested.emit('capabilities');
    fixture.detectChanges();
    expect(cards[0].openKind()).toBeNull();
    expect(cards[1].openKind()).toBe('capabilities');
  });
});
