import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahButtonDirective } from '../../button/button.directive';
import {
  isPtahDescriptionValueEmpty,
  PtahDescriptionItem,
  PtahDescriptionItemComponent,
  PtahDescriptionListComponent,
} from './description-list.component';

const RAW_SPACING = /\b(gap|p|px|py|m|mx|my|space-[xy])-\d/;

function rawSpacingClasses(root: HTMLElement): string[] {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*:not(button):not(button *)'))];
  return nodes.flatMap((node) => Array.from(node.classList)).filter((name) => RAW_SPACING.test(name));
}

function renderList(items: readonly PtahDescriptionItem[] | null, divided = true): ComponentFixture<PtahDescriptionListComponent> {
  const fixture = TestBed.createComponent(PtahDescriptionListComponent);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('divided', divided);
  fixture.detectChanges();
  return fixture;
}

describe('isPtahDescriptionValueEmpty', () => {
  it.each([
    [null, true],
    [undefined, true],
    ['', true],
    ['  ', true],
    [0, false],
    ['0', false],
    ['value', false],
  ])('treats %p as empty=%p', (value, expected) => {
    expect(isPtahDescriptionValueEmpty(value)).toBe(expected);
  });
});

describe('PtahDescriptionListComponent (data API)', () => {
  const items: readonly PtahDescriptionItem[] = [
    { key: 'null', term: 'Null', value: null },
    { key: 'undef', term: 'Undefined', value: undefined },
    { key: 'blank', term: 'Blank', value: '' },
    { key: 'space', term: 'Space', value: '  ' },
    { key: 'zero', term: 'Zero', value: 0 },
    { key: 'id', term: 'Account ID', value: 'acc_123', mono: true, truncate: true },
  ];

  it('marks the host and renders real dl, dt and dd rows', () => {
    const fixture = renderList(items);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-ptah-pattern')).toBe('description-list');
    expect(host.classList.contains('[container-type:inline-size]')).toBe(true);
    const rows = host.querySelectorAll('dl > [data-ptah-description-row]');
    expect(rows).toHaveLength(6);
    expect(Array.from(host.querySelectorAll('dt')).map((dt) => dt.textContent?.trim())).toEqual([
      'Null', 'Undefined', 'Blank', 'Space', 'Zero', 'Account ID',
    ]);
  });

  it('shows the placeholder for null, undefined, empty and whitespace values but not for 0', () => {
    const fixture = renderList(items);
    const dds = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('dd'));
    const empty = dds.map((dd) => dd.hasAttribute('data-ptah-description-empty'));
    expect(empty).toEqual([true, true, true, true, false, false]);
    expect(dds[0].querySelector('[aria-hidden="true"]')?.textContent).toBe('Not set');
    expect(dds[0].querySelector('.sr-only')?.textContent).toBe('Null not set');
    expect(dds[4].textContent?.trim()).toBe('0');
  });

  it('applies mono and truncate with a title', () => {
    const fixture = renderList(items);
    const dd = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('dd'))[5];
    expect(dd.classList.contains('font-[family-name:var(--ptah-font-mono)]')).toBe(true);
    expect(dd.classList.contains('truncate')).toBe(true);
    expect(dd.getAttribute('title')).toBe('acc_123');
  });

  it('uses custom empty text and aria-label', () => {
    const fixture = TestBed.createComponent(PtahDescriptionListComponent);
    fixture.componentRef.setInput('items', [{ key: 'a', term: 'Email', value: null }]);
    fixture.componentRef.setInput('emptyText', 'None');
    fixture.componentRef.setInput('ariaLabel', 'Account details');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('dl')?.getAttribute('aria-label')).toBe('Account details');
    expect(host.querySelector('dd [aria-hidden="true"]')?.textContent).toBe('None');
  });

  it('shows the empty text once for an empty list', () => {
    const fixture = renderList([]);
    const host = fixture.nativeElement as HTMLElement;
    const rows = host.querySelectorAll('[data-ptah-description-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].hasAttribute('data-ptah-description-list-empty')).toBe(true);
    const term = rows[0].querySelector('dt');
    expect(term).not.toBeNull();
    expect(term?.classList.contains('sr-only')).toBe(true);
    expect(term?.textContent).toBe('');
    expect(rows[0].firstElementChild?.tagName).toBe('DT');
    expect(rows[0].textContent?.trim()).toBe('Not set');
  });

  it('switches between divider rows and gap rows', () => {
    const fixture = renderList(items);
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector('[data-ptah-description-row]') as HTMLElement;
    expect(row.classList.contains('[border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)]')).toBe(true);
    fixture.componentRef.setInput('divided', false);
    fixture.detectChanges();
    expect(row.classList.contains('[border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)]')).toBe(false);
    expect(host.querySelector('dl')?.classList.contains('gap-[var(--ptah-gap-controls)]')).toBe(true);
  });

  it('stacks below 640px and uses three columns from 640px', () => {
    const fixture = renderList(items);
    const row = (fixture.nativeElement as HTMLElement).querySelector('[data-ptah-description-row]') as HTMLElement;
    expect(row.classList.contains('grid')).toBe(true);
    expect(row.classList.contains('[@container(min-width:640px)]:grid-cols-[var(--ptah-dl-term-w)_minmax(0,1fr)_auto]')).toBe(true);
  });

  it('uses no raw spacing utility', () => {
    const fixture = renderList(items);
    expect(rawSpacingClasses(fixture.nativeElement as HTMLElement)).toEqual([]);
  });
});

