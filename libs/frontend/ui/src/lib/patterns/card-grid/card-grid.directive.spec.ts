import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahCardGridDirective, PtahCardGridVariant } from './card-grid.directive';

@Component({
  standalone: true,
  imports: [PtahCardGridDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div ptahCardGrid [variant]="variant()" class="mt-1" data-testid="grid">
      <div>A</div>
      <div>B</div>
    </div>
  `,
})
class HostComponent {
  readonly variant = signal<PtahCardGridVariant>('default');
}

describe('PtahCardGridDirective', () => {
  const setup = () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const grid = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="grid"]',
    ) as HTMLElement;
    return { fixture, grid };
  };

  it('marks the host and applies the token-backed grid classes', () => {
    const { grid } = setup();
    expect(grid.getAttribute('data-ptah-pattern')).toBe('card-grid');
    expect(grid.getAttribute('data-variant')).toBe('default');
    expect(grid.classList.contains('grid')).toBe(true);
    expect(grid.classList.contains('items-start')).toBe(true);
    expect(grid.classList.contains('gap-[var(--ptah-card-grid-gap)]')).toBe(true);
    expect(
      grid.classList.contains(
        'grid-cols-[repeat(auto-fill,minmax(min(var(--ptah-card-grid-min),100%),1fr))]',
      ),
    ).toBe(true);
  });

  it('keeps the classes of the consumer', () => {
    const { grid } = setup();
    expect(grid.classList.contains('mt-1')).toBe(true);
  });

  it.each([
    ['tight', '--ptah-card-grid-min-tight'],
    ['pair', '--ptah-card-grid-min-pair'],
    ['wide', '--ptah-card-grid-min-wide'],
  ] as const)('uses the %s track minimum', (variant, token) => {
    const { fixture, grid } = setup();
    fixture.componentInstance.variant.set(variant);
    fixture.detectChanges();
    expect(grid.getAttribute('data-variant')).toBe(variant);
    expect(
      grid.classList.contains(`grid-cols-[repeat(auto-fill,minmax(min(var(${token}),100%),1fr))]`),
    ).toBe(true);
    expect(
      grid.classList.contains(
        'grid-cols-[repeat(auto-fill,minmax(min(var(--ptah-card-grid-min),100%),1fr))]',
      ),
    ).toBe(false);
    expect(grid.classList.contains('mt-1')).toBe(true);
  });
});
