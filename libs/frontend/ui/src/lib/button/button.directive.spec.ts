import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahButtonDirective } from './button.directive';
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
