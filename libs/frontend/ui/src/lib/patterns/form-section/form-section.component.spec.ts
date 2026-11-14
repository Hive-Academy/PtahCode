import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahFormSectionComponent } from './form-section.component';

@Component({
  standalone: true,
  imports: [PtahFormSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-form-section
      [heading]="heading()"
      [description]="description()"
      [level]="level()"
      [divider]="divider()"
      [disabled]="disabled()"
      [error]="error()"
    >
      <span aside data-testid="aside-content">Beta</span>
      <input data-testid="field-input" aria-label="Name" />
      <button footer type="button" data-testid="footer-content">Delete</button>
    </ptah-form-section>
  `,
})
class HostComponent {
  readonly heading = signal('Profile');
  readonly description = signal<string | null>('Shown to other users');
  readonly level = signal<number | string>(3);
  readonly divider = signal(false);
  readonly disabled = signal(false);
  readonly error = signal<string | null>(null);
}

const RAW_SPACING = /\b(gap|p|px|py|m|mx|my|space-[xy])-\d/;

describe('PtahFormSectionComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  const q = <T extends Element = HTMLElement>(sel: string): T | null =>
    el.querySelector<T>(sel);
  const section = (): HTMLElement =>
    q('[data-testid="form-section"]') as HTMLElement;
  const fields = (): HTMLElement =>
    q('[data-testid="form-section-fields"]') as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('marks the host with data-ptah-pattern and a size container', () => {
    const patternHost = q('ptah-form-section') as HTMLElement;
    expect(patternHost.getAttribute('data-ptah-pattern')).toBe('form-section');
    expect(patternHost.classList.contains('[container-type:inline-size]')).toBe(
      true,
    );
  });

  it.each([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
    ['4', 'H4'],
    [7, 'H3'],
  ])('renders level %p as %s', (level, tag) => {
    host.level.set(level);
    fixture.detectChanges();
    const heading = section().querySelector('h2, h3, h4') as HTMLElement;
    expect(heading.tagName).toBe(tag);
    expect(heading.textContent?.trim()).toBe('Profile');
  });

  it('labels the section with the heading id', () => {
    const heading = section().querySelector('h3') as HTMLElement;
    expect(section().tagName).toBe('SECTION');
    expect(heading.id).toMatch(/^ptah-form-section-\d+-title$/);
    expect(section().getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('exposes headingId equal to the rendered heading id', () => {
    const cmp = fixture.debugElement.children[0]
      .componentInstance as PtahFormSectionComponent;
    expect(section().querySelector('h3')?.id).toBe(cmp.headingId);
  });

  it('gives each instance a unique heading id', () => {
    const other = TestBed.createComponent(HostComponent);
    other.detectChanges();
    const otherId = (other.nativeElement as HTMLElement).querySelector('h3')?.id;
    expect(otherId).toBeTruthy();
    expect(otherId).not.toBe(section().querySelector('h3')?.id);
  });

  it('describes the section with the description, and the error when present', () => {
    const desc = q('[data-testid="form-section-description"]') as HTMLElement;
    expect(section().getAttribute('aria-describedby')).toBe(desc.id);

    host.error.set('Save failed');
    fixture.detectChanges();
    const alert = q('[data-testid="form-section-error"]') as HTMLElement;
    expect(alert.querySelector('[role="alert"]')).not.toBeNull();
    expect(section().getAttribute('aria-describedby')).toBe(
      `${desc.id} ${alert.id}`,
    );

    host.description.set(null);
    host.error.set(null);
    fixture.detectChanges();
    expect(q('[data-testid="form-section-description"]')).toBeNull();
    expect(section().hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows the error as an alert at the top of the fields column', () => {
    expect(q('[data-testid="form-section-error"]')).toBeNull();
    host.error.set('Save failed');
    fixture.detectChanges();
    const alert = q('[data-testid="form-section-error"]') as HTMLElement;
    expect(alert.tagName.toLowerCase()).toBe('ptah-alert');
    expect(alert.querySelector('.alert-error[role="alert"]')).not.toBeNull();
    expect(alert.textContent?.trim()).toBe('Save failed');
    const body = q('[data-testid="form-section-body"]') as HTMLElement;
    expect(body.firstElementChild).toBe(alert);
    expect(alert.nextElementSibling).toBe(fields());
  });

  it('keeps the error alert outside the inert wrapper when disabled', () => {
    host.disabled.set(true);
    host.error.set('Save failed');
    fixture.detectChanges();
    const alert = q('[data-testid="form-section-error"]') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(alert.closest('[inert]')).toBeNull();
    expect(fields().contains(alert)).toBe(false);
    expect(fields().hasAttribute('inert')).toBe(true);
    expect(alert.className).not.toContain('opacity');
    const ids = section().getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toContain(alert.id);
  });

  it('makes only the fields column inert when disabled', () => {
    expect(fields().hasAttribute('inert')).toBe(false);
    expect(fields().hasAttribute('aria-disabled')).toBe(false);

    host.disabled.set(true);
    fixture.detectChanges();
    expect(fields().hasAttribute('inert')).toBe(true);
    expect(fields().getAttribute('aria-disabled')).toBe('true');
    expect(
      fields().classList.contains('opacity-[var(--ptah-field-disabled-opacity)]'),
    ).toBe(true);
    expect(fields().classList.contains('gap-[var(--ptah-gap-field)]')).toBe(true);
    const aside = q('[data-testid="form-section-aside"]') as HTMLElement;
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(aside.className).not.toContain('opacity');
  });

  it('draws the divider only when divider is set', () => {
    const divider = '[border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)]';
    expect(section().classList.contains(divider)).toBe(false);
    expect(section().hasAttribute('style')).toBe(false);
    host.divider.set(true);
    fixture.detectChanges();
    expect(section().classList.contains(divider)).toBe(true);
    expect(section().classList.contains('grid')).toBe(true);
    host.divider.set(false);
    fixture.detectChanges();
    expect(section().classList.contains(divider)).toBe(false);
  });

  it('sets the type tokens as classes, with no inline style', () => {
    const heading = q('h3') as HTMLElement;
    expect(heading.classList.contains('text-[length:var(--ptah-text-section-title-size)]')).toBe(true);
    expect(heading.hasAttribute('style')).toBe(false);
    const hint = q('[data-testid="form-section-description"]') as HTMLElement;
    expect(hint.classList.contains('text-[length:var(--ptah-text-hint-size)]')).toBe(true);
    expect(hint.classList.contains('text-base-content-muted')).toBe(true);
    expect(hint.hasAttribute('style')).toBe(false);
  });

  it('projects the aside, default and footer slots into their columns', () => {
    const aside = q('[data-testid="form-section-aside"]') as HTMLElement;
    expect(aside.contains(q('[data-testid="aside-content"]'))).toBe(true);
    expect(fields().contains(q('[data-testid="field-input"]'))).toBe(true);
    const footer = q('[data-testid="footer-content"]') as HTMLElement;
    expect(fields().contains(footer)).toBe(true);
    expect(fields().lastElementChild?.contains(footer)).toBe(true);
  });

  it('stacks below 640px of its own container and splits above it', () => {
    const classes = Array.from(section().classList);
    expect(classes).toContain('grid-cols-1');
    expect(classes).toContain(
      '[@container(min-width:640px)]:grid-cols-[var(--ptah-form-section-aside-w)_minmax(0,var(--ptah-form-section-fields-max-w))]',
    );
  });

  it('uses no raw spacing utility on any rendered element', () => {
    host.error.set('Save failed');
    host.divider.set(true);
    fixture.detectChanges();
    const patternHost = q('ptah-form-section') as HTMLElement;
    const nodes = [patternHost, ...Array.from(patternHost.querySelectorAll('*'))];
    for (const node of nodes) {
      for (const cls of Array.from(node.classList)) {
        expect({ cls, raw: RAW_SPACING.test(cls) }).toEqual({ cls, raw: false });
      }
    }
  });
});
