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

describe('CliLaneDefaultCellComponent', () => {
  function setup(cli: 'codex' | 'ptah-cli' | 'cursor' = 'codex', value?: { permission?: 'plan' | 'yolo'; network?: 'allow' | 'deny' }) {
    const fixture = TestBed.createComponent(CliLaneDefaultCellComponent);
    fixture.componentRef.setInput('cli', cli);
    fixture.componentRef.setInput('name', cli);
    fixture.componentRef.setInput('manifest', manifest);
    fixture.componentRef.setInput('saved', value);
    fixture.detectChanges();
    return fixture;
  }

  it('filters unsupported options and restricts network by selected permission', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const selects = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    expect(Array.from(selects[0].options, option => option.value)).toEqual(['plan', 'auto-edit', 'yolo']);
    expect(Array.from(selects[1].options, option => option.value)).toEqual(['deny']);
    expect(selects[0].getAttribute('aria-label')).toContain('permission default');
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
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      permissionModes: {
        plan: { ...unsupported, reason: 'Plan has no local proof.', networkModes: [] },
        ask: { ...unsupported, reason: 'Ask has no binding.', networkModes: [] },
        'auto-edit': { ...unsupported, reason: 'Scoped edit has no binding.', networkModes: [] },
        yolo: { ...supported, networkModes: ['allow'] },
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('plan unavailable: Plan has no local proof.');
    expect(fixture.nativeElement.textContent).toContain('ask unavailable: Ask has no binding.');
    expect(fixture.nativeElement.textContent).toContain('auto-edit unavailable: Scoped edit has no binding.');
    expect(fixture.nativeElement.querySelectorAll('[tabindex="0"]').length).toBe(3);
  });

  it('requires confirmation for full auto and cancel preserves the saved choice', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'yolo';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(select.value).toBe('plan');
    (fixture.nativeElement.querySelector('button:last-child') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
  });

  it('confirms reset to built-in full access and cancel preserves the saved choice', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const reset = jest.fn();
    fixture.componentInstance.resetRequested.subscribe(reset);
    expect(fixture.nativeElement.textContent).toContain('Saved default');
    const resetButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(resetButton.textContent).toContain('Auto — full access');
    resetButton.click();
    fixture.detectChanges();
    expect(reset).not.toHaveBeenCalled();
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    buttons().find(button => button.textContent?.trim() === 'Cancel')?.click();
    fixture.detectChanges();
    expect(reset).not.toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe('plan');
    resetButton.click();
    fixture.detectChanges();
    buttons().find(button => button.textContent?.trim() === 'Confirm')?.click();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('emits the confirmed full-auto choice', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
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
