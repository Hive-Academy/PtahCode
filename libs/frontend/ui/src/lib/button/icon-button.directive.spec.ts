import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahIconButtonDirective } from './icon-button.directive';
@Component({
  standalone: true,
  imports: [PtahIconButtonDirective],
  template: `<button ptahIconButton [label]="label()" [busy]="busy()">?</button>
    <button ptahIconButton label="Submit" type="submit">!</button>
    <a
      ptahIconButton
      label="Link"
      href="/next"
      [busy]="busy()"
      (click)="count = count + 1"
      >+</a
    >`,
})
class Host {
  readonly label = signal('More actions');
  readonly busy = signal(false);
  count = 0;
}
it('names the square icon button and composes its tooltip', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  expect(button.getAttribute('aria-label')).toBe('More actions');
  expect(button.classList.contains('btn-square')).toBe(true);
  expect([...button.classList].sort()).toEqual(
    ['btn', 'btn-ghost', 'btn-sm', 'btn-square'].sort(),
  );
  expect(button.type).toBe('button');
  expect(
    (fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement)
      .type,
  ).toBe('submit');
  const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
  expect(anchor.hasAttribute('type')).toBe(false);
  expect([...anchor.classList].sort()).toEqual(
    ['btn', 'btn-ghost', 'btn-sm', 'btn-square'].sort(),
  );
  button.focus();
  fixture.detectChanges();
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
    'More actions',
  );
  expect(button.hasAttribute('aria-describedby')).toBe(false);
  fixture.componentInstance.label.set('Updated');
  fixture.detectChanges();
  expect(button.getAttribute('aria-label')).toBe('Updated');
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
    'Updated',
  );
  fixture.componentInstance.busy.set(true);
  fixture.detectChanges();
  expect(
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ),
  ).toBe(false);
  expect(fixture.componentInstance.count).toBe(0);
  fixture.destroy();
});
describe('icon button label', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());
  function render(label: string): HTMLButtonElement {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.label.set(label);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  }
  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t\n '],
  ])('reports an %s label and sets no accessible name', (_name, label) => {
    const button = render(label);
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.hasAttribute('title')).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ptahIconButton requires a non-empty label'),
    );
    button.focus();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
  it('uses the trimmed label as the accessible name and reports no error', () => {
    const button = render('  Close panel  ');
    expect(button.getAttribute('aria-label')).toBe('Close panel');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
