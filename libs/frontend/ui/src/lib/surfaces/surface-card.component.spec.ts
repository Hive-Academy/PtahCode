import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  PtahCardDensity,
  PtahCardPadding,
  PtahCardTone,
  PtahCardVariant,
} from '../card/card.types';
import { SurfaceCardComponent } from './surface-card.component';

@Component({
  standalone: true,
  imports: [SurfaceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-surface-card
    [variant]="variant()"
    [padding]="padding()"
    [density]="density()"
    [tone]="tone()"
    [spine]="spine()"
    [interactive]="interactive()"
    [clickable]="clickable()"
    [selectable]="selectable()"
    [selected]="selected()"
    [disabled]="disabled()"
    [elevation]="elevation()"
    [ariaLabel]="label()"
    (activated)="activations = activations + 1"
  >
    <div card-header data-testid="header">Header</div>
    <p data-testid="body">Body <button type="button" data-testid="nested">Act</button></p>
    <span data-card-ignore data-testid="ignored">Ignored</span>
    <div card-footer data-testid="footer">Footer</div>
  </ptah-surface-card>`,
})
class HostComponent {
  readonly variant = signal<PtahCardVariant>('card');
  readonly padding = signal<PtahCardPadding | null>(null);
  readonly density = signal<PtahCardDensity>('comfortable');
  readonly tone = signal<PtahCardTone>('neutral');
  readonly spine = signal(false);
  readonly interactive = signal(false);
  readonly clickable = signal(false);
  readonly selectable = signal(false);
  readonly selected = signal(false);
  readonly disabled = signal(false);
  readonly elevation = signal<1 | 2>(1);
  readonly label = signal<string | null>(null);
  activations = 0;
}

@Component({
  standalone: true,
  imports: [SurfaceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-surface-card aria-label="Curator model" class="block"
    >Model line</ptah-surface-card
  >`,
})
class LegacyHostComponent {}

describe('SurfaceCardComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const card = (): HTMLElement =>
      root.querySelector('[data-testid="surface-card"]') as HTMLElement;
    const by = (id: string): HTMLElement =>
      root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const update = (fn: (h: HostComponent) => void): void => {
      fn(fixture.componentInstance);
      fixture.detectChanges();
    };
    return { fixture, root, card, by, update };
  }

  it('renders the default card recipe', () => {
    const { card } = setup();
    expect(card().classList).toContain('ptah-card');
    expect(card().dataset['variant']).toBe('card');
    expect(card().dataset['padding']).toBe('md');
    expect(card().dataset['tone']).toBe('neutral');
    expect(card().getAttribute('role')).toBeNull();
    expect(card().getAttribute('tabindex')).toBeNull();
    expect(card().hasAttribute('data-interactive')).toBe(false);
  });

  it.each<PtahCardVariant>(['card', 'subtle', 'inset', 'raised'])(
    'sets the %s variant',
    (variant) => {
      const { card, update } = setup();
      update((h) => h.variant.set(variant));
      expect(card().dataset['variant']).toBe(variant);
    },
  );

  it.each<PtahCardPadding>(['none', 'sm', 'md', 'lg'])(
    'sets the %s padding',
    (padding) => {
      const { card, update } = setup();
      update((h) => h.padding.set(padding));
      expect(card().dataset['padding']).toBe(padding);
    },
  );

  it('maps the compact density to the sm padding', () => {
    const { card, update } = setup();
    update((h) => h.density.set('compact'));
    expect(card().dataset['padding']).toBe('sm');
    update((h) => h.padding.set('lg'));
    expect(card().dataset['padding']).toBe('lg');
  });

  it('maps the old elevation 2 to the raised variant', () => {
    const { card, update } = setup();
    update((h) => h.elevation.set(2));
    expect(card().dataset['variant']).toBe('raised');
    update((h) => h.variant.set('inset'));
    expect(card().dataset['variant']).toBe('inset');
  });

  it('projects the header, body and footer slots in order', () => {
    const { by } = setup();
    const body = by('surface-card-body');
    const order = Array.from(body.children).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(order).toEqual(['header', 'body', 'ignored', 'footer']);
  });

  it('shows the spine only when asked, in the tone', () => {
    const { by, card, update } = setup();
    expect(by('surface-card-spine')).toBeNull();
    update((h) => {
      h.spine.set(true);
      h.tone.set('warning');
    });
    expect(by('surface-card-spine')).not.toBeNull();
    expect(by('surface-card-spine').getAttribute('aria-hidden')).toBe('true');
    expect(card().hasAttribute('data-spine')).toBe(true);
    expect(card().dataset['tone']).toBe('warning');
  });

  it('does not activate when it is not interactive', () => {
    const { fixture, card } = setup();
    card().click();
    expect(fixture.componentInstance.activations).toBe(0);
  });

  it('is a named button target when interactive', () => {
    const { fixture, card, update } = setup();
    update((h) => {
      h.interactive.set(true);
      h.label.set('Open details');
    });
    expect(card().getAttribute('role')).toBe('button');
    expect(card().getAttribute('tabindex')).toBe('0');
    expect(card().getAttribute('aria-label')).toBe('Open details');
    expect(card().hasAttribute('data-interactive')).toBe(true);
    card().click();
    expect(fixture.componentInstance.activations).toBe(1);
  });

  it('accepts clickable as the same as interactive', () => {
    const { fixture, card, update } = setup();
    update((h) => h.clickable.set(true));
    expect(card().getAttribute('role')).toBe('button');
    card().click();
    expect(fixture.componentInstance.activations).toBe(1);
  });

  it('activates on Enter and Space on the card only', () => {
    const { fixture, card, by, update } = setup();
    update((h) => h.interactive.set(true));
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      card().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    by('nested').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.activations).toBe(2);
  });

  it('ignores clicks on nested controls and [data-card-ignore]', () => {
    const { fixture, by, update } = setup();
    update((h) => h.interactive.set(true));
    by('nested').click();
    by('ignored').click();
    expect(fixture.componentInstance.activations).toBe(0);
    by('header').click();
    expect(fixture.componentInstance.activations).toBe(1);
  });

  it('shows aria-pressed and the selected state when selectable', () => {
    const { card, update } = setup();
    update((h) => h.selectable.set(true));
    expect(card().getAttribute('role')).toBe('button');
    expect(card().getAttribute('aria-pressed')).toBe('false');
    expect(card().hasAttribute('data-selected')).toBe(false);
    update((h) => h.selected.set(true));
    expect(card().getAttribute('aria-pressed')).toBe('true');
    expect(card().hasAttribute('data-selected')).toBe(true);
  });

  it('ignores selected when the card is not selectable', () => {
    const { card, update } = setup();
    update((h) => h.selected.set(true));
    expect(card().hasAttribute('data-selected')).toBe(false);
    expect(card().getAttribute('aria-pressed')).toBeNull();
  });

  it('stops activation and removes the tab stop when disabled', () => {
    const { fixture, card, update } = setup();
    update((h) => {
      h.interactive.set(true);
      h.disabled.set(true);
    });
    expect(card().getAttribute('aria-disabled')).toBe('true');
    expect(card().getAttribute('tabindex')).toBeNull();
    expect(card().hasAttribute('data-disabled')).toBe(true);
    card().click();
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.activations).toBe(0);
  });

  it('keeps the old consumer markup working', () => {
    const fixture = TestBed.createComponent(LegacyHostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('ptah-surface-card[aria-label="Curator model"]');
    expect(host?.textContent).toContain('Model line');
    expect(host?.querySelector('.ptah-card')?.getAttribute('data-variant')).toBe('card');
  });
});
