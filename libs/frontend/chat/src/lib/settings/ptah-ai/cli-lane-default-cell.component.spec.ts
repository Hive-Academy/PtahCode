import { By } from '@angular/platform-browser';
import { PtahRichSelectComponent } from '@ptah-extension/ui';
import { TestBed } from '@angular/core/testing';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';

const supported = { state: 'supported' as const };
const unsupported = {
  state: 'unsupported' as const,
  reason: 'Native enforcement is unverified.',
};
const manifest: CliAdapterManifest = {
  messaging: {
    steer: supported,
    interrupt: supported,
    continuation: supported,
    resume: supported,
  },
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
    plan: {
      ...unsupported,
      reason: 'Plan has no local proof.',
      networkModes: [],
    },
    ask: { ...unsupported, reason: 'Ask has no binding.', networkModes: [] },
    'auto-edit': {
      ...unsupported,
      reason: 'Scoped edit has no binding.',
      networkModes: [],
    },
    yolo: { ...supported, networkModes: ['allow'] },
  },
};

describe('CliLaneDefaultCellComponent', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  });
  function setup(
    cli: 'codex' | 'ptah-cli' | 'cursor' = 'codex',
    value?: { permission?: 'plan' | 'yolo'; network?: 'allow' | 'deny' },
  ) {
    const fixture = TestBed.createComponent(CliLaneDefaultCellComponent);
    fixture.componentRef.setInput('cli', cli);
    fixture.componentRef.setInput('name', cli);
    fixture.componentRef.setInput('manifest', manifest);
    fixture.componentRef.setInput('saved', value);
    fixture.detectChanges();
    return fixture;
  }

  function combobox(
    fixture: ReturnType<typeof setup>,
    name: string,
  ): PtahRichSelectComponent<string> {
    const control = fixture.debugElement
      .queryAll(By.directive(PtahRichSelectComponent))
      .map(
        (element) =>
          element.componentInstance as PtahRichSelectComponent<string>,
      )
      .find((component) => component.label() === name);
    if (!control) throw new Error(`No combobox named "${name}"`);
    return control;
  }

  it('filters unsupported options and restricts network by selected permission', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    expect(
      Array.from(
        combobox(fixture, 'codex permission default').options(),
        (option) => option.value,
      ),
    ).toEqual(['plan', 'auto-edit', 'yolo']);
    expect(
      Array.from(
        combobox(fixture, 'codex network default').options(),
        (option) => option.value,
      ),
    ).toEqual(['deny']);
  });

  it('uses human labels in compact, wide and card controls without changing values', () => {
    const fixture = setup('codex', {
      permission: 'auto-edit',
      network: 'allow',
    });
    for (const layout of ['compact', 'wide', 'card']) {
      fixture.componentRef.setInput('layout', layout);
      fixture.detectChanges();
      expect(combobox(fixture, 'codex permission default').options()).toEqual([
        { value: 'plan', label: 'Plan only' },
        { value: 'auto-edit', label: 'Auto edit' },
        { value: 'yolo', label: 'Yolo' },
      ]);
      expect(combobox(fixture, 'codex network default').options()).toEqual([
        { value: 'deny', label: 'Blocked' },
        { value: 'allow', label: 'Allowed' },
      ]);
      expect(combobox(fixture, 'codex permission default').value()).toBe(
        'auto-edit',
      );
      expect(combobox(fixture, 'codex network default').value()).toBe('allow');
    }
  });

  it('keeps compact cells label-free and names each designed select', () => {
    const fixture = setup('codex', {
      permission: 'auto-edit',
      network: 'allow',
    });
    fixture.componentRef.setInput('showCaption', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ptah-field')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(combobox(fixture, 'codex permission default').value()).toBe(
      'auto-edit',
    );
    expect(combobox(fixture, 'codex network default').value()).toBe('allow');
  });

  it('sets the layout as a host attribute, not as class bindings', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    fixture.componentRef.setInput('layout', 'card');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-layout')).toBe('card');
    expect(
      host.querySelector(
        '.card-layout, .compact, .wide, .gap-2, .gap-3, .grid-cols-2',
      ),
    ).toBeNull();
    expect(
      [...host.querySelectorAll('label')].map((label) =>
        label.textContent?.trim(),
      ),
    ).toEqual(['Permission', 'Network']);
    expect(
      [...host.querySelectorAll('[role="combobox"]')].map((select) =>
        select.getAttribute('aria-label'),
      ),
    ).toEqual(['codex permission default', 'codex network default']);
    expect(host.querySelectorAll('ptah-field')).toHaveLength(2);
    expect(
      [...host.querySelectorAll('[data-ptah-field]')].map((field) =>
        field.getAttribute('data-size'),
      ),
    ).toEqual(['sm', 'sm']);
  });

  it('keeps unavailable Network in its compact field with the reason as its description', () => {
    const fixture = setup('codex');
    fixture.componentRef.setInput('layout', 'card');
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      permissionModes: {
        ...manifest.permissionModes,
        plan: {
          ...manifest.permissionModes.plan,
          state: 'unsupported',
          reason: 'Grok exposes no native read-only plan flag.',
        },
      },
      networkModes: {
        deny: {
          ...unsupported,
          reason: 'Grok exposes no native read-only plan flag.',
        },
        allow: {
          ...unsupported,
          reason: 'Grok exposes no native read-only plan flag.',
        },
      },
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const fields = host.querySelectorAll('ptah-field');
    expect(
      fields[1].querySelector('button[ptahFieldTrigger]')?.textContent?.trim(),
    ).toBe('Unavailable');
    expect(
      fields[1].querySelector('.ptah-field__message')?.textContent?.trim(),
    ).toBe('Grok exposes no native read-only plan flag.');
    for (const label of host.querySelectorAll<HTMLLabelElement>('label[for]')) {
      const control = host.querySelector<HTMLElement>(
        `[id="${label.htmlFor}"]`,
      );
      expect(control).not.toBeNull();
      expect(control?.id).toBe(label.htmlFor);
    }
    expect(host.querySelector('.defaults-warning')).toBeNull();
  });

  it('ties unavailable Permission and Network labels to disabled controls', () => {
    const fixture = setup('codex');
    fixture.componentRef.setInput('layout', 'card');
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      permissionModes: {},
      networkModes: {},
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const labels = host.querySelectorAll<HTMLLabelElement>('label[for]');
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      const control = host.querySelector<HTMLButtonElement>(
        `button[id="${label.htmlFor}"]`,
      );
      expect(control).not.toBeNull();
      expect(control?.disabled).toBe(true);
      expect(control?.textContent?.trim()).toBe('Unavailable');
    }
  });

  it('shows the saved choice when the manifest and the saved row arrive together', () => {
    // Reload path: options render in the same pass as the value. A bound
    // select value with no matching option yet fell back to the first
    // option ("plan" / "deny"), so a saved auto-edit looked like Plan.
    const fixture = TestBed.createComponent(CliLaneDefaultCellComponent);
    fixture.componentRef.setInput('cli', 'codex');
    fixture.componentRef.setInput('name', 'Codex');
    fixture.componentRef.setInput('manifest', manifest);
    fixture.componentRef.setInput('saved', {
      permission: 'auto-edit',
      network: 'allow',
    });
    fixture.detectChanges();
    expect(combobox(fixture, 'Codex permission default').value()).toBe(
      'auto-edit',
    );
    expect(combobox(fixture, 'Codex network default').value()).toBe('allow');
  });

  it('shows reasons and shared Ptah scope', () => {
    const fixture = setup('ptah-cli');
    expect(fixture.nativeElement.textContent).toContain(
      'Shared by all Ptah CLI providers',
    );
    expect(fixture.nativeElement.textContent).toContain('built-in');
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      permissionModes: { ask: { ...unsupported, networkModes: [] } },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unavailable');
    expect(fixture.nativeElement.textContent).toContain(
      'Native enforcement is unverified.',
    );
    expect(fixture.nativeElement.querySelector('[tabindex="0"]')).toBeTruthy();
  });

  it('explains Cursor permission modes that cannot be selected', () => {
    const fixture = setup('cursor');
    fixture.componentRef.setInput('layout', 'wide');
    fixture.componentRef.setInput('manifest', cursorManifest);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'plan unavailable: Plan has no local proof.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'ask unavailable: Ask has no binding.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'auto-edit unavailable: Scoped edit has no binding.',
    );
    expect(fixture.nativeElement.textContent).toContain('Unavailable');
    expect(fixture.nativeElement.textContent).toContain(
      'Unsupported combination',
    );
    expect(
      fixture.nativeElement.querySelectorAll('[tabindex="0"]').length,
    ).toBe(4);
    expect(combobox(fixture, 'cursor permission default').placeholder()).toBe(
      'Select mode',
    );
    expect(combobox(fixture, 'cursor permission default').value()).toBeNull();
  });

  it('confirms Cursor full access before saving its first permission choice', () => {
    const fixture = setup('cursor');
    fixture.componentRef.setInput('layout', 'wide');
    fixture.componentRef.setInput('manifest', cursorManifest);
    fixture.detectChanges();
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = combobox(fixture, 'cursor permission default');
    expect(select.value()).toBeNull();
    select.value.set('yolo');
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog[open]')).not.toBeNull();
    const confirm = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Confirm');
    confirm?.click();
    expect(selected).toHaveBeenCalledWith({
      permission: 'yolo',
      network: 'allow',
    });
  });

  it('requires confirmation for full auto and cancel preserves the saved choice', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const selected = jest.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const select = combobox(fixture, 'codex permission default');
    select.value.set('yolo');
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(select.value()).toBe('plan');
    expect(
      (fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open,
    ).toBe(true);
    (
      fixture.nativeElement.querySelector('dialog button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
  });

  it('resets to the built-in plan default without confirmation', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'deny' });
    const reset = jest.fn();
    fixture.componentInstance.resetRequested.subscribe(reset);
    expect(fixture.nativeElement.textContent).toContain('Saved default');
    Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    )
      .find((button) => button.textContent?.trim() === 'More default actions')
      ?.click();
    fixture.detectChanges();
    const resetButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Reset to default'))!;
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
    select.value.set('yolo');
    fixture.detectChanges();
    const confirm = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Confirm');
    confirm?.click();
    expect(selected).toHaveBeenCalledWith({
      permission: 'yolo',
      network: 'allow',
    });
  });

  it('shows unsupported saved pairs from the shared resolver', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'allow' });
    expect(fixture.nativeElement.textContent).toContain(
      'Unsupported combination',
    );
  });

  it('shows an unsupported saved pair in the card layout when no network choice remains', () => {
    const fixture = setup('codex', { permission: 'plan', network: 'allow' });
    fixture.componentRef.setInput('layout', 'card');
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      permissionModes: { ask: { ...unsupported, networkModes: [] } },
    });
    fixture.detectChanges();
    const warning = fixture.nativeElement.querySelector('.defaults-warning');
    expect(warning?.textContent).toContain(
      'Saved CLI lane default has no supported permission/network pair.',
    );
  });
});
