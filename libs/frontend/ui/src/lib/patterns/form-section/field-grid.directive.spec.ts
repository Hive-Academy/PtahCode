import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahFieldGridDirective } from './field-grid.directive';

@Component({
  standalone: true,
  imports: [PtahFieldGridDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div ptahFieldGrid [minColumn]="minimum()"><span>First</span><span>Second</span></div>',
})
class HostComponent {
  readonly minimum = signal<'sm' | 'md'>('sm');
}

describe('PtahFieldGridDirective', () => {
  it('uses fluid small tracks by default and updates to medium tracks', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const grid: HTMLElement = fixture.nativeElement.querySelector('[ptahFieldGrid]');
    expect(grid.classList.contains('grid')).toBe(true);
    expect(grid.className).toContain('gap-[var(--ptah-gap-field)]');
    expect(grid.className).toContain(
      'repeat(auto-fit,minmax(min(100%,max(var(--ptah-field-grid-min-sm),calc((100%_-_2*var(--ptah-gap-field))/3))),1fr))',
    );
    fixture.componentInstance.minimum.set('md');
    fixture.detectChanges();
    expect(grid.className).toContain('var(--ptah-field-grid-min-md)');
    expect(grid.className).not.toContain('var(--ptah-field-grid-min-sm)');
    expect(grid.children).toHaveLength(2);
  });

  it('defaults to small tracks and caps every variant at three columns', () => {
    @Component({
      standalone: true,
      imports: [PtahFieldGridDirective],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: '<div ptahFieldGrid><span>Only</span></div>',
    })
    class DefaultHostComponent {}

    const fixture = TestBed.createComponent(DefaultHostComponent);
    fixture.detectChanges();
    const grid: HTMLElement = fixture.nativeElement.querySelector('[ptahFieldGrid]');
    expect(grid.className).toContain('var(--ptah-field-grid-min-sm)');
    expect(grid.className).toContain('calc((100%_-_2*var(--ptah-gap-field))/3)');
  });
});
