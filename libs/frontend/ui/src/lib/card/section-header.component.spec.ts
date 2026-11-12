import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PtahSectionLevel, PtahSectionSize } from './card.types';
import { PtahSectionHeaderComponent } from './section-header.component';

@Component({
  standalone: true,
  imports: [PtahSectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-section-header
      data-testid="full"
      heading="Providers"
      [level]="level()"
      [size]="size()"
      [eyebrow]="eyebrow()"
      [description]="description()"
    >
      <span status data-testid="status">3 active</span>
      <button actions type="button" data-testid="action">Add</button>
    </ptah-section-header>
    <ptah-section-header data-testid="bare" heading="Plain" level="2" />`,
})
class HostComponent {
  readonly level = signal<PtahSectionLevel>(3);
  readonly size = signal<PtahSectionSize>('group');
  readonly eyebrow = signal<string | null>(null);
  readonly description = signal<string | null>(null);
}

describe('PtahSectionHeaderComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const full = root.querySelector('[data-testid="full"]') as HTMLElement;
    const bare = root.querySelector('[data-testid="bare"]') as HTMLElement;
    return { fixture, full, bare };
  }

  it('renders the heading as h3 by default with the group size', () => {
    const { full } = setup();
    const heading = full.querySelector('h3');
    expect(heading?.textContent?.trim()).toBe('Providers');
    expect(heading?.classList).toContain('ptah-section-title');
    expect(full.hasAttribute('data-ptah-section-header')).toBe(true);
    expect(full.dataset['size']).toBe('group');
  });

  it.each<[PtahSectionLevel, string]>([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ])('renders level %s as %s', (level, tag) => {
    const { fixture, full } = setup();
    fixture.componentInstance.level.set(level);
    fixture.detectChanges();
    expect(full.querySelector('.ptah-section-title')?.tagName).toBe(tag);
  });

  it('accepts a static level attribute', () => {
    const { bare } = setup();
    expect(bare.querySelector('h2')?.textContent?.trim()).toBe('Plain');
  });

  it('sets the section size', () => {
    const { fixture, full } = setup();
    fixture.componentInstance.size.set('section');
    fixture.detectChanges();
    expect(full.dataset['size']).toBe('section');
  });

  it('shows the eyebrow and the description only when set', () => {
    const { fixture, full } = setup();
    const eyebrow = () => full.querySelector('[data-testid="section-header-eyebrow"]');
    const description = () =>
      full.querySelector('[data-testid="section-header-description"]');
    expect(eyebrow()).toBeNull();
    expect(description()).toBeNull();
    fixture.componentInstance.eyebrow.set('Settings');
    fixture.componentInstance.description.set('Connected model routes');
    fixture.detectChanges();
    expect(eyebrow()?.textContent?.trim()).toBe('Settings');
    expect(description()?.textContent?.trim()).toBe('Connected model routes');
  });

  it('projects the status next to the heading and the actions at the end', () => {
    const { full } = setup();
    const status = full.querySelector('[data-testid="status"]');
    expect(status?.parentElement?.classList).toContain('ptah-section-title-row');
    expect(full.querySelector('h3')?.textContent).not.toContain('3 active');
    const actions = full.querySelector('[data-testid="section-header-actions"]');
    expect(actions?.querySelector('[data-testid="action"]')).not.toBeNull();
  });

  it('leaves the actions box empty when no action is given', () => {
    const { bare } = setup();
    const actions = bare.querySelector('[data-testid="section-header-actions"]');
    expect(actions?.childElementCount).toBe(0);
  });
});
