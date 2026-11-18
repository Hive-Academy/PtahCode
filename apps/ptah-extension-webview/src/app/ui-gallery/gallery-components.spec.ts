import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahListDetailComponent } from '@ptah-extension/ui';
import { GalleryComponentsComponent } from './gallery-components.component';

class GalleryResizeObserver implements ResizeObserver {
  public static instances: GalleryResizeObserver[] = [];
  public readonly observe = jest.fn<void, [Element, ResizeObserverOptions?]>();
  public readonly unobserve = jest.fn<void, [Element]>();
  public readonly disconnect = jest.fn<void, []>();
  public constructor(private readonly callback: ResizeObserverCallback) {
    GalleryResizeObserver.instances.push(this);
  }
  public resize(target: Element, width: number): void {
    this.callback(
      [
        {
          target,
          contentRect: {
            width,
            height: 0,
            x: 0,
            y: 0,
            top: 0,
            right: width,
            bottom: 0,
            left: 0,
            toJSON: () => ({ width }),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this,
    );
  }
}

function query<T extends Element = HTMLElement>(
  root: Element,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const originalObserver = globalThis.ResizeObserver;
beforeEach(() => {
  GalleryResizeObserver.instances = [];
  globalThis.ResizeObserver = GalleryResizeObserver;
});
afterEach(() => {
  TestBed.resetTestingModule();
  globalThis.ResizeObserver = originalObserver;
});

it('preserves the real gallery default split, projected content, selection and Back wiring', async () => {
  const fixture = TestBed.createComponent(GalleryComponentsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const host: HTMLElement = fixture.nativeElement;
  const container = query(host, 'ptah-list-detail');
  const layout = fixture.debugElement
    .query(By.directive(PtahListDetailComponent))
    .injector.get(PtahListDetailComponent);
  expect(layout.splitAt()).toBe(768);
  expect(layout.selectedId()).toBeNull();
  expect(query(container, '[list]').textContent).toContain(
    'API security review',
  );
  expect(query(container, '[empty]').textContent).toContain(
    'Select a review run',
  );
  const row = query<HTMLElement>(container, '[ngOption][value="security"]');
  row.click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(fixture.componentInstance.selection()).toBe('security');
  expect(layout.selectedId()).toBe('security');
  expect(query(container, '[detail] h3').textContent).toContain(
    'security review',
  );
  expect(query(container, '[detail]').textContent).toContain(
    'Repository: org/api',
  );
  const back = query<HTMLButtonElement>(
    container,
    ':scope > div > section:nth-child(2) button',
  );
  expect(back.textContent).toContain('Back to list');
  const observer = GalleryResizeObserver.instances.find((candidate) =>
    candidate.observe.mock.calls.some(([target]) => target === container),
  );
  if (!observer) throw new Error('List-detail observer was not attached');
  observer.resize(container, 768);
  row.focus();
  observer.resize(container, 767);
  expect(document.activeElement).toBe(back);
  back.click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(fixture.componentInstance.selection()).toBeNull();
  expect(layout.selectedId()).toBeNull();
  expect(query(container, 'section').classList.contains('hidden')).toBe(false);
  expect(document.activeElement).toBe(row);
  fixture.destroy();
  expect(observer.disconnect).toHaveBeenCalledTimes(1);
});
