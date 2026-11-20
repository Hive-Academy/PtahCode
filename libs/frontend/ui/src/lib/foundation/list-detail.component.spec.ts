import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahListDetailComponent } from './list-detail.component';

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = [];
  readonly observe = jest.fn<void, [Element, ResizeObserverOptions?]>();
  readonly unobserve = jest.fn<void, [Element]>();
  readonly disconnect = jest.fn<void, []>();
  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this);
  }
  resize(target: Element, width: number): void {
    this.callback([{
      target,
      contentRect: { width, height: 0, x: 0, y: 0, top: 0, right: width, bottom: 0, left: 0, toJSON: () => ({ width }) },
      borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [],
    }], this);
  }
  empty(): void { this.callback([], this); }
}

function query<T extends Element = HTMLElement>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

@Component({
  standalone: true, imports: [PtahListDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-list-detail [splitAt]="splitAt()" [selectedId]="selected()" (back)="selected.set(null)"><button list ngOption type="button" aria-selected="true">Row</button><div detail>Detail</div><div empty>Empty</div></ptah-list-detail>`,
})
class Host {
  readonly splitAt = signal<768 | 960>(768);
  readonly selected = signal<string | null>(null);
}

const originalObserver = globalThis.ResizeObserver;
beforeEach(() => {
  TestResizeObserver.instances = [];
  globalThis.ResizeObserver = TestResizeObserver;
});
afterEach(() => {
  TestBed.resetTestingModule();
  globalThis.ResizeObserver = originalObserver;
});

describe.each([768, 960] as const)('splitAt %i', (splitAt) => {
  it('wires all six split queries and preserves the optional 1200px metadata column', () => {
    const fixture = TestBed.createComponent(PtahListDetailComponent);
    if (splitAt === 960) fixture.componentRef.setInput('splitAt', splitAt);
    fixture.componentRef.setInput('selectedId', 'row');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const root = query(host, ':scope > div');
    const [list, detail] = root.querySelectorAll('section');
    const back = query<HTMLButtonElement>(root, 'button');
    expect(fixture.componentInstance.splitAt()).toBe(splitAt);
    expect(root.classList.contains(`[@container(min-width:${splitAt}px)]:grid`)).toBe(true);
    expect(root.classList.contains(`[@container(min-width:${splitAt}px)]:grid-cols-[320px_minmax(0,1fr)]`)).toBe(true);
    for (const pane of [list, detail]) {
      expect(pane.classList.contains(`[@container(min-width:${splitAt}px)]:!block`)).toBe(true);
    }
    expect(list.classList.contains(`[@container(min-width:${splitAt}px)]:border-r`)).toBe(true);
    expect(back.parentElement?.classList.contains(`[@container(min-width:${splitAt}px)]:hidden`)).toBe(true);
    expect(root.querySelector('aside')).toBeNull();
    fixture.componentRef.setInput('withMeta', true);
    fixture.detectChanges();
    expect(root.classList.contains(`[@container(min-width:${splitAt}px)_and_(max-width:1199.98px)]:grid-cols-[320px_minmax(0,1fr)]`)).toBe(true);
    expect(root.classList.contains(`[@container(min-width:${splitAt}px)]:grid-cols-[320px_minmax(0,1fr)]`)).toBe(false);
    expect(root.classList.contains('[@container(min-width:1200px)]:grid-cols-[320px_minmax(0,1fr)_280px]')).toBe(true);
    expect(query(root, 'aside').classList.contains('[@container(min-width:1200px)]:block')).toBe(true);
    const other = splitAt === 768 ? 960 : 768;
    expect(host.innerHTML).not.toContain(`min-width:${other}px`);
  });

  it('focuses Back below the split and restores the option, treating empty id as no selection', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.splitAt.set(splitAt);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const root = query(host, 'ptah-list-detail > div');
    Object.defineProperty(root, 'clientWidth', { value: splitAt - 1 });
    const row = query<HTMLButtonElement>(host, '[list]');
    row.focus();
    fixture.componentInstance.selected.set('row');
    fixture.detectChanges();
    await fixture.whenStable();
    const back = query<HTMLButtonElement>(host, 'button:not([list])');
    expect(back.textContent).toContain('Back to list');
    expect(document.activeElement).toBe(back);
    expect(query(root, 'section').classList.contains('hidden')).toBe(true);
    back.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(row);
    expect(fixture.componentInstance.selected()).toBeNull();
    fixture.componentInstance.selected.set('');
    fixture.detectChanges();
    expect(query(root, 'section').classList.contains('hidden')).toBe(false);
    expect(host.querySelector('button:not([list])')).toBeNull();
    expect(query(host, '[empty]').textContent).toBe('Empty');
  });

  it('keeps list focus at the split, moves it only when crossing below, and disconnects', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.splitAt.set(splitAt);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const container = query(host, 'ptah-list-detail');
    Object.defineProperty(query(container, ':scope > div'), 'clientWidth', { value: splitAt });
    const observer = TestResizeObserver.instances[0];
    expect(observer.observe).toHaveBeenCalledWith(container);
    observer.empty();
    observer.resize(container, splitAt);
    const row = query<HTMLButtonElement>(host, '[list]');
    row.focus();
    fixture.componentInstance.selected.set('row');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(row);
    observer.resize(container, splitAt);
    expect(document.activeElement).toBe(row);
    observer.resize(container, splitAt - 1);
    const back = query<HTMLButtonElement>(host, 'button:not([list])');
    expect(document.activeElement).toBe(back);
    row.focus();
    observer.resize(container, splitAt - 2);
    expect(document.activeElement).toBe(row);
    back.focus();
    observer.resize(container, splitAt);
    observer.resize(container, splitAt - 1);
    expect(document.activeElement).toBe(back);
    fixture.destroy();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});

it('updates split classes when the input changes', () => {
  const fixture = TestBed.createComponent(PtahListDetailComponent);
  fixture.detectChanges();
  fixture.componentRef.setInput('splitAt', 960);
  fixture.componentRef.setInput('backLabel', 'Bots');
  fixture.componentRef.setInput('selectedId', 'bot');
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  expect(host.innerHTML).not.toContain('min-width:768px');
  expect(query(host, 'button').textContent).toBe('Bots');
});
