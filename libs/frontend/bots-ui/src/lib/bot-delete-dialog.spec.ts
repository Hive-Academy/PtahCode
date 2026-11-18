import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BotDeleteDialogComponent } from './bot-delete-dialog.component';
import { BotsStore } from './bots.store';

describe('Bot delete dialog', () => {
  const blockedReason = signal<string | null>(null);
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  });
  beforeEach(() => {
    blockedReason.set(null);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BotsStore,
          useValue: {
            dirty: signal(true),
            readonly: signal(true),
            blockedReason,
          },
        },
      ],
    });
  });
  function setup() {
    const fixture = TestBed.createComponent(BotDeleteDialogComponent);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('name', 'Helper');
    fixture.componentRef.setInput('dirty', true);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    return {
      fixture,
      host,
      radios: () =>
        Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]')),
    };
  }
  it('defaults to archive with labels and no execution control', () => {
    const { fixture, host, radios } = setup();
    const confirmed = jest.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Remove “Helper”?');
    expect(host.textContent).toContain('Unsaved changes are lost.');
    fixture.componentInstance.confirm();
    expect(confirmed).toHaveBeenCalledWith({ kind: 'archive' });
    expect(
      Array.from(host.querySelectorAll('button')).some((button) =>
        ['Start', 'Run', 'Talk to bot'].includes(
          button.textContent?.trim() ?? '',
        ),
      ),
    ).toBe(false);
  });
  it('supports arrow keys, checked state, roving tabs and labels', () => {
    const { fixture, host, radios } = setup();
    radios()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    expect(radios()[1]?.getAttribute('aria-checked')).toBe('true');
    expect(radios()[1]?.tabIndex).toBe(0);
    expect(radios()[0]?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(radios()[1]);
    expect(host.querySelector('[aria-label="Bot memory"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Run history"]')).toBeTruthy();
    radios()[2]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    fixture.detectChanges();
    expect(radios()[3]?.getAttribute('aria-checked')).toBe('true');
    expect(radios()[4]?.getAttribute('aria-checked')).toBe('true');
    radios()[3]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    fixture.detectChanges();
    expect(radios()[2]?.getAttribute('aria-checked')).toBe('true');
    radios()[4]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    fixture.detectChanges();
    expect(radios()[5]?.getAttribute('aria-checked')).toBe('true');
  });
  it.each([
    ['keep', 'keep'],
    ['keep', 'purge'],
    ['purge', 'keep'],
    ['purge', 'purge'],
  ] as const)(
    'emits independent memory %s and history %s choices',
    (memory, history) => {
      const { fixture, radios } = setup();
      radios()[1]?.click();
      fixture.detectChanges();
      const confirmed = jest.fn();
      fixture.componentInstance.confirmed.subscribe(confirmed);
      fixture.componentInstance.setRetention('memory', memory);
      fixture.componentInstance.setRetention('history', history);
      fixture.componentInstance.confirm();
      expect(confirmed).toHaveBeenCalledWith({
        kind: 'delete',
        retention: { memory, history },
      });
    },
  );
  it('resets to archive and Keep when reopened, and emits cancel', () => {
    const { fixture, radios } = setup();
    radios()[1]?.click();
    fixture.detectChanges();
    fixture.componentInstance.setRetention('memory', 'purge');
    fixture.componentRef.setInput('isOpen', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    radios()[1]?.click();
    fixture.detectChanges();
    expect(radios()[2]?.getAttribute('aria-checked')).toBe('true');
    const cancelled = jest.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    const host: HTMLElement = fixture.nativeElement;
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Cancel')
      ?.click();
    expect(cancelled).toHaveBeenCalled();
  });
  it('blocks destructive confirmation during a conflict', () => {
    const { fixture } = setup();
    blockedReason.set('conflict');
    fixture.detectChanges();
    const confirmed = jest.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.confirm();
    expect(confirmed).not.toHaveBeenCalled();
  });
  it('allows deleting an archived bot and hides Archive', () => {
    blockedReason.set('archived');
    const { fixture, host, radios } = setup();
    fixture.componentRef.setInput('archived', true);
    fixture.detectChanges();
    const confirmed = jest.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    const methods = host.querySelector('[aria-label="Removal method"]');
    expect(methods?.querySelectorAll('[role="radio"]')).toHaveLength(1);
    expect(methods?.textContent).not.toContain('Recommended');
    expect(radios()[0]?.textContent).toContain('Delete permanently');
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    expect(radios().every((button) => !button.disabled)).toBe(true);
    fixture.componentInstance.confirm();
    expect(confirmed).toHaveBeenCalledWith({
      kind: 'delete',
      retention: { memory: 'keep', history: 'keep' },
    });
    radios()[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    expect(document.activeElement).toBe(radios()[2]);
    expect(radios()[2]?.getAttribute('aria-checked')).toBe('true');
    radios()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    fixture.detectChanges();
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
  });
  it('resets choices when an open dialog targets another name', () => {
    const { fixture, radios } = setup();
    radios()[1]?.click();
    fixture.detectChanges();
    fixture.componentInstance.setRetention('history', 'purge');
    fixture.componentRef.setInput('name', 'Another bot');
    fixture.detectChanges();
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    radios()[1]?.click();
    fixture.detectChanges();
    expect(radios()[4]?.getAttribute('aria-checked')).toBe('true');
  });
  it('shows the dirty warning only from its input', () => {
    const { fixture, host } = setup();
    fixture.componentRef.setInput('dirty', false);
    fixture.detectChanges();
    expect(host.textContent).not.toContain('Unsaved changes are lost.');
    fixture.componentRef.setInput('dirty', true);
    fixture.detectChanges();
    expect(host.textContent).toContain('Unsaved changes are lost.');
  });
  it.each(['selecting', 'saving', 'conflict'])(
    'blocks removal while %s',
    (reason) => {
      blockedReason.set(reason);
      const { fixture, radios } = setup();
      const confirmed = jest.fn();
      fixture.componentInstance.confirmed.subscribe(confirmed);
      fixture.componentInstance.confirm();
      expect(confirmed).not.toHaveBeenCalled();
      expect(radios().every((button) => button.disabled)).toBe(true);
    },
  );
});
