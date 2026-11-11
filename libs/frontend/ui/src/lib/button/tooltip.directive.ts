import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ComponentRef, DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';
import { PtahTooltipPanelComponent } from './tooltip-panel.component';

const SHOW_DELAY_MS = 250;
const LEAVE_GRACE_MS = 100;
let nextTooltipId = 0;

@Directive({
  selector: '[ptahTooltip]',
  standalone: true,
  host: {
    '(pointerenter)': 'onPointerEnter($event)',
    '(pointerleave)': 'onPointerLeave()',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
  },
})
export class PtahTooltipDirective {
  /** Text shown to pointer and keyboard users. Empty text closes the tooltip. */
  readonly ptahTooltip = input.required<string>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly overlay = inject(Overlay);
  private readonly id = `ptah-tooltip-${++nextTooltipId}`;
  private overlayRef?: OverlayRef;
  private panel?: ComponentRef<PtahTooltipPanelComponent>;
  private timer?: ReturnType<typeof setTimeout>;
  private openedByFocus = false;
  private pointerOverHost = false;
  private pointerOverPanel = false;

  constructor() {
    effect(() => {
      const value = this.ptahTooltip().trim();
      if (!value) this.hide();
      else if (this.panel) {
        this.panel.setInput('text', value);
        this.syncDescription(value);
      }
    });
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.pointerOverHost = true;
    this.clearTimer();
    if (!this.overlayRef) this.timer = setTimeout(() => this.show(false), SHOW_DELAY_MS);
  }

  protected onPointerLeave(): void {
    this.pointerOverHost = false;
    if (!this.openedByFocus && !this.pointerOverPanel) this.scheduleHide();
  }

  protected onFocus(): void {
    if (this.isFocusVisible()) this.show(true);
  }

  private isFocusVisible(): boolean {
    try { return this.host.matches(':focus-visible'); }
    catch { return this.host === document.activeElement; }
  }

  protected onBlur(): void {
    if (!this.openedByFocus) return;
    // WCAG 1.4.13: keep the tooltip while the pointer is over the host or the
    // panel. The pointer-leave schedule closes it later.
    if (this.pointerOverHost || this.pointerOverPanel) this.openedByFocus = false;
    else this.hide();
  }

  private show(fromFocus: boolean): void {
    this.clearTimer();
    const value = this.ptahTooltip().trim();
    if (!value) return;
    if (this.overlayRef) { if (fromFocus) this.openedByFocus = true; return; }
    this.openedByFocus = fromFocus;
    const position = this.overlay.position().flexibleConnectedTo(this.host)
      .withPositions([
        { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom' },
        { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top' },
      ]).withPopoverLocation('inline');
    const ref = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      usePopover: true,
    });
    this.overlayRef = ref;
    this.panel = ref.attach(new ComponentPortal(PtahTooltipPanelComponent));
    this.panel.setInput('id', this.id);
    this.panel.setInput('text', value);
    this.panel.changeDetectorRef.detectChanges();
    ref.overlayElement.addEventListener('pointerenter', this.panelEnter);
    ref.overlayElement.addEventListener('pointerleave', this.panelLeave);
    ref.keydownEvents().subscribe((event) => {
      if (event.key !== 'Escape' || !this.overlayRef) return;
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    });
    this.syncDescription(value);
  }

  private readonly panelEnter = (): void => {
    this.pointerOverPanel = true;
    this.clearTimer();
  };
  private readonly panelLeave = (): void => {
    this.pointerOverPanel = false;
    if (!this.pointerOverHost) this.scheduleHide();
  };
  private readonly scheduleHide = (): void => {
    this.clearTimer();
    if (!this.openedByFocus) this.timer = setTimeout(() => this.hide(), LEAVE_GRACE_MS);
  };

  private syncDescription(value: string): void {
    this.removeDescription();
    const name = (this.host.getAttribute('aria-label') || this.host.textContent || '').trim();
    if (name === value) return;
    const tokens = this.host.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
    this.host.setAttribute('aria-describedby', [...tokens, this.id].join(' '));
  }

  private removeDescription(): void {
    const tokens = this.host.getAttribute('aria-describedby')?.split(/\s+/)
      .filter((token) => token && token !== this.id) ?? [];
    if (tokens.length) this.host.setAttribute('aria-describedby', tokens.join(' '));
    else this.host.removeAttribute('aria-describedby');
  }

  private hide(): void {
    this.clearTimer();
    this.openedByFocus = false;
    // The panel is disposed before its pointerleave can fire: reset its flag here.
    this.pointerOverPanel = false;
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
    this.panel = undefined;
    this.removeDescription();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
