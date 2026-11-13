import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  PtahCardBorder,
  PtahCardFill,
  PtahCardPadding,
  PtahCardShadow,
  PtahCardTone,
  PtahCardVariant,
} from './card.types';
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
      [tone]="tone()"
      [toneBorder]="toneBorder()"
      [translucent]="translucent()"
      [shadow]="shadow()"
      [border]="border()"
    >
      <span>Child</span>
    </section>
    <div ptahSurface data-testid="plain">Plain</div>`,
})
class HostComponent {
  readonly variant = signal<PtahCardVariant>('card');
  readonly padding = signal<PtahCardPadding>('md');
  readonly tone = signal<PtahCardTone>('neutral');
  readonly toneBorder = signal(false);
  readonly translucent = signal<PtahCardFill>(100);
  readonly shadow = signal<PtahCardShadow>('none');
  readonly border = signal<PtahCardBorder>('default');
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

  it.each<PtahCardVariant>(['card', 'subtle', 'inset', 'raised', 'surface-1', 'surface-2'])(
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

  it('reflects optional owner looks without adding default attributes or a spine', () => {
    const { fixture, panel } = setup();
    for (const name of ['tone', 'toneBorder', 'fill', 'shadow', 'border']) {
      expect(panel.dataset[name]).toBeUndefined();
    }
    fixture.componentInstance.tone.set('info');
    fixture.componentInstance.toneBorder.set(true);
    fixture.componentInstance.translucent.set(50);
    fixture.componentInstance.shadow.set('sm');
    fixture.componentInstance.border.set('faint');
    fixture.detectChanges();
    expect(panel.dataset['tone']).toBe('info');
    expect(panel.hasAttribute('data-tone-border')).toBe(true);
    expect(panel.dataset['fill']).toBe('50');
    expect(panel.dataset['shadow']).toBe('sm');
    expect(panel.dataset['border']).toBe('faint');
    expect(panel.querySelector('.ptah-card-spine')).toBeNull();
  });
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
      "[data-variant='surface-1']",
      "[data-variant='surface-2']",
      "[data-fill='50']",
      "[data-shadow='sm']",
      "[data-border='faint']",
      '[data-tone-border]',
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
