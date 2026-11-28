import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PtahRichSelectComponent } from '../../form-controls/rich-select/rich-select.component';
import {
  NativeDrawerComponent,
  NativeDrawerSide,
} from './native-drawer.component';

@Component({
  standalone: true,
  imports: [NativeDrawerComponent, PtahRichSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button type="button" id="opener" (click)="isOpen.set(true)">Open</button>
    <ptah-native-drawer
      [isOpen]="isOpen()"
      [side]="side()"
      [ariaLabel]="'Skill details'"
      [showCloseButton]="showCloseButton()"
      [closeOnEscape]="closeOnEscape()"
      [closeOnBackdrop]="closeOnBackdrop()"
      (opened)="openedCount = openedCount + 1"
      (closed)="onClosed()"
    >
      <h2 drawer-header>Header</h2>
      <button type="button" id="first">First</button>
      <button type="button" id="last">Last</button>
      <ptah-select label="Provider" searchable [options]="options" />
      <div drawer-footer><span id="footer-text">Footer</span></div>
    </ptah-native-drawer>
  `,
})
class HostComponent {
  isOpen = signal(false);
  side = signal<NativeDrawerSide>('right');
  showCloseButton = signal(true);
  closeOnEscape = signal(true);
  closeOnBackdrop = signal(true);
  readonly options = [{ value: 'one', label: 'Provider One' }];
  openedCount = 0;
  closedCount = 0;

  onClosed(): void {
    this.closedCount++;
    this.isOpen.set(false);
  }
}

describe('NativeDrawerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const q = <T extends HTMLElement>(selector: string): T | null =>
    document.querySelector<T>(selector);

  const panel = (): HTMLElement =>
    q<HTMLElement>('[data-testid="native-drawer-panel"]') as HTMLElement;

  const open = async (): Promise<void> => {
    host.isOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders nothing while closed', () => {
    expect(q('[data-testid="native-drawer-panel"]')).toBeNull();
  });

  it('renders a modal dialog with an accessible name when open', async () => {
    await open();
    const dialog = panel().closest('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Skill details');
    expect(q('.ptah-drawer-backdrop')).toBeTruthy();
  });

  it('mounts the panel in the overlay container and removes it on destroy', async () => {
    await open();
    expect(panel().closest('.cdk-overlay-pane')).not.toBeNull();
    expect(fixture.nativeElement.contains(panel())).toBe(false);
    fixture.destroy();
    expect(q('[data-testid="native-drawer-panel"]')).toBeNull();
  });

  it('projects header, body and footer slots', async () => {
    await open();
    const body = q('[data-testid="native-drawer-body"]') as HTMLElement;
    expect(body.textContent).toContain('First');
    expect(panel().textContent).toContain('Header');
    expect(q('#footer-text')).toBeTruthy();
  });

  it('slides in from the right by default and from the left when asked', async () => {
    await open();
    expect(panel().closest('.cdk-global-overlay-wrapper')?.getAttribute('style')).toContain('flex-end');
    expect(panel().className).not.toContain('ptah-drawer-panel-left');

    host.isOpen.set(false);
    fixture.detectChanges();
    host.side.set('left');
    await open();
    expect(panel().className).toContain('ptah-drawer-panel-left');
    expect(panel().closest('.cdk-global-overlay-wrapper')?.getAttribute('style')).toContain('flex-start');
  });

  it('moves focus to the first focusable element in the panel and emits opened', async () => {
    const layout = jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    try {
      (q('#opener') as HTMLButtonElement).focus();
      await open();
      expect(document.activeElement).toBe(q('[data-testid="native-drawer-close"]'));
      expect(host.openedCount).toBe(1);
    } finally {
      layout.mockRestore();
    }
  });

  it('restores focus to the previously focused element on close', async () => {
    const opener = q<HTMLButtonElement>('#opener') as HTMLButtonElement;
    opener.focus();
    await open();
    expect(document.activeElement).not.toBe(opener);

    host.isOpen.set(false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
  });

  it('requests closure on Escape', async () => {
    await open();
    panel().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(host.closedCount).toBe(1);
  });

  it('closes a portaled searchable select before it closes the drawer', async () => {
    await open();
    const trigger = panel().querySelector<HTMLButtonElement>('.ptah-select__trigger') as HTMLButtonElement;
    trigger.click();
    await open();
    const search = q<HTMLInputElement>('.cdk-overlay-pane .ptah-select__search') as HTMLInputElement;
    expect(document.activeElement).toBe(search);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.closedCount).toBe(0);
    expect(document.activeElement).toBe(trigger);
    expect(q('.ptah-select__panel')).toBeNull();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.closedCount).toBe(1);
  });

  it('does not close on Escape when closeOnEscape is false', async () => {
    host.closeOnEscape.set(false);
    await open();
    panel().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(host.closedCount).toBe(0);
  });

  it('requests closure on backdrop click', async () => {
    await open();
    (q('.ptah-drawer-backdrop') as HTMLElement).click();
    expect(host.closedCount).toBe(1);
  });

  it('does not close on backdrop click when closeOnBackdrop is false', async () => {
    host.closeOnBackdrop.set(false);
    await open();
    (q('.ptah-drawer-backdrop') as HTMLElement).click();
    expect(host.closedCount).toBe(0);
  });

  it('requests closure from the built-in close button, which can be hidden', async () => {
    await open();
    (q('[data-testid="native-drawer-close"]') as HTMLButtonElement).click();
    expect(host.closedCount).toBe(1);

    host.showCloseButton.set(false);
    await open();
    expect(q('[data-testid="native-drawer-close"]')).toBeNull();
  });

  it('renders the close button as a lucide X icon with its accessible name', async () => {
    await open();
    const close = q('[data-testid="native-drawer-close"]') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close panel');
    expect(close.querySelector('lucide-angular svg')).toBeTruthy();
    expect(close.querySelector('lucide-angular')?.getAttribute('aria-hidden')).toBe('true');
    expect(close.textContent).not.toContain('×');
    close.click();
    expect(host.closedCount).toBe(1);
  });

  it('installs CDK focus boundaries around the drawer', async () => {
    await open();
    const dialog = panel().closest('[role="dialog"]');
    expect(dialog?.previousElementSibling?.classList).toContain('cdk-focus-trap-anchor');
    expect(dialog?.nextElementSibling?.classList).toContain('cdk-focus-trap-anchor');
  });

  it('leaves interior Tab presses alone', async () => {
    await open();
    const first = q<HTMLButtonElement>(
      '[data-testid="native-drawer-close"]',
    ) as HTMLButtonElement;
    first.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    panel().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
