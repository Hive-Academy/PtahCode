import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahDisclosureComponent } from './disclosure.component';

@Component({
  standalone: true,
  imports: [PtahDisclosureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-disclosure
      label="Details"
      [open]="initialOpen()"
      [size]="size()"
      [align]="align()"
      [region]="region()"
      (openChange)="changes.push($event)"
    >
      <span ptahDisclosureMeta data-testid="meta">2 items</span>
      <p data-testid="content">Projected body</p>
    </ptah-disclosure>
  `,
})
class HostComponent {
  readonly initialOpen = signal(false);
  readonly size = signal<'md' | 'sm'>('md');
  readonly align = signal<'start' | 'center'>('start');
  readonly region = signal(false);
  readonly changes: boolean[] = [];
}

function render(): {
  fixture: ComponentFixture<HostComponent>;
  host: HTMLElement;
  button: HTMLButtonElement;
  body: HTMLElement;
} {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'ptah-disclosure',
  ) as HTMLElement;
  const button = host.querySelector('button') as HTMLButtonElement;
  const body = host.querySelector(
    '[id^="ptah-disclosure-body-"]',
  ) as HTMLElement;
  return { fixture, host, button, body };
}

describe('PtahDisclosureComponent', () => {
  it('starts closed while retaining projected content in the DOM', () => {
    const { button, body } = render();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
    expect(body.querySelector('[data-testid="content"]')?.textContent).toBe(
      'Projected body',
    );
  });

  it('toggles on click and emits openChange', () => {
    const { fixture, button, body } = render();
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.changes).toEqual([true]);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(body.hidden).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.changes).toEqual([true, false]);
  });

  it('accepts an open input and links button and region ids', () => {
    const { fixture, button, body } = render();
    fixture.componentInstance.initialOpen.set(true);
    fixture.componentInstance.region.set(true);
    fixture.detectChanges();
    expect(body.hidden).toBe(false);
    expect(button.getAttribute('aria-controls')).toBe(body.id);
    expect(body.getAttribute('aria-labelledby')).toBe(button.id);
    expect(button.id).toBeTruthy();
  });

  it('marks the host as a disclosure pattern and uses the md size by default', () => {
    const { host, button } = render();
    expect(host.getAttribute('data-ptah-pattern')).toBe('disclosure');
    expect(button.classList.contains('text-sm')).toBe(true);
  });

  it('has no region role by default and keeps the id link', () => {
    const { button, body } = render();
    expect(body.hasAttribute('role')).toBe(false);
    expect(body.hasAttribute('aria-labelledby')).toBe(false);
    expect(button.getAttribute('aria-controls')).toBe(body.id);
  });

  it('exposes a labelled region when region is true', () => {
    const { fixture, button, body } = render();
    fixture.componentInstance.region.set(true);
    fixture.detectChanges();
    expect(body.getAttribute('role')).toBe('region');
    expect(body.getAttribute('aria-labelledby')).toBe(button.id);
  });

  it('left-aligns the trigger by default and centers it for align center', () => {
    const { fixture, button } = render();
    const row = button.parentElement as HTMLElement;
    expect(row.classList.contains('justify-center')).toBe(false);
    fixture.componentInstance.align.set('center');
    fixture.detectChanges();
    expect(row.classList.contains('justify-center')).toBe(true);
  });

  it('applies the compact size and projects summary metadata beside the button', () => {
    const { fixture, host, button } = render();
    fixture.componentInstance.size.set('sm');
    fixture.detectChanges();
    expect(button.classList.contains('text-xs')).toBe(true);
    const meta = host.querySelector('[data-testid="meta"]') as HTMLElement;
    expect(meta.textContent).toBe('2 items');
    expect(meta.parentElement).toBe(button.parentElement);
  });
});
