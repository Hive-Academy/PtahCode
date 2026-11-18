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
