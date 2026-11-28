import { CdkConnectedOverlay, FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahRichSelectComponent } from '../../form-controls/rich-select/rich-select.component';
import { NativeModalComponent, NativeModalLayout, NativeModalSize } from './native-modal.component';

@Component({
  imports: [NativeModalComponent, PtahRichSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button id="modal-opener" type="button" (click)="open.set(true)">Open</button>
    <ptah-native-modal
      [isOpen]="open()"
      [ariaLabel]="label()"
      [ariaLabelledby]="labelledBy()"
      [layout]="layout()"
      [size]="size()"
      (closed)="requestClose()"
    >
      <h2 id="modal-title" modal-header>Choose a provider</h2>
      @if (withHiddenControl()) {
        <button hidden type="button">Unavailable action</button>
      }
      <ptah-select label="Provider" searchable [options]="options" />
      <button modal-footer type="button" id="modal-footer">Cancel</button>
    </ptah-native-modal>
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly label = signal<string | undefined>('Provider settings');
  readonly labelledBy = signal<string | undefined>(undefined);
  readonly layout = signal<NativeModalLayout>('plain');
  readonly size = signal<NativeModalSize>('md');
  readonly withHiddenControl = signal(false);
  readonly options = [{ value: 'one', label: 'Provider One' }];
  closeRequests = 0;

  requestClose(): void {
    this.closeRequests++;
  }
}

describe('NativeModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const dialog = (): HTMLElement | null => document.querySelector('.cdk-dialog-container');
  const box = (): HTMLElement => dialog()?.querySelector('.modal-box') as HTMLElement;
  const backdrop = (): HTMLElement => document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
  const escape = (target: Element): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openModal(): Promise<void> {
    host.open.set(true);
    await render();
  }

  async function openSelect(): Promise<{ trigger: HTMLButtonElement; search: HTMLInputElement }> {
    const trigger = box().querySelector<HTMLButtonElement>('.ptah-select__trigger') as HTMLButtonElement;
    trigger.click();
    await render();
    const search = document.querySelector<HTMLInputElement>('.cdk-overlay-pane .ptah-select__search') as HTMLInputElement;
    return { trigger, search };
  }

  it('attaches the dialog only while its controlled open input is true', async () => {
    expect(dialog()).toBeNull();
    await openModal();
    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(dialog()?.getAttribute('aria-label')).toBe('Provider settings');
    expect(fixture.nativeElement.contains(dialog())).toBe(false);
    host.open.set(false);
    await render();
    expect(dialog()).toBeNull();
    expect(host.closeRequests).toBe(0);
    await openModal();
    expect(dialog()).not.toBeNull();
  });

  it('skips a hidden control when choosing initial focus', async () => {
    host.withHiddenControl.set(true);
    await openModal();
    expect(box().querySelector('button[hidden]')).not.toBeNull();
    expect(document.activeElement).toBe(box().querySelector('.ptah-select__trigger'));
  });

  it('names the dialog through the projected heading', async () => {
    host.label.set(undefined);
    host.labelledBy.set('modal-title');
    await openModal();
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('modal-title');
    expect(dialog()?.querySelector('#modal-title')?.textContent).toBe('Choose a provider');
  });

  it('updates the accessible name while the dialog is open', async () => {
    await openModal();
    host.label.set(undefined);
    host.labelledBy.set('modal-title');
    await render();
    expect(dialog()?.hasAttribute('aria-label')).toBe(false);
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('modal-title');
  });

  it('requests closing without changing caller-owned visibility on Escape and backdrop clicks', async () => {
    await openModal();
    escape(box());
    backdrop().click();
    expect(host.closeRequests).toBe(2);
    expect(dialog()).not.toBeNull();
  });

  it('projects the plain slots and applies each width preset', async () => {
    await openModal();
    for (const [size, widthClass] of [['sm', 'max-w-sm'], ['md', 'max-w-lg'], ['lg', 'max-w-2xl']] as const) {
      host.size.set(size);
      await render();
      expect(box().classList).toContain(widthClass);
    }
    for (const part of ['header', 'body', 'footer']) {
      expect(box().querySelector(`[data-ptah-modal-part="${part}"]`)?.classList).toContain('ptah-modal-part');
    }
    expect(box().querySelector('#modal-title')).not.toBeNull();
    expect(box().querySelector('ptah-select')).not.toBeNull();
    expect(box().querySelector('#modal-footer')).not.toBeNull();
  });

  it('has a scrollable shell body between pinned header and footer slots', async () => {
    host.layout.set('shell');
    host.size.set('lg');
    await openModal();
    expect(box().style.getPropertyValue('--ptah-modal-size')).toBe('42rem');
    expect(box().querySelector('[data-ptah-modal-part="header"]')?.classList).toContain('shrink-0');
    expect(box().querySelector('[data-ptah-modal-part="body"]')?.classList).toContain('overflow-y-auto');
    expect(box().querySelector('[data-ptah-modal-part="footer"]')?.classList).toContain('shrink-0');
  });

  function trapAnchors(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor'));
  }

  function tabOrder(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(
      'button, input, textarea, select, a[href], [tabindex]',
    )).filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
  }

  /** The browser's Tab lands on the next tab stop. The trap's anchors then wrap. */
  function pressTab(shift = false): void {
    const order = tabOrder();
    const active = document.activeElement as HTMLElement | null;
    const index = active ? order.indexOf(active) : -1;
    const next = order[shift ? index - 1 : index + 1];
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    active?.dispatchEvent(event);
    if (!event.defaultPrevented && next) next.focus();
  }

  /** Tab from the portaled search. The select closes and restores its trigger. */
  async function tabFromSearch(shift: boolean): Promise<KeyboardEvent> {
    const search = document.querySelector<HTMLInputElement>('.cdk-overlay-pane .ptah-select__search');
    expect(search).not.toBeNull();
    search?.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    search?.dispatchEvent(event);
    await render();
    return event;
  }

  it('wraps Tab and Shift+Tab inside the dialog while the child is closed', async () => {
    const rects = jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
    } as unknown as DOMRectList);
    try {
      await openModal();
      const [start, end] = trapAnchors();
      const trigger = box().querySelector('.ptah-select__trigger') as HTMLButtonElement;
      const footer = document.getElementById('modal-footer') as HTMLButtonElement;
      expect(start).toBeTruthy();
      expect(end).toBeTruthy();

      footer.focus();
      pressTab(false);
      expect(document.activeElement).toBe(trigger);

      trigger.focus();
      pressTab(true);
      expect(document.activeElement).toBe(footer);
    } finally {
      rects.mockRestore();
    }
  });

  it('consumes Tab at the panel boundaries and wraps focus itself', async () => {
    const rects = jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
    } as unknown as DOMRectList);
    try {
      await openModal();
      const trigger = box().querySelector('.ptah-select__trigger') as HTMLButtonElement;
      const footer = document.getElementById('modal-footer') as HTMLButtonElement;
      const tab = (shiftKey: boolean): KeyboardEvent =>
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });

      footer.focus();
      const forward = tab(false);
      footer.dispatchEvent(forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(trigger);

      trigger.focus();
      const backward = tab(true);
      trigger.dispatchEvent(backward);
      expect(backward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(footer);

      for (const [control, shiftKey] of [[footer, false], [trigger, true]] as const) {
        control.focus();
        control.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
        control.dispatchEvent(tab(shiftKey));
        expect(document.activeElement).toBe(control);
      }
    } finally {
      rects.mockRestore();
    }
  });

  it('moves Tab across the open child back to its trigger, and the first Escape does the same', async () => {
    const rects = jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
    } as unknown as DOMRectList);
    try {
      const opener = document.getElementById('modal-opener') as HTMLButtonElement;
      opener.focus();
      await openModal();
      const footer = document.getElementById('modal-footer') as HTMLButtonElement;
      const opened = await openSelect();
      expect(document.activeElement).toBe(opened.search);
      expect(box().contains(opened.search)).toBe(false);

      // Dialog ends still wrap while the child is open. Tab on the footer hits
      // the trap's end anchor, which returns to the trigger. The child stays
      // open because that Tab is not the select's own key.
      footer.focus();
      pressTab(false);
      expect(document.activeElement).toBe(opened.trigger);
      expect(document.querySelector('.ptah-select__panel')).not.toBeNull();
      expect(host.closeRequests).toBe(0);

      footer.focus();
      pressTab(true);
      expect(document.activeElement).toBe(opened.trigger);
      expect(document.querySelector('.ptah-select__panel')).not.toBeNull();
      expect(host.closeRequests).toBe(0);

      // Tab and Shift+Tab inside the portaled search close only the child and
      // continue from its trigger. The dialog stays open.
      const tab = await tabFromSearch(false);
      expect(tab.defaultPrevented).toBe(false);
      expect(host.closeRequests).toBe(0);
      expect(document.querySelector('.ptah-select__panel')).toBeNull();
      expect(document.activeElement).toBe(opened.trigger);
      pressTab(false);
      expect(document.activeElement).toBe(footer);

      const shifted = await openSelect();
      const shiftTab = await tabFromSearch(true);
      expect(shiftTab.defaultPrevented).toBe(false);
      expect(host.closeRequests).toBe(0);
      expect(document.querySelector('.ptah-select__panel')).toBeNull();
      expect(document.activeElement).toBe(shifted.trigger);
      pressTab(true);
      expect(document.activeElement).toBe(footer);

      const escaped = await openSelect();
      escape(escaped.search);
      await render();
      expect(host.closeRequests).toBe(0);
      expect(document.activeElement).toBe(escaped.trigger);
      expect(document.querySelector('.ptah-select__panel')).toBeNull();
      escape(escaped.trigger);
      expect(host.closeRequests).toBe(1);
      host.open.set(false);
      await render();
      expect(document.activeElement).toBe(opener);
    } finally {
      rects.mockRestore();
    }
  });

  it('retains CDK focus containment while a portaled search takes focus and Escape dismisses it first', async () => {
    const opener = document.getElementById('modal-opener') as HTMLButtonElement;
    opener.focus();
    host.layout.set('shell');
    await openModal();
    expect(dialog()?.previousElementSibling?.classList).toContain('cdk-focus-trap-anchor');
    const { trigger, search } = await openSelect();
    expect(search).not.toBeNull();
    expect(box().contains(search)).toBe(false);
    expect(document.activeElement).toBe(search);

    escape(search);
    await render();
    expect(host.closeRequests).toBe(0);
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('.ptah-select__panel')).toBeNull();
    escape(trigger);
    expect(host.closeRequests).toBe(1);
    host.open.set(false);
    await render();
    expect(document.activeElement).toBe(opener);
  });

  it('dismisses the select before the dialog when clicking the dialog backdrop', async () => {
    await openModal();
    const { trigger } = await openSelect();
    backdrop().click();
    await render();
    expect(host.closeRequests).toBe(0);
    expect(document.querySelector('.ptah-select__panel')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    backdrop().click();
    expect(host.closeRequests).toBe(1);
  });

  it('matches the field width and repositions when the registered dialog body scrolls', async () => {
    host.layout.set('shell');
    await openModal();
    const select = box().querySelector('ptah-select') as HTMLElement;
    jest.spyOn(select, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 20, 240, 32));
    await openSelect();
    const connected = fixture.debugElement.queryAllNodes(By.directive(CdkConnectedOverlay))[0]
      .injector.get(CdkConnectedOverlay);
    expect(connected.overlayRef.overlayElement.style.width).toBe('240px');
    const update = jest.spyOn(connected.overlayRef, 'updatePosition');
    const body = box().querySelector('[data-ptah-modal-part="body"]');
    body?.dispatchEvent(new Event('scroll'));
    expect(update).toHaveBeenCalled();
  });

  it.each([
    [8, 8, 'bottom'],
    [192, 8, 'bottom'],
    [8, 260, 'top'],
    [192, 260, 'top'],
  ] as const)('chooses a usable placement for a searchable select at (%i, %i)', async (x, y, originY) => {
    const width = jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
    const height = jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(300);
    try {
      await openModal();
      const select = box().querySelector('ptah-select') as HTMLElement;
      jest.spyOn(select, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, y, 120, 32));
      const { search } = await openSelect();
      const connected = fixture.debugElement.queryAllNodes(By.directive(CdkConnectedOverlay))[0]
        .injector.get(CdkConnectedOverlay);
      const overlayRef = connected.overlayRef;
      const strategy = overlayRef.getConfig().positionStrategy as FlexibleConnectedPositionStrategy;
      const placement = jest.fn();
      strategy.positionChanges.subscribe(placement);
      jest.spyOn(overlayRef.overlayElement, 'getBoundingClientRect')
        .mockReturnValue(new DOMRect(0, 0, 120, 190));
      overlayRef.updatePosition();
      expect(placement).toHaveBeenLastCalledWith(expect.objectContaining({
        connectionPair: expect.objectContaining({ originY }),
      }));
      expect(overlayRef.getConfig().maxWidth).toBe('calc(100vw - var(--ptah-space-4))');
      expect(document.activeElement).toBe(search);
    } finally {
      width.mockRestore();
      height.mockRestore();
    }
  });

  it('detaches the select on a programmatic parent close and can reopen it', async () => {
    await openModal();
    await openSelect();
    host.open.set(false);
    await render();
    expect(document.querySelector('.ptah-select__panel')).toBeNull();
    await openModal();
    expect((await openSelect()).search).not.toBeNull();
  });

  it('removes the panes and scroll lock on destroy while both layers are open', async () => {
    await openModal();
    await openSelect();
    fixture.destroy();
    expect(document.querySelectorAll('.cdk-overlay-pane')).toHaveLength(0);
    expect(document.documentElement.classList).not.toContain('cdk-global-scrollblock');
  });
});
