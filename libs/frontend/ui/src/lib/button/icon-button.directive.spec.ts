import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahIconButtonDirective } from './icon-button.directive';
import { PtahButtonSelectedAs, PtahButtonSize, PtahButtonTone } from './button.types';
@Component({
  standalone: true,
  imports: [PtahIconButtonDirective],
  template: `<button ptahIconButton [label]="label()" [busy]="busy()">
      <svg aria-hidden="true"></svg>
    </button>
    <button ptahIconButton label="Submit" type="submit">
      <svg aria-hidden="true"></svg>
    </button>
    <a
      ptahIconButton
      label="Link"
      href="/next"
      [busy]="busy()"
      (click)="count = count + 1"
      ><svg aria-hidden="true"></svg
    ></a>`,
})
class Host {
  readonly label = signal('More actions');
  readonly busy = signal(false);
  count = 0;
}

@Component({
  standalone: true,
  imports: [PtahIconButtonDirective],
  template: `<button ptahIconButton label="Action" [tone]="tone()" [size]="size()" [selected]="selected()" [selectedAs]="selectedAs()"><svg aria-hidden="true"></svg></button>`,
})
class InputsHost {
  readonly tone = signal<PtahButtonTone>('default');
  readonly size = signal<PtahButtonSize>('sm');
  readonly selected = signal<boolean | undefined>(undefined);
  readonly selectedAs = signal<PtahButtonSelectedAs>('pressed');
}

it.each([['default', null], ['danger', 'danger'], ['muted-danger', 'muted-danger']] as const)('maps icon tone %s to its host attribute', (value, expected) => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.tone.set(value);
  fixture.detectChanges();
  expect((fixture.nativeElement as HTMLElement).querySelector('button')?.getAttribute('data-tone')).toBe(expected);
});

it('maps icon size lg to a square btn-lg host', () => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.size.set('lg');
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  expect(button.classList.contains('btn-lg')).toBe(true);
  expect(button.classList.contains('btn-square')).toBe(true);
});

it.each([
  [undefined, 'pressed', null, null, false],
  [false, 'pressed', 'false', null, false],
  [true, 'pressed', 'true', null, true],
  [true, 'current', null, 'page', true],
  [false, 'current', null, null, false],
  [true, 'none', null, null, true],
] as const)('maps icon selection %s as %s to host state', (selected, as, pressed, current, active) => {
  const fixture = TestBed.createComponent(InputsHost);
  fixture.componentInstance.selected.set(selected);
  fixture.componentInstance.selectedAs.set(as);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  expect(button.hasAttribute('data-selected')).toBe(active);
  expect(button.getAttribute('aria-pressed')).toBe(pressed);
  expect(button.getAttribute('aria-current')).toBe(current);
});
it('names the square icon button and composes its tooltip', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  expect(button.getAttribute('aria-label')).toBe('More actions');
  expect(button.classList.contains('btn-square')).toBe(true);
  expect(button.hasAttribute('data-ptah-button')).toBe(true);
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
    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    // The host is icon only: no text and no `title` can give it a name.
    expect(button.textContent?.trim()).toBe('');
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    return button;
  }
  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t\n '],
  ])('reports an %s label and sets no accessible name', (_name, label) => {
    const button = render(label);
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.hasAttribute('aria-labelledby')).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
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

@Component({
  standalone: true,
  imports: [PtahIconButtonDirective],
  template: `
    <button ptahIconButton label="Act" [attr.aria-pressed]="pressed()" [attr.aria-current]="current()">Hand</button>
    <button ptahIconButton label="Act" aria-pressed="mixed" aria-current="step">Static</button>
    <button ptahIconButton label="Act" [selected]="selected()" selectedAs="pressed">Owner</button>
  `,
})
class ConsumerAriaHost {
  readonly pressed = signal('true');
  readonly current = signal<string | null>('page');
  readonly selected = signal<boolean | undefined>(undefined);
}

describe('ptahIconButton selected aria ownership', () => {
  it('keeps aria set by the consumer when selected is not set', () => {
    const fixture = TestBed.createComponent(ConsumerAriaHost);
    fixture.detectChanges();
    const [hand, fixed] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    expect(hand.getAttribute('aria-pressed')).toBe('true');
    expect(hand.getAttribute('aria-current')).toBe('page');
    expect(fixed.getAttribute('aria-pressed')).toBe('mixed');
    expect(fixed.getAttribute('aria-current')).toBe('step');
    fixture.componentInstance.pressed.set('false');
    fixture.detectChanges();
    expect(hand.getAttribute('aria-pressed')).toBe('false');
  });

  it('writes the owner value while selected is set and removes only what it wrote', () => {
    const fixture = TestBed.createComponent(ConsumerAriaHost);
    fixture.detectChanges();
    const owner = (fixture.nativeElement as HTMLElement).querySelectorAll('button')[2];
    expect(owner.hasAttribute('aria-pressed')).toBe(false);
    fixture.componentInstance.selected.set(true);
    fixture.detectChanges();
    expect(owner.getAttribute('aria-pressed')).toBe('true');
    fixture.componentInstance.selected.set(undefined);
    fixture.detectChanges();
    expect(owner.hasAttribute('aria-pressed')).toBe(false);
  });
});