@Component({
  standalone: true,
  imports: [PtahDescriptionListComponent, PtahDescriptionItemComponent, PtahButtonDirective],
  template: `
    <ptah-description-list ariaLabel="Details">
      <ptah-description-item term="Status"><span class="badge">Active</span></ptah-description-item>
      <ptah-description-item term="Email" [value]="email()" />
      <ptah-description-item term="Nickname" />
      <ptah-description-item term="Count" [value]="0" />
      <ptah-description-item term="Key" value="sk-1" mono truncate>
        <button ptahButton actions variant="ghost" size="xs" type="button">Copy</button>
      </ptah-description-item>
      <ptah-description-item term="Bound empty" value="  "><span>Hidden</span></ptah-description-item>
    </ptah-description-list>
  `,
})
class ProjectionHost {
  readonly email = signal<string | null>(null);
}

describe('PtahDescriptionItemComponent (projection API)', () => {
  async function render(): Promise<{ fixture: ComponentFixture<ProjectionHost>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(ProjectionHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  function dd(root: HTMLElement, index: number): HTMLElement {
    return root.querySelectorAll<HTMLElement>('ptah-description-item dd')[index];
  }

  it('renders one row per item with the item host as display contents', async () => {
    const { root } = await render();
    const items = root.querySelectorAll('ptah-description-item');
    expect(items).toHaveLength(6);
    expect(items[0].getAttribute('data-ptah-pattern')).toBe('description-item');
    expect(items[0].classList.contains('contents')).toBe(true);
    expect(root.querySelectorAll('dl dt')).toHaveLength(6);
  });

  it('shows projected rich content and no placeholder', async () => {
    const { root } = await render();
    expect(dd(root, 0).hasAttribute('data-ptah-description-empty')).toBe(false);
    expect(dd(root, 0).querySelector('.badge')?.textContent).toBe('Active');
  });

  it('shows the placeholder for a bound null value and clears it when the value is set', async () => {
    const { fixture, root } = await render();
    expect(dd(root, 1).hasAttribute('data-ptah-description-empty')).toBe(true);
    expect(dd(root, 1).querySelector('.sr-only')?.textContent).toBe('Email not set');
    fixture.componentInstance.email.set('a@example.test');
    fixture.detectChanges();
    expect(dd(root, 1).hasAttribute('data-ptah-description-empty')).toBe(false);
    expect(dd(root, 1).textContent).toContain('a@example.test');
  });

  it('shows the placeholder for an unbound value with an empty slot', async () => {
    const { root } = await render();
    expect(dd(root, 2).hasAttribute('data-ptah-description-empty')).toBe(true);
  });

  it('does not show the placeholder for 0', async () => {
    const { root } = await render();
    expect(dd(root, 3).hasAttribute('data-ptah-description-empty')).toBe(false);
    expect(dd(root, 3).textContent?.trim()).toBe('0');
  });

  it('renders mono, truncate with title and the row action slot', async () => {
    const { root } = await render();
    const value = dd(root, 4);
    expect(value.classList.contains('font-[family-name:var(--ptah-font-mono)]')).toBe(true);
    expect(value.classList.contains('truncate')).toBe(true);
    expect(value.getAttribute('title')).toBe('sk-1');
    const actions = root.querySelectorAll('[data-ptah-description-actions]')[4];
    expect(actions.querySelector('button')?.textContent?.trim()).toBe('Copy');
  });

  it('hides projected content behind the placeholder when the bound value is whitespace', async () => {
    const { root } = await render();
    const value = dd(root, 5);
    expect(value.hasAttribute('data-ptah-description-empty')).toBe(true);
    expect(value.querySelector('[data-ptah-description-slot]')?.classList.contains('hidden')).toBe(true);
  });

  it('uses no raw spacing utility', async () => {
    const { root } = await render();
    expect(rawSpacingClasses(root.querySelector('ptah-description-list') as HTMLElement)).toEqual([]);
  });

  it('works without a parent list', () => {
    const fixture = TestBed.createComponent(PtahDescriptionItemComponent);
    fixture.componentRef.setInput('term', 'Alone');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[aria-hidden="true"]')?.textContent).toBe('Not set');
  });

  it('follows projected content that a toggled @if adds and removes later', async () => {
    @Component({
      standalone: true,
      imports: [PtahDescriptionListComponent, PtahDescriptionItemComponent],
      template: `
        <ptah-description-list>
          <ptah-description-item term="Plan">
            @if (plan(); as name) {
              <span class="badge">{{ name }}</span>
            }
          </ptah-description-item>
        </ptah-description-list>
      `,
    })
    class ToggleHost {
      readonly plan = signal<string | null>(null);
    }
    const fixture = TestBed.createComponent(ToggleHost);
    const settle = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const value = (): HTMLElement => root.querySelector('ptah-description-item dd') as HTMLElement;
    const slot = (): HTMLElement => value().querySelector('[data-ptah-description-slot]') as HTMLElement;
    expect(value().hasAttribute('data-ptah-description-empty')).toBe(true);

    fixture.componentInstance.plan.set('Pro');
    await settle();
    expect(value().hasAttribute('data-ptah-description-empty')).toBe(false);
    expect(slot().classList.contains('hidden')).toBe(false);
    expect(slot().querySelector('.badge')?.textContent).toBe('Pro');

    fixture.componentInstance.plan.set(null);
    await settle();
    expect(value().hasAttribute('data-ptah-description-empty')).toBe(true);
    expect(value().querySelector('.sr-only')?.textContent).toBe('Plan not set');
  });
});
