import { CdkConnectedOverlay, OverlayContainer } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahRichSelectComponent } from '../../form-controls/rich-select/rich-select.component';
import { NativePopoverComponent } from './native-popover.component';

@Component({
  imports: [NativePopoverComponent, PtahRichSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="external-scroller"><button type="button" id="external-anchor">External anchor</button></div>
    <div id="next-scroller"><button type="button" id="next-anchor">Next anchor</button></div>
    <input aria-label="External input" />
    <ptah-native-popover
      [isOpen]="open()"
      [anchor]="anchor()"
      [hasBackdrop]="hasBackdrop()"
      [backdropClass]="backdropClass()"
      [capToViewport]="cap()"
      placement="bottom-end"
      [offset]="12"
      (opened)="openedCount = openedCount + 1"
      (closed)="close()"
      (backdropClicked)="backdropCount = backdropCount + 1"
    >
      <button trigger type="button" id="popover-trigger" (click)="open.set(true)">Open</button>
      <div content>
        <input aria-label="Panel input" />
        <ptah-select label="Model" searchable [options]="options" />
      </div>
    </ptah-native-popover>
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly anchor = signal<HTMLElement | null>(null);
  readonly hasBackdrop = signal(true);
  readonly backdropClass = signal<'transparent' | 'dark'>('dark');
  readonly cap = signal(true);
  readonly options = [{ value: 'one', label: 'One' }];
  openedCount = 0;
  closedCount = 0;
  backdropCount = 0;

  close(): void {
    this.closedCount++;
    this.open.set(false);
  }
}

describe('NativePopoverComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let overlay: HTMLElement;

  const trigger = (): HTMLButtonElement => fixture.nativeElement.querySelector('#popover-trigger');
  const panel = (): HTMLElement | null => overlay.querySelector('.popover-panel');
  const backdrop = (): HTMLElement | null => overlay.querySelector('.cdk-overlay-backdrop');
  const component = (): NativePopoverComponent => fixture.debugElement
    .query(By.directive(NativePopoverComponent)).componentInstance;
  const connected = (): CdkConnectedOverlay => fixture.debugElement
    .queryAllNodes(By.directive(CdkConnectedOverlay))[0].injector.get(CdkConnectedOverlay);

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    fixture.detectChanges();
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(): Promise<void> {
    trigger().focus();
    trigger().click();
    await render();
  }

  function escape(target: HTMLElement): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }

  it('projects the trigger in place and opens and focuses the portaled panel', async () => {
    expect(trigger().textContent).toBe('Open');
    expect(panel()).toBeNull();
    await open();
    expect(panel()?.querySelector('ptah-select')).not.toBeNull();
    expect(component().panel()?.nativeElement).toBe(panel());
    expect(fixture.nativeElement.contains(panel())).toBe(false);
    expect(document.activeElement).toBe(panel());
    expect(host.openedCount).toBe(1);
  });

  it('uses matching preferred and fallback alignment and offset', async () => {
    await open();
    expect(connected().positions).toEqual([
      { originX: 'end', overlayX: 'end', originY: 'bottom', overlayY: 'top', offsetY: 12 },
      { originX: 'end', overlayX: 'end', originY: 'top', overlayY: 'bottom', offsetY: -12 },
    ]);
    expect(connected().viewportMargin).toBe(8);
  });

  it('uses a connected external anchor and falls back to the projected trigger when detached', async () => {
    const external = fixture.nativeElement.querySelector('#external-anchor') as HTMLElement;
    host.anchor.set(external);
    await open();
    expect(connected().origin).toBe(external);
    host.anchor.set(document.createElement('div'));
    await render();
    expect(connected().origin).toBe(trigger().parentElement);
  });

  it('supports explicit reposition and row reattachment while open', async () => {
    await open();
    const update = jest.spyOn(connected().overlayRef, 'updatePosition');
    component().reposition();
    await render();
    expect(update).toHaveBeenCalled();
    update.mockClear();
    component().reattach();
    await render();
    expect(update).toHaveBeenCalled();
  });

  it('tracks scrolling on the new anchor while open', async () => {
    const root: HTMLElement = fixture.nativeElement;
    const oldAnchor = root.querySelector<HTMLElement>('#external-anchor');
    const nextAnchor = root.querySelector<HTMLElement>('#next-anchor');
    host.anchor.set(oldAnchor);
    await open();
    const update = jest.spyOn(connected().overlayRef, 'updatePosition');
    oldAnchor?.parentElement?.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);

    host.anchor.set(nextAnchor);
    await render();
    expect(connected().origin).toBe(nextAnchor);
    update.mockClear();
    oldAnchor?.parentElement?.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    nextAnchor?.parentElement?.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    expect(host.openedCount).toBe(1);
  });

  it('repositions on panel resize and disconnects on close and destroy', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
    const observers: TestResizeObserver[] = [];
    class TestResizeObserver implements ResizeObserver {
      readonly observe = jest.fn();
      readonly unobserve = jest.fn();
      readonly disconnect = jest.fn();
      constructor(readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
    try {
      await open();
      const first = observers[0];
      expect(first.observe).toHaveBeenCalledWith(panel(), { box: 'border-box' });
      const update = jest.spyOn(connected().overlayRef, 'updatePosition');
      first.callback([], first);
      expect(update).toHaveBeenCalledTimes(1);

      host.open.set(false);
      await render();
      expect(first.disconnect).toHaveBeenCalledTimes(1);

      await open();
      const second = observers[1];
      expect(second.observe).toHaveBeenCalledWith(panel(), { box: 'border-box' });
      fixture.destroy();
      expect(second.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'ResizeObserver', descriptor);
      else Reflect.deleteProperty(globalThis, 'ResizeObserver');
    }
  });

  it('pushes caller-sized content inside the right edge with the cap disabled', async () => {
    const viewport = document.documentElement;
    const width = jest.spyOn(viewport, 'clientWidth', 'get').mockReturnValue(320);
    const height = jest.spyOn(viewport, 'clientHeight', 'get').mockReturnValue(300);
    try {
      host.cap.set(false);
      await open();
      const origin = trigger().parentElement as HTMLElement;
      const originRect = jest.spyOn(origin, 'getBoundingClientRect')
        .mockReturnValue(new DOMRect(304, 32, 24, 32));
      const ref = connected().overlayRef;
      const paneRect = jest.spyOn(ref.overlayElement, 'getBoundingClientRect')
        .mockReturnValue(new DOMRect(0, 0, 240, 120));
      try {
        ref.updatePosition();
        const rightInset = Number.parseFloat(ref.overlayElement.style.right);
        expect(rightInset).toBeGreaterThanOrEqual(connected().viewportMargin);
        expect(viewport.clientWidth - rightInset - 240).toBeGreaterThanOrEqual(connected().viewportMargin);
        expect(panel()?.classList).not.toContain('ptah-popover-capped');
      } finally {
        paneRect.mockRestore();
        originRect.mockRestore();
      }
    } finally {
      height.mockRestore();
      width.mockRestore();
    }
  });

  it('captures the cap policy per open and allows the consumer to own scrolling', async () => {
    await open();
    expect(panel()?.classList).toContain('ptah-popover-capped');
    host.cap.set(false);
    await render();
    expect(panel()?.classList).toContain('ptah-popover-capped');
    host.open.set(false);
    await render();
    await open();
    expect(panel()?.classList).not.toContain('ptah-popover-capped');
  });

  it('preserves external input focus when a backdrop-free popover closes programmatically', async () => {
    host.hasBackdrop.set(false);
    await open();
    const root: HTMLElement = fixture.nativeElement;
    const externalInput = root.querySelector<HTMLInputElement>('input');
    externalInput?.focus();
    expect(document.activeElement).toBe(externalInput);

    host.open.set(false);
    await render();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(externalInput);
  });

  it('restores trigger focus when a backdrop-free popover closes with focus inside', async () => {
    host.hasBackdrop.set(false);
    await open();
    const panelInput = panel()?.querySelector<HTMLInputElement>('input');
    panelInput?.focus();
    expect(document.activeElement).toBe(panelInput);

    host.open.set(false);
    await render();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('restores trigger focus on Escape from inside the popover', async () => {
    await open();
    expect(document.activeElement).toBe(panel());
    const active = document.activeElement;
    if (active instanceof HTMLElement) escape(active);
    await render();

    expect(host.closedCount).toBe(1);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('requests closure on Escape even if focus stays on the trigger', async () => {
    await open();
    trigger().focus();
    escape(trigger());
    await render();
    expect(host.closedCount).toBe(1);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('uses the caller backdrop appearance and emits both backdrop and close events', async () => {
    await open();
    expect(backdrop()?.classList).toContain('cdk-overlay-dark-backdrop');
    backdrop()?.click();
    await render();
    expect(host.backdropCount).toBe(1);
    expect(host.closedCount).toBe(1);
    expect(document.activeElement).toBe(trigger());

    host.backdropClass.set('transparent');
    await open();
    expect(overlay.querySelector('.cdk-overlay-transparent-backdrop')).not.toBeNull();
  });

  it('preserves caller-owned dismissal of a backdrop-free panel', async () => {
    host.hasBackdrop.set(false);
    await open();
    expect(backdrop()).toBeNull();
    document.body.click();
    await render();
    expect(host.closedCount).toBe(0);
    expect(host.backdropCount).toBe(0);
    expect(panel()).not.toBeNull();
  });

  it('gives a nested searchable select first Escape and backdrop dismissal', async () => {
    await open();
    const select = panel()?.querySelector('button[role="combobox"]') as HTMLButtonElement;
    select.click();
    await render();
    const search = overlay.querySelector('.ptah-select__search') as HTMLInputElement;
    expect(search).toBe(document.activeElement);
    expect(search.closest('.cdk-overlay-pane')).not.toBe(panel()?.closest('.cdk-overlay-pane'));

    escape(search);
    await render();
    expect(host.closedCount).toBe(0);
    expect(document.activeElement).toBe(select);
    select.click();
    await render();
    backdrop()?.click();
    await render();
    expect(host.closedCount).toBe(0);
    expect(overlay.querySelector('.ptah-select__search')).toBeNull();
    expect(document.activeElement).toBe(select);

    backdrop()?.click();
    await render();
    expect(host.closedCount).toBe(1);
    expect(document.activeElement).toBe(trigger());
  });

  it('repositions for an unregistered settings pane and ignores a scroll that does not move the anchor', async () => {
    const scroller = document.createElement('div');
    scroller.className = 'settings-page overflow-y-auto';
    scroller.setAttribute('data-testid', 'settings-pane');
    const moved = fixture.nativeElement as HTMLElement;
    moved.parentElement?.insertBefore(scroller, moved);
    scroller.appendChild(moved);
    await open();
    const update = jest.spyOn(connected().overlayRef, 'updatePosition');
    const unrelated = document.createElement('div');
    unrelated.className = 'overflow-y-auto';
    unrelated.style.height = '20px';
    scroller.parentElement?.appendChild(unrelated);

    unrelated.dispatchEvent(new Event('scroll'));
    panel()?.querySelector('ptah-select')?.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();

    scroller.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);

    host.open.set(false);
    await render();
    update.mockClear();
    scroller.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    scroller.parentElement?.insertBefore(moved, scroller);
    scroller.remove();
    unrelated.remove();
  });

  it('removes its portal when the host is destroyed', async () => {
    await open();
    fixture.destroy();
    expect(panel()).toBeNull();
  });

  it('releases the select if the parent closes programmatically', async () => {
    await open();
    const select = panel()?.querySelector('button[role="combobox"]') as HTMLButtonElement;
    select.click();
    await render();
    expect(overlay.querySelector('.ptah-select__search')).not.toBeNull();
    host.open.set(false);
    await render();
    expect(overlay.querySelectorAll('.cdk-overlay-pane')).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });
});
