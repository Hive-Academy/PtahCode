import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahListDetailComponent } from './list-detail.component';

it('shows list without selection and exposes back with selection', () => {
  const fixture = TestBed.createComponent(PtahListDetailComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('button')).toBeNull();
  fixture.componentRef.setInput('selectedId', 'row-1');
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('button').textContent).toContain('Back to list');
});

@Component({ standalone: true, imports: [PtahListDetailComponent], template: `<ptah-list-detail [selectedId]="selected()" (back)="selected.set(null)"><button list type="button" aria-selected="true">Row</button><div detail>Detail</div><div empty>Empty</div></ptah-list-detail>` })
class Host { readonly selected = signal<string | null>(null); }

it('moves focus to back and restores the selected list option', async () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const row = fixture.nativeElement.querySelector('[list]') as HTMLButtonElement;
  row.focus();
  fixture.componentInstance.selected.set('row');
  fixture.detectChanges();
  await fixture.whenStable();
  const back = fixture.nativeElement.querySelector('ptah-list-detail button:not([list])') as HTMLButtonElement;
  expect(document.activeElement).toBe(back);
  back.click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.activeElement).toBe(row);
  fixture.componentInstance.selected.set('');
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('ptah-list-detail section:first-child').classList.contains('hidden')).toBe(false);
  expect(fixture.nativeElement.querySelector('ptah-list-detail button:not([list])')).toBeNull();
});

it('moves focus from the list to detail when a selected view narrows', async () => {
  const originalObserver = globalThis.ResizeObserver;
  let notifyResize: ((width: number) => void) | undefined;
  const disconnect = jest.fn();
  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = (width) => callback([{ contentRect: { width } } as ResizeObserverEntry], this as ResizeObserver);
    }
    observe(): void { /* The test drives resize notifications. */ }
    disconnect(): void { disconnect(); }
  }
  globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
  try {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    notifyResize?.(900);
    fixture.componentInstance.selected.set('row');
    fixture.detectChanges();
    await fixture.whenStable();
    const row = fixture.nativeElement.querySelector('[list]') as HTMLButtonElement;
    const back = fixture.nativeElement.querySelector('ptah-list-detail button:not([list])') as HTMLButtonElement;
    row.focus();
    notifyResize?.(600);
    expect(document.activeElement).toBe(back);
    fixture.destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.ResizeObserver = originalObserver;
  }
});
