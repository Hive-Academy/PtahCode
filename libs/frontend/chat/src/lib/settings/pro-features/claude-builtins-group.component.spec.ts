import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Wrench } from 'lucide-angular';
import {
  ClaudeBuiltinsGroupComponent,
  type BuiltinGroupSwitchState,
} from './claude-builtins-group.component';

@Component({
  standalone: true,
  imports: [ClaudeBuiltinsGroupComponent],
  template: `
    <ptah-claude-builtins-group
      groupId="tools"
      heading="Built-in tools"
      [icon]="icon"
      [badge]="badge()"
      hint="Tools that agents can use."
      [onCount]="2"
      [total]="total()"
      tokens="~2,900"
      [expanded]="expanded()"
      [switchState]="switchState()"
      switchLabel="Turn on all Built-in tools"
      [busy]="busy()"
      [expandLocked]="locked()"
      (expandedChange)="expanded.set($event)"
      (groupToggled)="requests.push($event)"
    >
      <span data-testid="projected-row">row</span>
    </ptah-claude-builtins-group>
  `,
})
class HostComponent {
  readonly icon = Wrench;
  readonly badge = signal<string | null>('Off by default');
  readonly total = signal(6);
  readonly expanded = signal(false);
  readonly switchState = signal<BuiltinGroupSwitchState>('off');
  readonly busy = signal(false);
  readonly locked = signal(false);
  readonly requests: boolean[] = [];
}

describe('ClaudeBuiltinsGroupComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const query = <T extends HTMLElement>(selector: string): T => {
    const found = element.querySelector<T>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };
  const disclosure = () => query<HTMLButtonElement>('button[aria-expanded]');
  const groupSwitch = () => query<HTMLButtonElement>('[data-testid="claude-tools-group-switch-tools"]');
  const body = () => query<HTMLElement>(`#${disclosure().getAttribute('aria-controls')}`);

  it('renders the header: heading, badge, count with tokens, and the group test id', () => {
    expect(element.querySelector('[data-testid="claude-tools-group-tools"]')).not.toBeNull();
    const parts = Array.from(disclosure().querySelectorAll('span')).map((span) => span.textContent?.trim());
    expect(parts).toEqual(['Built-in tools', 'Off by default', '2/6 on · ~2,900 tokens']);
    expect(disclosure().getAttribute('title')).toBe('Tools that agents can use.');

    host.badge.set(null);
    fixture.detectChanges();
    expect(disclosure().textContent).not.toContain('Off by default');
  });

  it('the disclosure is a native button whose aria-controls resolves to the body with the rows', () => {
    expect(disclosure().tagName).toBe('BUTTON');
    expect(disclosure().type).toBe('button');
    expect(body().querySelector('[data-testid="projected-row"]')).not.toBeNull();
    expect(body().hidden).toBe(true);
  });

  // A native button turns Enter and Space into a click; jsdom does not, so the click stands for both keys.
  it('Enter or Space on the disclosure toggles aria-expanded and the body', () => {
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');

    disclosure().click();
    fixture.detectChanges();
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
    expect(body().hidden).toBe(false);

    disclosure().click();
    fixture.detectChanges();
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(body().hidden).toBe(true);
  });

  it('lays the rows out in two columns from a 704px container, with no horizontal scroll wrapper', () => {
    const grid = body().firstElementChild;
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('[@container(min-width:704px)]:grid-cols-2');
    expect(element.innerHTML).not.toContain('overflow-x-auto');
  });

  it.each<[BuiltinGroupSwitchState, string, boolean]>([
    ['off', 'false', true],
    ['mixed', 'mixed', true],
    ['on', 'true', false],
  ])('switch state %s shows aria-checked="%s" and requests %s', (state, ariaChecked, requested) => {
    host.switchState.set(state);
    fixture.detectChanges();

    // A tri-state checkbox: WAI-ARIA maps aria-checked="mixed" on a switch to off.
    expect(groupSwitch().getAttribute('role')).toBe('checkbox');
    expect(element.querySelector('button[role="switch"]')).toBeNull();
    expect(groupSwitch().getAttribute('aria-checked')).toBe(ariaChecked);
    expect(groupSwitch().getAttribute('aria-label')).toBe('Turn on all Built-in tools');

    // The thumb position and ink follow the state. The class lists are static for the class audit.
    const thumb = groupSwitch().querySelector('span') as HTMLElement;
    const stateClasses = ['translate-x-3', 'translate-x-1.5', 'bg-primary-content', 'bg-base-content/70'];
    const expected = {
      on: ['translate-x-3', 'bg-primary-content'],
      mixed: ['translate-x-1.5', 'bg-primary-content'],
      off: ['bg-base-content/70'],
    }[state];
    expect(stateClasses.filter((name) => thumb.classList.contains(name))).toEqual(expected);
    expect(thumb.classList.contains('rounded-full')).toBe(true);

    groupSwitch().click();
    expect(host.requests).toEqual([requested]);
  });

  it('busy sets aria-disabled, keeps the switch focusable and drops clicks', () => {
    host.busy.set(true);
    fixture.detectChanges();

    expect(groupSwitch().getAttribute('aria-disabled')).toBe('true');
    expect(groupSwitch().disabled).toBe(false);
    groupSwitch().focus();
    expect(element.ownerDocument.activeElement).toBe(groupSwitch());
    groupSwitch().click();
    expect(host.requests).toEqual([]);

    host.busy.set(false);
    fixture.detectChanges();
    expect(groupSwitch().getAttribute('aria-disabled')).toBeNull();
    groupSwitch().click();
    expect(host.requests).toEqual([true]);
  });

  it('shows no switch for a group with no items', () => {
    host.total.set(0);
    fixture.detectChanges();
    expect(element.querySelector('[role="checkbox"]')).toBeNull();
  });

  it('expandLocked exposes the disclosure as unavailable, keeps it focusable and ignores activation', () => {
    host.expanded.set(true);
    host.locked.set(true);
    fixture.detectChanges();

    expect(disclosure().getAttribute('aria-disabled')).toBe('true');
    expect(disclosure().disabled).toBe(false);
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
    disclosure().focus();
    expect(element.ownerDocument.activeElement).toBe(disclosure());
    disclosure().click();
    fixture.detectChanges();
    expect(host.expanded()).toBe(true);
    expect(body().hidden).toBe(false);

    // Normal activation returns when the lock ends.
    host.locked.set(false);
    fixture.detectChanges();
    expect(disclosure().getAttribute('aria-disabled')).toBeNull();
    disclosure().click();
    fixture.detectChanges();
    expect(host.expanded()).toBe(false);
  });
});
