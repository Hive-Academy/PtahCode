import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PtahCardPadding, PtahCardVariant } from './card.types';
import { PtahSurfaceDirective } from './surface.directive';

const CSS = readFileSync(join(__dirname, 'ptah-card.css'), 'utf8');

@Component({
  standalone: true,
  imports: [PtahSurfaceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section
      ptahSurface
      class="flex gap-2"
      data-testid="panel"
      [variant]="variant()"
      [padding]="padding()"
    >
      <span>Child</span>
    </section>
    <div ptahSurface data-testid="plain">Plain</div>`,
})
class HostComponent {
  readonly variant = signal<PtahCardVariant>('card');
  readonly padding = signal<PtahCardPadding>('md');
}

describe('PtahSurfaceDirective', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const panel = root.querySelector('[data-testid="panel"]') as HTMLElement;
    return { fixture, root, panel };
  }

  it('adds the card recipe and keeps the DOM and the own classes', () => {
    const { root, panel } = setup();
    expect(panel.tagName).toBe('SECTION');
    expect(panel.classList).toContain('ptah-card');
    expect(panel.classList).toContain('flex');
    expect(panel.classList).toContain('gap-2');
    expect(panel.children.length).toBe(1);
    const plain = root.querySelector('[data-testid="plain"]') as HTMLElement;
    expect(plain.dataset['variant']).toBe('card');
    expect(plain.dataset['padding']).toBe('md');
    expect(plain.getAttribute('role')).toBeNull();
    expect(plain.getAttribute('tabindex')).toBeNull();
  });

  it.each<PtahCardVariant>(['card', 'subtle', 'inset', 'raised'])(
    'sets the %s variant',
    (variant) => {
      const { fixture, panel } = setup();
      fixture.componentInstance.variant.set(variant);
      fixture.detectChanges();
      expect(panel.dataset['variant']).toBe(variant);
    },
  );

  it.each<PtahCardPadding>(['none', 'sm', 'md', 'lg'])(
    'sets the %s padding',
    (padding) => {
      const { fixture, panel } = setup();
      fixture.componentInstance.padding.set(padding);
      fixture.detectChanges();
      expect(panel.dataset['padding']).toBe(padding);
    },
  );
});

describe('ptah-card.css', () => {
  it('reads the card tokens for the look', () => {
    for (const token of [
      '--ptah-card-bg',
      '--ptah-card-border',
      '--ptah-card-radius',
      '--ptah-card-padding-md',
      '--ptah-card-gap',
      '--ptah-card-shadow',
      '--ptah-card-hover-border',
      '--ptah-card-selected-ring',
      '--ptah-card-disabled-opacity',
      '--ptah-section-title-size',
      '--ptah-section-eyebrow-tracking',
    ]) {
      expect(CSS).toContain(`var(${token}`);
    }
  });

  it('has a rule for each variant, padding and state', () => {
    for (const selector of [
      "[data-variant='subtle']",
      "[data-variant='inset']",
      "[data-variant='raised']",
      "[data-padding='none']",
      "[data-padding='sm']",
      "[data-padding='lg']",
      '[data-selected]',
      '[data-disabled]',
      ':focus-visible',
      ':hover',
    ]) {
      expect(CSS).toContain(selector);
    }
  });

  it('does not set a layout on the panel recipe', () => {
    const base = /\n\.ptah-card \{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(base).toContain('background-color');
    expect(base).not.toMatch(/\bdisplay\b|\bposition\b|\boverflow\b/);
  });

  it('has no @layer, @apply or @tailwind', () => {
    expect(CSS).not.toMatch(/@(layer|apply|tailwind)\b/);
  });
});
