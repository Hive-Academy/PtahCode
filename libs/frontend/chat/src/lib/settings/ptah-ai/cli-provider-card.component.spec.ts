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
  it('emits toggle, test and Codex settings actions', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const toggle = jest.fn(), test = jest.fn(), settings = jest.fn();
    component.toggled.subscribe(toggle);
    component.testRequested.subscribe(test);
    component.codexSettingsRequested.subscribe(settings);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.test-button')?.click();
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(button => button.textContent?.includes('Codex settings'))?.click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledWith('codex');
    expect(settings).toHaveBeenCalledTimes(1);
  });
  it('shows Credentials only for Cursor', () => {
    const codex = setup(row('codex'));
    expect((codex.nativeElement as HTMLElement).textContent).not.toContain('Credentials');
    const cursor = setup(row('cursor'));
    expect((cursor.nativeElement as HTMLElement).textContent).toContain('Credentials');
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
    ['unsupported', { testing: false, testText: 'Unsupported combination' }, 'Ready'],
    ['unavailable', { testing: false, testText: 'Permission unavailable' }, 'Ready'],
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
