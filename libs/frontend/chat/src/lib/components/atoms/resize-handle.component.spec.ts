import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { CdkDragMove } from '@angular/cdk/drag-drop';
import { PanelResizeService } from '../../services/panel-resize.service';
import { ResizeHandleComponent } from './resize-handle.component';

function dragMove(x: number): CdkDragMove {
  return {
    source: { element: { nativeElement: document.createElement('div') } },
    pointerPosition: { x, y: 0 },
  } as CdkDragMove;
}

function containerAt(right: number, width: number, padding: number): HTMLElement {
  const el = document.createElement('div');
  el.style.paddingLeft = `${padding}px`;
  el.style.paddingRight = `${padding}px`;
  Object.defineProperty(el, 'clientWidth', { value: width });
  el.getBoundingClientRect = () => ({ right }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('ResizeHandleComponent', () => {
  let fixture: ComponentFixture<ResizeHandleComponent>;
  let service: PanelResizeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ResizeHandleComponent],
      providers: [PanelResizeService],
    });
    fixture = TestBed.createComponent(ResizeHandleComponent);
    service = TestBed.inject(PanelResizeService);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('measures from the viewport edge when no container is given', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
    fixture.detectChanges();
    fixture.componentInstance.onDragMoved(dragMove(1200));
    expect(service.customWidth()).toBe(400);
  });

  it('measures from the container content edge and clamps to its content box', () => {
    // 1000px wide container ending at x=1000 with 16px padding on each side.
    fixture.componentRef.setInput('container', containerAt(1000, 1000, 16));
    fixture.detectChanges();
    fixture.componentInstance.onDragMoved(dragMove(584));
    expect(service.customWidth()).toBe(400);

    // Max is 75% of the 968px content box, not of the 1000px border box.
    fixture.componentInstance.onDragMoved(dragMove(0));
    expect(service.customWidth()).toBe(968 * 0.75);
  });

  it('toggles dragging state across a drag', () => {
    fixture.detectChanges();
    fixture.componentInstance.onDragStarted();
    expect(service.dragging()).toBe(true);
    fixture.componentInstance.onDragEnded();
    expect(service.dragging()).toBe(false);
  });
});
