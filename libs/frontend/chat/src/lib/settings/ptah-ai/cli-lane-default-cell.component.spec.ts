import { TestBed } from '@angular/core/testing';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';

const supported = { state: 'supported' as const };
const unsupported = { state: 'unsupported' as const, reason: 'Native enforcement is unverified.' };
const manifest: CliAdapterManifest = {
  messaging: { steer: supported, interrupt: supported, continuation: supported, resume: supported },
  roleChannel: 'task-prompt',
  permissionModes: {
    plan: { ...supported, networkModes: ['deny'] },
    ask: { ...unsupported, networkModes: [] },
    'auto-edit': { ...supported, networkModes: ['deny', 'allow'] },
    yolo: { ...supported, networkModes: ['allow'] },
  },
  networkModes: { deny: supported, allow: supported },
  mcp: supported,
  limitReader: { state: 'no-reliable-source' },
};
const cursorManifest: CliAdapterManifest = {
  ...manifest,
  permissionModes: {
    plan: { ...unsupported, reason: 'Plan has no local proof.', networkModes: [] },
    ask: { ...unsupported, reason: 'Ask has no binding.', networkModes: [] },
    'auto-edit': { ...unsupported, reason: 'Scoped edit has no binding.', networkModes: [] },
    yolo: { ...supported, networkModes: ['allow'] },
  },
};

