import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DisplayDragOutDirective, draggedOutsideWindow } from './display-drag-out.directive';

@Component({ standalone: true, imports: [DisplayDragOutDirective], template: '<header [ptahDisplayDragOut]="true" (draggedOut)="detach()"></header>' })
class DragHost {
  detach = jest.fn();
}

function pointer(host: HTMLElement, type: string, x: number): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    isPrimary: { value: true }, button: { value: 0 }, pointerId: { value: 1 },
    screenX: { value: x }, screenY: { value: 100 },
  });
  host.dispatchEvent(event);
}

describe('draggedOutsideWindow', () => {
  const bounds = { x: 100, y: 200, width: 800, height: 600 };
  const start = { x: 300, y: 300 };

  it('requires at least eight pixels of movement', () => {
    expect(draggedOutsideWindow(start, { x: 307, y: 300 }, bounds)).toBe(false);
    expect(draggedOutsideWindow(start, { x: 308, y: 300 }, bounds)).toBe(false);
  });

  it('requires release beyond the window plus its margin', () => {
    expect(draggedOutsideWindow(start, { x: 80, y: 300 }, bounds)).toBe(false);
    expect(draggedOutsideWindow(start, { x: 75, y: 300 }, bounds)).toBe(true);
    expect(draggedOutsideWindow(start, { x: 925, y: 300 }, bounds)).toBe(true);
    expect(draggedOutsideWindow(start, { x: 300, y: 175 }, bounds)).toBe(true);
    expect(draggedOutsideWindow(start, { x: 300, y: 825 }, bounds)).toBe(true);
    expect(draggedOutsideWindow(start, { x: 500, y: 500 }, bounds)).toBe(false);
  });
});

describe('DisplayDragOutDirective', () => {
  it('ignores a failed pointer capture and can cancel twice', () => {
    const fixture = TestBed.createComponent(DragHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('header') as HTMLElement;
    const capture = jest.fn(() => { throw new DOMException('gone', 'NotFoundError'); });
    host.setPointerCapture = capture;
    host.hasPointerCapture = jest.fn(() => false);
    pointer(host, 'pointerdown', 100);
    pointer(host, 'pointermove', 120);
    fixture.detectChanges();
    expect(host.style.userSelect).toBe('');
    pointer(host, 'pointercancel', 120);
    pointer(host, 'lostpointercapture', 120);
    expect(fixture.componentInstance.detach).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('disables selection during drag and Escape cancels it', () => {
    const fixture = TestBed.createComponent(DragHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('header') as HTMLElement;
    host.setPointerCapture = jest.fn();
    host.hasPointerCapture = jest.fn(() => true);
    const release = jest.fn();
    host.releasePointerCapture = release;
    pointer(host, 'pointerdown', 100);
    pointer(host, 'pointermove', 120);
    fixture.detectChanges();
    expect(host.style.userSelect).toBe('none');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.style.userSelect).toBe('');
    expect(release).toHaveBeenCalledTimes(1);
    pointer(host, 'pointerup', 200);
    expect(fixture.componentInstance.detach).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
