import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ComposerGatedControlDirective } from './composer-gated-control.directive';

@Component({
  standalone: true,
  imports: [ComposerGatedControlDirective],
  template: `
    <button
      type="button"
      class="hover:bg-surface-2"
      [ptahComposerGated]="reason()"
      #gate="ptahComposerGated"
      (click)="opened = opened + 1"
      (reasonRevealed)="revealed.push($event)"
      (reasonCleared)="cleared = cleared + 1"
    >
      <span>Model</span>
      @if (gate.gated()) {
        <i data-testid="info-glyph"></i>
      } @else {
        <i data-testid="chevron"></i>
      }
    </button>
  `,
})
class HostComponent {
  readonly reason = signal<string | null>(null);
  opened = 0;
  cleared = 0;
  readonly revealed: string[] = [];
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  return { fixture, host, button };
}

describe('ComposerGatedControlDirective', () => {
  it('leaves an enabled control untouched and lets its click through', () => {
    const { host, button, fixture } = setup();
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBeNull();
    expect(button.getAttribute('title')).toBeNull();
    expect(button.classList.contains('border-dashed')).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="chevron"]'),
    ).not.toBeNull();
    button.click();
    expect(host.opened).toBe(1);
    expect(host.revealed).toEqual([]);
  });

  it('keeps a gated control focusable with aria-disabled, dashed edge, title and description', () => {
    const { host, button, fixture } = setup();
    host.reason.set('No model switch in Copilot lanes.');
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('title')).toBe(
      'No model switch in Copilot lanes.',
    );
    expect(button.classList.contains('border-dashed')).toBe(true);
    // The control's own classes survive next to the gate's.
    expect(button.classList.contains('hover:bg-surface-2')).toBe(true);
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const reasonNode = fixture.nativeElement.querySelector(
      `#${describedBy}`,
    ) as HTMLElement;
    expect(reasonNode.textContent).toBe('No model switch in Copilot lanes.');
    expect(reasonNode.classList.contains('sr-only')).toBe(true);
    expect(reasonNode.getAttribute('aria-hidden')).toBe('true');
    expect(
      fixture.nativeElement.querySelector('[data-testid="info-glyph"]'),
    ).not.toBeNull();

    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('swallows the click before the control handler and reveals the reason instead', () => {
    const { host, button, fixture } = setup();
    host.reason.set('Set at spawn.');
    fixture.detectChanges();
    button.click();
    expect(host.opened).toBe(0);
    expect(host.revealed).toEqual(['Set at spawn.']);
  });

  it('reveals on focus and hover, clears on blur and leave', () => {
    const { host, button, fixture } = setup();
    host.reason.set('Set at spawn.');
    fixture.detectChanges();
    button.dispatchEvent(new FocusEvent('focus'));
    button.dispatchEvent(new MouseEvent('mouseenter'));
    button.dispatchEvent(new FocusEvent('blur'));
    button.dispatchEvent(new MouseEvent('mouseleave'));
    expect(host.revealed).toEqual(['Set at spawn.', 'Set at spawn.']);
    expect(host.cleared).toBe(2);
  });

  it('treats a blank reason as enabled and drops the gate when the reason goes', () => {
    const { host, button, fixture } = setup();
    host.reason.set('   ');
    fixture.detectChanges();
    expect(button.getAttribute('aria-disabled')).toBeNull();
    host.reason.set('Off');
    fixture.detectChanges();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    host.reason.set(null);
    fixture.detectChanges();
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(button.classList.contains('border-dashed')).toBe(false);
    button.dispatchEvent(new FocusEvent('focus'));
    expect(host.revealed).toEqual([]);
  });

  it('clears a shown reason when the control is ungated while focused', () => {
    const { host, button, fixture } = setup();
    host.reason.set('Set at spawn.');
    fixture.detectChanges();
    button.dispatchEvent(new FocusEvent('focus'));
    expect(host.revealed).toEqual(['Set at spawn.']);

    host.reason.set(null);
    fixture.detectChanges();
    expect(host.cleared).toBe(1);

    // Nothing shown any more: a later blur adds no second clear.
    button.dispatchEvent(new FocusEvent('blur'));
    expect(host.cleared).toBe(1);
  });

  it('sends no clear on ungate when the reason was never shown', () => {
    const { host, fixture } = setup();
    host.reason.set('Set at spawn.');
    fixture.detectChanges();
    host.reason.set(null);
    fixture.detectChanges();
    expect(host.cleared).toBe(0);
  });
});
