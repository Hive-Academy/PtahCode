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
    [ariaLabelledby]="labelledby()"
    (activated)="activations = activations + 1"
  >
    <div card-header data-testid="header"><h3 id="card-heading">Header</h3></div>
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
  readonly labelledby = signal<string | null>(null);
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

  it('has no look utility class on a non-legacy card', () => {
    const { card, update } = setup();
    for (const variant of ['card', 'subtle', 'inset', 'raised'] as const) {
      update((h) => h.variant.set(variant));
      expect(card().classList).not.toContain('rounded-xl');
    }
  });

  it('keeps the old classes for the temporary legacy variant', () => {
    const { card, update } = setup();
    update((h) => h.variant.set('legacy'));
    expect(card().classList).not.toContain('ptah-card');
    expect(card().classList).toContain('surface-2');
    expect(card().classList).toContain('rounded-xl');
    expect(card().classList).toContain('p-4');
    expect(card().classList).toContain('elev-1');
    update((h) => h.elevation.set(2));
    expect(card().classList).toContain('elev-3');
    expect(card().classList).not.toContain('elev-1');
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
    const { fixture, card, by } = setup();
    expect(by('surface-card-activator')).toBeNull();
    card().click();
    expect(fixture.componentInstance.activations).toBe(0);
  });

  it('is a named button target when interactive', () => {
    const { fixture, card, by, update } = setup();
    update((h) => {
      h.interactive.set(true);
      h.label.set('Open details');
    });
    const activator = by('surface-card-activator') as HTMLButtonElement;
    expect(activator.tagName).toBe('BUTTON');
    expect(activator.type).toBe('button');
    expect(activator.getAttribute('aria-label')).toBe('Open details');
    expect(card().getAttribute('role')).toBeNull();
    expect(card().getAttribute('tabindex')).toBeNull();
    expect(card().hasAttribute('data-interactive')).toBe(true);
    activator.click();
    expect(fixture.componentInstance.activations).toBe(1);
  });

  it('accepts clickable as the same as interactive', () => {
    const { fixture, by, update } = setup();
    update((h) => { h.clickable.set(true); h.label.set('Clickable card'); });
    expect(by('surface-card-activator').getAttribute('aria-label')).toBe('Clickable card');
    by('surface-card-activator').click();
    expect(fixture.componentInstance.activations).toBe(1);
  });

  it('activates once per click of the native button', () => {
    const { fixture, card, by, update } = setup();
    update((h) => { h.interactive.set(true); h.label.set('Open details'); });
    const activator = by('surface-card-activator');
    for (const key of ['Enter', ' ']) {
      activator.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      // jsdom does not synthesize the native click after a keyboard event.
      activator.click();
    }
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    by('nested').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.activations).toBe(2);
  });

  it('keeps nested controls independent of the activator', () => {
    const { fixture, by, card, update } = setup();
    update((h) => { h.interactive.set(true); h.label.set('Open details'); });
    by('nested').click();
    by('ignored').click();
    expect(fixture.componentInstance.activations).toBe(0);
    by('header').click();
    card().click();
    expect(fixture.componentInstance.activations).toBe(0);
  });

  it('shows aria-pressed and the selected state when selectable', () => {
    const { card, by, update } = setup();
    update((h) => { h.selectable.set(true); h.label.set('Select card'); });
    expect(by('surface-card-activator').getAttribute('aria-pressed')).toBe('false');
    expect(card().hasAttribute('data-selected')).toBe(false);
    update((h) => h.selected.set(true));
    expect(by('surface-card-activator').getAttribute('aria-pressed')).toBe('true');
    expect(card().hasAttribute('data-selected')).toBe(true);
  });

  it('ignores selected when the card is not selectable', () => {
    const { card, update } = setup();
    update((h) => h.selected.set(true));
    expect(card().hasAttribute('data-selected')).toBe(false);
    expect(card().querySelector('button.ptah-card-activator')).toBeNull();
  });

  it('stops activation with native disabled state', () => {
    const { fixture, card, by, update } = setup();
    update((h) => {
      h.interactive.set(true);
      h.label.set('Disabled card');
      h.disabled.set(true);
    });
    const activator = by('surface-card-activator') as HTMLButtonElement;
    expect(activator.disabled).toBe(true);
    expect(card().getAttribute('tabindex')).toBeNull();
    expect(card().hasAttribute('data-disabled')).toBe(true);
    activator.click();
    activator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.activations).toBe(0);
  });

  it('uses a heading id when ariaLabel is blank', () => {
    const { by, update } = setup();
    update((h) => {
      h.interactive.set(true);
      h.label.set('  ');
      h.labelledby.set('card-heading');
    });
    expect(by('surface-card-activator').getAttribute('aria-label')).toBeNull();
    expect(by('surface-card-activator').getAttribute('aria-labelledby')).toBe('card-heading');
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
