import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahSettingRowComponent } from './setting-row.component';

@Component({
  standalone: true,
  imports: [PtahSettingRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-setting-row label="Run checks" hint="Checks the project" controlId="run-checks" [disabled]="disabled()" disabledReason="Unavailable here" [density]="density()">
      <span status data-testid="status">Restart</span>
      <span meta data-testid="meta">On</span>
      <input id="run-checks" type="checkbox" aria-describedby="run-checks-hint run-checks-reason" />
    </ptah-setting-row>
  `,
})
class HostComponent {
  readonly disabled = signal(false);
  readonly density = signal<'default' | 'compact'>('default');
  readonly row = viewChild.required(PtahSettingRowComponent);
}

@Component({
  standalone: true,
  imports: [PtahSettingRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <ptah-setting-row label="First setting"><input type="checkbox" /></ptah-setting-row>
      <ptah-setting-row label="Second setting"><input type="checkbox" /></ptah-setting-row>
    </div>
  `,
})
class TwoRowsHostComponent {}

@Component({
  standalone: true,
  imports: [PtahSettingRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-setting-row
      label="Prompt"
      hint="Shown to the agent"
      controlId="prompt"
      [hintElementId]="hintElementId()"
      [controlAlign]="controlAlign()"
      [edgePadding]="edgePadding()"
    >
      @if (withAction()) {
        <button action type="button" data-testid="action">i</button>
      }
      <input id="prompt" type="checkbox" data-testid="control" />
    </ptah-setting-row>
  `,
})
class OptionsHostComponent {
  readonly hintElementId = signal<string | null>(null);
  readonly controlAlign = signal<'start' | 'end'>('start');
  readonly edgePadding = signal<'all' | 'trim'>('all');
  readonly withAction = signal(true);
  readonly row = viewChild.required(PtahSettingRowComponent);
}

describe('PtahSettingRowComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  it('renders the label, hint, control, status and meta slots', () => {
    const label = element.querySelector('label') as HTMLLabelElement;
    const control = element.querySelector('input') as HTMLInputElement;
    expect(label.textContent?.trim()).toBe('Run checks');
    expect(label.control).toBe(control);
    expect(element.querySelector('#run-checks-hint')?.textContent).toContain('Checks the project');
    expect(element.querySelector('[data-testid="status"]')?.textContent).toContain('Restart');
    expect(element.querySelector('[data-testid="meta"]')?.textContent).toContain('On');
    expect(host.row().hintId()).toBe('run-checks-hint');
    expect(host.row().reasonId()).toBe('run-checks-reason');
  });

  it('shows a linked reason and does not dim or make inert any part of the row when disabled', () => {
    host.disabled.set(true);
    fixture.detectChanges();
    expect(element.querySelector('#run-checks-reason')?.textContent).toContain('Unavailable here');
    const row = element.querySelector('[data-testid="setting-row"]') as HTMLElement;
    expect(row.getAttribute('data-disabled')).toBe('true');
    expect(row.hasAttribute('aria-disabled')).toBe(false);
    expect(element.querySelector('[inert]')).toBeNull();
    expect(element.querySelector('.opacity-50')).toBeNull();
  });

  it('puts the divider on each host so sibling rows in one parent show it', () => {
    const list = TestBed.createComponent(TwoRowsHostComponent);
    list.detectChanges();
    const rows = Array.from((list.nativeElement as HTMLElement).querySelectorAll('ptah-setting-row'));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.parentElement).toBe(rows[0].parentElement);
      expect(row.classList.contains('border-b')).toBe(true);
      expect(row.classList.contains('border-surface-border')).toBe(true);
      expect(row.classList.contains('last:border-b-0')).toBe(true);
      const inner = row.querySelector('[data-testid="setting-row"]') as HTMLElement;
      expect(inner.classList.contains('border-b')).toBe(false);
      expect(inner.classList.contains('py-ptah-field')).toBe(true);
    }
  });

  describe('action slot and opt-in layout', () => {
    let options: ComponentFixture<OptionsHostComponent>;
    let root: HTMLElement;
    const control = (): HTMLElement => root.querySelector('[data-ptah-setting-control]') as HTMLElement;
    const action = (): HTMLElement => root.querySelector('[data-ptah-setting-action]') as HTMLElement;
    const rowHost = (): HTMLElement => root.querySelector('ptah-setting-row') as HTMLElement;

    beforeEach(() => {
      options = TestBed.createComponent(OptionsHostComponent);
      options.detectChanges();
      root = options.nativeElement as HTMLElement;
    });

    it('renders the action slot in a fixed box before the control', () => {
      expect(action().querySelector('[data-testid="action"]')).not.toBeNull();
      expect(action().classList.contains('size-8')).toBe(true);
      const children = Array.from(control().children);
      expect(children.indexOf(action())).toBeLessThan(
        children.indexOf(root.querySelector('[data-testid="control"]') as HTMLElement),
      );
    });

    it('hides an empty action box', () => {
      options.componentInstance.withAction.set(false);
      options.detectChanges();
      expect(action().children).toHaveLength(0);
      expect(action().classList.contains('empty:hidden')).toBe(true);
    });

    it('sets the hint id from hintElementId, and derives it otherwise', () => {
      expect(root.querySelector('#prompt-hint')).not.toBeNull();
      options.componentInstance.hintElementId.set('agent-behaviour-prompt-note');
      options.detectChanges();
      expect(options.componentInstance.row().hintId()).toBe('agent-behaviour-prompt-note');
      expect(root.querySelector('#agent-behaviour-prompt-note')?.textContent).toContain('Shown to the agent');
      expect(root.querySelector('#prompt-hint')).toBeNull();
    });

    it("keeps today's classes by default: no justify-end, no first/last padding trim", () => {
      expect(control().classList.contains('justify-end')).toBe(false);
      expect(rowHost().classList.contains('first:[&>div]:pt-0')).toBe(false);
      expect(rowHost().classList.contains('last:[&>div]:pb-0')).toBe(false);
      expect(Array.from(rowHost().classList).sort()).toEqual(
        ['block', 'border-b', 'border-surface-border', 'last:border-b-0', '[container-type:inline-size]'].sort(),
      );
    });

    it('adds justify-end with controlAlign="end" and the edge trim with edgePadding="trim"', () => {
      options.componentInstance.controlAlign.set('end');
      options.componentInstance.edgePadding.set('trim');
      options.detectChanges();
      expect(control().classList.contains('justify-end')).toBe(true);
      expect(rowHost().classList.contains('first:[&>div]:pt-0')).toBe(true);
      expect(rowHost().classList.contains('last:[&>div]:pb-0')).toBe(true);
      expect(rowHost().classList.contains('last:border-b-0')).toBe(true);
    });
  });

  it('uses compact spacing and a 640 px container stack class', () => {
    host.density.set('compact');
    fixture.detectChanges();
    const row = element.querySelector('[data-testid="setting-row"]') as HTMLElement;
    expect(row.classList.contains('py-ptah-controls')).toBe(true);
    expect(row.classList.contains('grid-cols-1')).toBe(true);
    expect(row.classList.contains('row-split:grid-cols-[minmax(0,1fr)_auto]')).toBe(true);
    expect(element.querySelector('ptah-setting-row')?.classList.contains('[container-type:inline-size]')).toBe(true);
  });
});
