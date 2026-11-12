import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahButtonDirective } from './button.directive';
import { PtahButtonAlign, PtahButtonSelectedAs, PtahButtonShape, PtahButtonSize, PtahButtonTone } from './button.types';
@Component({
  standalone: true,
  imports: [PtahButtonDirective],
  template: `
    <button
      ptahButton
      variant="primary"
      [busy]="busy()"
      (click)="count = count + 1"
    >
      Save
    </button>
    <button ptahButton type="submit">Submit</button>
    <a ptahButton href="/next" [busy]="busy()" (click)="count = count + 1"
      >Next</a
    >
  `,
})
class Host {
  readonly busy = signal(true);
  count = 0;
}
it('keeps a busy button focusable and blocks button and anchor activation', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
  expect(button.classList.contains('btn-primary')).toBe(true);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.disabled).toBe(false);
  expect(button.classList.contains('opacity-60')).toBe(true);
  button.click();
  button.focus();
  button.click();
  expect(
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ),
  ).toBe(false);
  expect(
    anchor.dispatchEvent(
      new MouseEvent('auxclick', { bubbles: true, cancelable: true }),
    ),
  ).toBe(false);
  expect(anchor.getAttribute('aria-disabled')).toBe('true');
  expect(anchor.getAttribute('aria-busy')).toBe('true');
  expect(anchor.hasAttribute('type')).toBe(false);
  expect(fixture.componentInstance.count).toBe(0);
  fixture.componentInstance.busy.set(false);
  fixture.detectChanges();
  button.click();
  expect(fixture.componentInstance.count).toBe(1);
  expect(
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ),
  ).toBe(true);
});
it('defaults type only when absent and preserves explicit submit', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const buttons = fixture.nativeElement.querySelectorAll(
    'button',
  ) as NodeListOf<HTMLButtonElement>;
  expect(buttons[0].type).toBe('button');
  expect(buttons[1].type).toBe('submit');
});
@Component({
  standalone: true,
  imports: [PtahButtonDirective],
  template: `
    @for (variant of variants; track variant) {
      <button ptahButton [variant]="variant">Variant</button>
    }
    @for (size of sizes; track size) {
      <button ptahButton [size]="size">Size</button>
    }
  `,
})
class ClassesHost {
  readonly variants = [
    'primary',
    'secondary',
    'ghost',
    'danger',
    'link',
  ] as const;
  readonly sizes = ['xs', 'sm', 'md'] as const;
}
it('maps every variant and size to its DaisyUI class', () => {
  const fixture = TestBed.createComponent(ClassesHost);
  fixture.detectChanges();
  const buttons = [
    ...fixture.nativeElement.querySelectorAll('button'),
  ] as HTMLButtonElement[];
  const expected = [
    ['btn', 'btn-primary', 'btn-sm'],
    ['btn', 'btn-secondary', 'btn-sm'],
    ['btn', 'btn-ghost', 'btn-sm'],
    ['btn', 'btn-error', 'btn-sm'],
    ['btn', 'btn-link', 'btn-sm'],
    ['btn', 'btn-secondary', 'btn-xs'],
    ['btn', 'btn-secondary', 'btn-sm'],
    ['btn', 'btn-secondary', 'btn-md'],
  ];
  buttons.forEach((button, i) =>
    expect([...button.classList].sort()).toEqual(expected[i].sort()),
  );
});
it('marks each host with data-ptah-button so the token look applies', () => {
  const fixture = TestBed.createComponent(ClassesHost);
  fixture.detectChanges();
  const buttons = [
    ...fixture.nativeElement.querySelectorAll('button'),
  ] as HTMLButtonElement[];
  expect(buttons.length).toBeGreaterThan(0);
  buttons.forEach((button) =>
    expect(button.hasAttribute('data-ptah-button')).toBe(true),
  );
});
@Component({
  standalone: true,
  imports: [PtahButtonDirective],
  template: `<form>
    <button ptahButton [type]="inputType()">Input</button>
  </form>`,
})
class TypeHost {
  readonly inputType = signal<string | undefined>('submit');
}

@Component({
  standalone: true,
  imports: [PtahButtonDirective],
  template: `<button ptahButton [align]="align()" [shape]="shape()" [tone]="tone()" [size]="size()" [selected]="selected()" [selectedAs]="selectedAs()">Action</button>`,
})
class InputsHost {
  readonly align = signal<PtahButtonAlign>('center');
  readonly shape = signal<PtahButtonShape>('default');
  readonly tone = signal<PtahButtonTone>('default');
  readonly size = signal<PtahButtonSize>('sm');
  readonly selected = signal<boolean | undefined>(undefined);
  readonly selectedAs = signal<PtahButtonSelectedAs>('pressed');
}

it.each([['center', null], ['start', 'start'], ['row', 'row']] as const)('maps align %s to its host attribute', (value, expected) => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.align.set(value);
  fixture.detectChanges();
  expect((fixture.nativeElement as HTMLElement).querySelector('button')?.getAttribute('data-align')).toBe(expected);
});

it.each([['default', null], ['danger', 'danger'], ['muted-danger', 'muted-danger']] as const)('maps tone %s to its host attribute', (value, expected) => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.tone.set(value);
  fixture.detectChanges();
  expect((fixture.nativeElement as HTMLElement).querySelector('button')?.getAttribute('data-tone')).toBe(expected);
});

it.each([['default', false], ['pill', true]] as const)('maps shape %s to btn-pill', (value, expected) => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.shape.set(value);
  fixture.detectChanges();
  expect((fixture.nativeElement as HTMLElement).querySelector('button')?.classList.contains('btn-pill')).toBe(expected);
});

it('maps size lg to btn-lg', () => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.size.set('lg');
  fixture.detectChanges();
  expect((fixture.nativeElement as HTMLElement).querySelector('button')?.classList.contains('btn-lg')).toBe(true);
});

it.each([
  [undefined, 'pressed', null, null, false],
  [false, 'pressed', 'false', null, false],
  [true, 'pressed', 'true', null, true],
  [true, 'current', null, 'page', true],
  [false, 'current', null, null, false],
  [true, 'none', null, null, true],
] as const)('maps selection %s as %s to host state', (selected, as, pressed, current, active) => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.selected.set(selected);
  fixture.componentInstance.selectedAs.set(as);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  expect(button.hasAttribute('data-selected')).toBe(active);
  expect(button.getAttribute('aria-pressed')).toBe(pressed);
  expect(button.getAttribute('aria-current')).toBe(current);
});
it('keeps the button type default when a binding removes the type', () => {
  const fixture = TestBed.createComponent(TypeHost);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  expect(input.getAttribute('type')).toBe('submit');
  fixture.componentInstance.inputType.set(undefined);
  fixture.detectChanges();
  expect(input.getAttribute('type')).toBe('button');
});