describe('CliLaneDefaultCellComponent', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  });
  function setup(cli: 'codex' | 'ptah-cli' | 'cursor' = 'codex', value?: { permission?: 'plan' | 'yolo'; network?: 'allow' | 'deny' }) {
    const fixture = TestBed.createComponent(CliLaneDefaultCellComponent);
    fixture.componentRef.setInput('cli', cli);
    fixture.componentRef.setInput('name', cli);
    fixture.componentRef.setInput('manifest', manifest);
    fixture.componentRef.setInput('saved', value);
    fixture.detectChanges();
    return fixture;
  }

  /** A combobox (native select) by its accessible name. */
  function combobox(fixture: { nativeElement: HTMLElement }, name: string): HTMLSelectElement {
    const select = fixture.nativeElement.querySelector(`select[aria-label="${name}"]`) as HTMLSelectElement | null;
    if (!select) throw new Error(`No combobox named "${name}"`);
    return select;
  }

  it('filters unsupported options and restricts network by selected permission', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    expect(Array.from(combobox(fixture, 'codex permission default').options, option => option.value)).toEqual(['plan', 'auto-edit', 'yolo']);
    expect(Array.from(combobox(fixture, 'codex network default').options, option => option.value)).toEqual(['deny']);
  });

  it('gives each control a visible label tied to it and keeps the full value as its title', () => {
    const fixture = setup('codex', { permission: 'auto-edit', network: 'allow' });
    for (const [label, name, value] of [['Permission', 'codex permission default', 'auto-edit'], ['Network', 'codex network default', 'allow']] as const) {
      const select = combobox(fixture, name);
      const visible = fixture.nativeElement.querySelector(`label[for="${select.id}"]`) as HTMLLabelElement | null;
      expect(visible?.textContent?.trim()).toBe(label);
      expect(select.title).toBe(value);
    }
  });

  it('sets the layout as a host attribute, not as class bindings', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    fixture.componentRef.setInput('layout', 'card');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-layout')).toBe('card');
    expect(host.querySelector('.card-layout, .compact, .wide, .gap-2, .gap-3, .grid-cols-2')).toBeNull();
    expect([...host.querySelectorAll('label')].map(label => label.textContent?.trim())).toEqual(['Permission', 'Network']);
    expect([...host.querySelectorAll('select')].map(select => select.getAttribute('aria-label'))).toEqual(['codex permission default', 'codex network default']);
    expect(host.querySelectorAll('ptah-field')).toHaveLength(2);
    expect([...host.querySelectorAll('[data-ptah-field]')].map(field => field.getAttribute('data-size'))).toEqual(['sm', 'sm']);
  });

  it('keeps unavailable Network in its compact field with the reason as its description', () => {
    const fixture = setup('codex');
    fixture.componentRef.setInput('layout', 'card');
    fixture.componentRef.setInput('manifest', { ...manifest, permissionModes: {
      ...manifest.permissionModes,
      plan: { ...manifest.permissionModes.plan, state: 'unsupported', reason: 'Grok exposes no native read-only plan flag.' },
    }, networkModes: {
      deny: { ...unsupported, reason: 'Grok exposes no native read-only plan flag.' },
      allow: { ...unsupported, reason: 'Grok exposes no native read-only plan flag.' },
    } });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const fields = host.querySelectorAll('ptah-field');
    expect(fields[1].querySelector('[ptahFieldTrailing]')?.textContent?.trim()).toBe('Unavailable');
    expect(fields[1].querySelector('.ptah-field__message')?.textContent?.trim()).toBe('Grok exposes no native read-only plan flag.');
    expect(host.querySelector('.defaults-warning')).toBeNull();
  });

  it('shows the saved choice when the manifest and the saved row arrive together', () => {
    // Reload path: options render in the same pass as the value. A bound
    // select value with no matching option yet fell back to the first
    // option ("plan" / "deny"), so a saved auto-edit looked like Plan.
    const fixture = TestBed.createComponent(CliLaneDefaultCellComponent);
    fixture.componentRef.setInput('cli', 'codex');
    fixture.componentRef.setInput('name', 'Codex');
    fixture.componentRef.setInput('manifest', manifest);
    fixture.componentRef.setInput('saved', { permission: 'auto-edit', network: 'allow' });
    fixture.detectChanges();
    expect(combobox(fixture, 'Codex permission default').value).toBe('auto-edit');
    expect(combobox(fixture, 'Codex network default').value).toBe('allow');
  });

  it('shows reasons and shared Ptah scope', () => {
    const fixture = setup('ptah-cli');
    expect(fixture.nativeElement.textContent).toContain('Shared by all Ptah CLI providers');
    expect(fixture.nativeElement.textContent).toContain('built-in');
    fixture.componentRef.setInput('manifest', { ...manifest, permissionModes: { ask: { ...unsupported, networkModes: [] } } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unavailable');
    expect(fixture.nativeElement.textContent).toContain('Native enforcement is unverified.');
    expect(fixture.nativeElement.querySelector('[tabindex="0"]')).toBeTruthy();
  });

  it('explains Cursor permission modes that cannot be selected', () => {
    const fixture = setup('cursor');
    fixture.componentRef.setInput('manifest', cursorManifest);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('plan unavailable: Plan has no local proof.');
    expect(fixture.nativeElement.textContent).toContain('ask unavailable: Ask has no binding.');
    expect(fixture.nativeElement.textContent).toContain('auto-edit unavailable: Scoped edit has no binding.');
    expect(fixture.nativeElement.textContent).toContain('Network: Unavailable');
    expect(fixture.nativeElement.textContent).toContain('Unsupported combination');
    expect(fixture.nativeElement.querySelectorAll('[tabindex="0"]').length).toBe(4);
    const placeholder = fixture.nativeElement.querySelector('select option[value=""]') as HTMLOptionElement;
    expect(placeholder.textContent).toContain('Choose a permission');
    expect(placeholder.selected).toBe(true);
  });

  it('confirms Cursor full access before saving its first permission choice', () => {
    const fixture = setup('cursor');
    fixture.componentRef.setInput('manifest', cursorManifest);
    fixture.detectChanges();
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = combobox(fixture, 'cursor permission default');
    expect(select.value).toBe('');
    select.value = 'yolo';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog[open]')).not.toBeNull();
    const confirm = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Confirm');
    confirm?.click();
    expect(selected).toHaveBeenCalledWith({ permission: 'yolo', network: 'allow' });
  });

  it('requires confirmation for full auto and cancel preserves the saved choice', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = combobox(fixture, 'codex permission default');
    select.value = 'yolo';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(select.value).toBe('plan');
    expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    (fixture.nativeElement.querySelector('dialog button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
  });

  it('resets to the built-in plan default without confirmation', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const reset = jest.fn();
    fixture.componentInstance.resetRequested.subscribe(reset);
    expect(fixture.nativeElement.textContent).toContain('Saved default');
    (Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'More default actions'))?.click();
    fixture.detectChanges();
    const resetButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Reset to default'))!;
    expect(resetButton.textContent).toContain('Reset to default (plan)');
    resetButton.click();
    fixture.detectChanges();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
  });

  it('emits the confirmed full-auto choice', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = combobox(fixture, 'codex permission default');
    select.value = 'yolo';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const confirm = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Confirm');
    confirm?.click();
    expect(selected).toHaveBeenCalledWith({ permission: 'yolo', network: 'allow' });
  });

  it('shows unsupported saved pairs from the shared resolver', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'allow' });
    expect(fixture.nativeElement.textContent).toContain('Unsupported combination');
  });
});
