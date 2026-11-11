import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahTooltipDirective } from './tooltip.directive';
@Component({
  standalone: true,
  imports: [PtahTooltipDirective],
  template: '<button [ptahTooltip]="text()" aria-describedby="other">Info</button>',
})
class Host {
  readonly text = signal('Helpful hint');
}
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: jest.fn() });
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: jest.fn() });
});
afterEach(() => {
  jest.useRealTimers();
  document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
});
it('shows on focus and closes on blur and Escape', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  button.focus();
  fixture.detectChanges();
  const panel = document.querySelector('[role="tooltip"]');
  expect(panel?.textContent).toBe('Helpful hint');
  expect(button.getAttribute('aria-describedby')).toBe(`other ${panel?.id}`);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(button.getAttribute('aria-describedby')).toBe('other');
  button.blur();
  button.focus();
  button.blur();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  fixture.destroy();
});
it('shows on pointer enter, hides on leave and destroys with host', () => {
  jest.useFakeTimers();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  button.dispatchEvent(new Event('pointerenter'));
  jest.advanceTimersByTime(249);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  jest.advanceTimersByTime(1);
  fixture.detectChanges();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  expect(document.querySelector('.cdk-overlay-popover')?.getAttribute('popover')).toBe('manual');
  button.dispatchEvent(new Event('pointerleave'));
  jest.advanceTimersByTime(99);
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  document.querySelector('.cdk-overlay-pane')?.dispatchEvent(new Event('pointerenter'));
  jest.advanceTimersByTime(1);
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  document.querySelector('.cdk-overlay-pane')?.dispatchEvent(new Event('pointerleave'));
  jest.advanceTimersByTime(100);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  button.dispatchEvent(new Event('pointerenter'));
  jest.advanceTimersByTime(250);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  button.dispatchEvent(new Event('pointerenter'));
  jest.advanceTimersByTime(250);
  fixture.destroy();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});
it('updates open text, hides for empty text, and cancels pending hover', () => {
  jest.useFakeTimers();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  button.dispatchEvent(new Event('pointerenter'));
  button.dispatchEvent(new Event('pointerleave'));
  jest.advanceTimersByTime(250);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  button.dispatchEvent(new Event('pointerenter'));
  jest.advanceTimersByTime(250);
  fixture.componentInstance.text.set('Updated hint');
  fixture.detectChanges();
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Updated hint');
  fixture.componentInstance.text.set('');
  fixture.detectChanges();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  fixture.destroy();
});
it('keeps a focus-opened tooltip on blur while the pointer is over the host or panel', () => {
  jest.useFakeTimers();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  button.focus();
  fixture.detectChanges();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  button.dispatchEvent(new Event('pointerenter'));
  button.blur();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  button.dispatchEvent(new Event('pointerleave'));
  jest.advanceTimersByTime(99);
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  jest.advanceTimersByTime(1);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  button.focus();
  fixture.detectChanges();
  document.querySelector('.cdk-overlay-pane')?.dispatchEvent(new Event('pointerenter'));
  button.blur();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  document.querySelector('.cdk-overlay-pane')?.dispatchEvent(new Event('pointerleave'));
  jest.advanceTimersByTime(100);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  fixture.destroy();
});

it('resets the panel pointer state when the tooltip is hidden over the panel', () => {
  jest.useFakeTimers();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  button.focus();
  fixture.detectChanges();
  document.querySelector('.cdk-overlay-pane')?.dispatchEvent(new Event('pointerenter'));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  button.blur();
  button.focus();
  fixture.detectChanges();
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  button.blur();
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  fixture.destroy();
});
