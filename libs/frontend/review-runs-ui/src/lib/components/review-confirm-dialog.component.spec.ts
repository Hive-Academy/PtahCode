import { TestBed } from '@angular/core/testing';
import { ReviewConfirmDialogComponent } from './review-confirm-dialog.component';

function create() {
  TestBed.configureTestingModule({ imports: [ReviewConfirmDialogComponent] });
  const fixture = TestBed.createComponent(ReviewConfirmDialogComponent);
  fixture.componentRef.setInput('dialogId', 'test-confirm');
  fixture.componentRef.setInput('title', 'Confirm action');
  fixture.componentRef.setInput('description', 'This action has effects.');
  return fixture;
}

describe('ReviewConfirmDialogComponent', () => {
  it('traps Tab, closes on Escape, and restores the trigger focus', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const fixture = create();
    const cancelled = jest.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const heading = dialog.querySelector('h2') as HTMLElement;
    const buttons = dialog.querySelectorAll('button');
    expect(document.activeElement).toBe(heading);
    buttons[1].focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(heading);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('shows its root as a manual popover with an opaque panel and keeps the description id', () => {
    const proto = HTMLElement.prototype as HTMLElement & { showPopover?: () => void };
    const previous = Object.getOwnPropertyDescriptor(proto, 'showPopover');
    const shown: HTMLElement[] = [];
    Object.defineProperty(proto, 'showPopover', {
      configurable: true,
      value(this: HTMLElement) {
        shown.push(this);
      },
    });
    // jsdom may not know :popover-open; report a closed popover.
    const realMatches = Element.prototype.matches;
    const matches = jest
      .spyOn(Element.prototype, 'matches')
      .mockImplementation(function (this: Element, selector: string) {
        return selector === ':popover-open' ? false : realMatches.call(this, selector);
      });
    try {
      const fixture = create();
      fixture.detectChanges();
      const layer = fixture.nativeElement.querySelector('[popover="manual"]') as HTMLElement;
      expect(shown).toEqual([layer]);
      const dialog = layer.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.className).toContain('bg-base-100');
      expect(dialog.className).not.toContain('surface-1');
      expect(dialog.getAttribute('aria-describedby')).toBe('test-confirm-description');
      expect(fixture.nativeElement.querySelector('#test-confirm-description')).not.toBeNull();
      fixture.destroy();
    } finally {
      matches.mockRestore();
      if (previous) Object.defineProperty(proto, 'showPopover', previous);
      else Reflect.deleteProperty(proto, 'showPopover');
    }
  });

  it('stops Escape from reaching the drawer behind it', () => {
    const fixture = create();
    fixture.detectChanges();
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
    fixture.destroy();
  });
});
