import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PtahTableColumn, PtahTableColumnDirective } from './table-columns';
import { PtahTableComponent } from './table.component';
import {
  PtahCollapsibleCellDirective,
  PtahDetailCellDirective,
  PtahDetailRowDirective,
  PtahRowExpanderComponent,
} from './table-detail';

class ResizeObserverStub implements ResizeObserver {
  static current: ResizeObserverStub;
  readonly observe = jest.fn();
  readonly unobserve = jest.fn();
  readonly disconnect = jest.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.current = this;
  }

  width(width: number): void {
    // Deliberately target-less, matching the legacy table test doubles.
    this.callback([{ contentRect: { width } } as ResizeObserverEntry], this);
  }
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahTableComponent, PtahTableColumnDirective, PtahRowExpanderComponent,
    PtahDetailRowDirective, PtahDetailCellDirective, PtahCollapsibleCellDirective],
  template: `
    <ptah-table #table label="Usage" [columns]="columns()"
      [collapseBelow]="collapseBelow()" [wideDetail]="wideDetail()">
      <thead><tr>
        <th ptahColumn="name">Name</th>
        <th ptahColumn="status" ptahCollapsible>Status</th>
        <th ptahColumn="cost">Cost</th>
        <th ptahColumn="time">Time</th>
      </tr></thead>
      <tbody>
        <tr>
          <th ptahColumn="name" scope="row">Runner</th>
          <td ptahColumn="status" ptahCollapsible>Ready</td>
          <td ptahColumn="cost">42</td>
          <td ptahColumn="time">Today</td>
          <td><ptah-table-row-expander label="Runner details" controls="runner-detail"
            [(expanded)]="expanded" /></td>
        </tr>
        <tr id="runner-detail" [ptahDetailRow]="expanded()">
          <td ptahDetailCell [colspan]="table.visibleColumnCount()">Details</td>
        </tr>
      </tbody>
    </ptah-table>
  `,
})
class ReflowHostComponent {
  readonly columns = signal<readonly PtahTableColumn[]>([
    { id: 'name', minWidth: 100 },
    { id: 'status', minWidth: 100, priority: 1 },
    { id: 'cost', minWidth: 100, priority: 3 },
    { id: 'time', minWidth: 100, priority: 3 },
  ]);
  readonly collapseBelow = signal(0);
  readonly wideDetail = signal(false);
  readonly expanded = signal(false);
}

describe('table reflow', () => {
  const original = globalThis.ResizeObserver;
  let fixture: ComponentFixture<ReflowHostComponent>;
  let table: PtahTableComponent;
  let root: HTMLElement;

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const result = root.querySelector<T>(selector);
    if (!result) throw new Error(`Missing rendered element: ${selector}`);
    return result;
  }

  async function resize(width: number): Promise<void> {
    ResizeObserverStub.current.width(width);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function expectCells(hidden: readonly string[]): void {
    for (const id of ['name', 'status', 'cost', 'time']) {
      const cells = root.querySelectorAll<HTMLTableCellElement>(`[data-column="${id}"]`);
      expect(cells).toHaveLength(2);
      for (const cell of cells) expect(cell.hidden).toBe(hidden.includes(id));
      expect(table.isColumnHidden(id)).toBe(hidden.includes(id));
    }
  }

  beforeEach(async () => {
    globalThis.ResizeObserver = ResizeObserverStub;
    await TestBed.configureTestingModule({ imports: [ReflowHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReflowHostComponent);
    root = fixture.nativeElement;
    table = fixture.debugElement.query(By.directive(PtahTableComponent)).componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    globalThis.ResizeObserver = original;
  });

  it('preserves legacy wrapper and collapseBelow-driven detail behavior without columns', async () => {
    fixture.componentInstance.columns.set([]);
    fixture.componentInstance.collapseBelow.set(800);
    fixture.detectChanges();
    expect(element('ptah-table > div').className).toBe('overflow-x-auto');
    expect(element('ptah-table').hasAttribute('data-reflow')).toBe(false);
    expect(table.columnsMode()).toBe(false);
    expect(element('ptah-table-row-expander').hidden).toBe(true);
    expect(element('#runner-detail').hidden).toBe(true);
    await resize(700);
    expect(table.collapsed()).toBe(true);
    expect(table.detailEnabled()).toBe(true);
    expect(element('[ptahCollapsible]').hidden).toBe(true);
    expect(element('ptah-table-row-expander').hidden).toBe(false);
    expect(element('#runner-detail').hidden).toBe(true);
    element<HTMLButtonElement>('ptah-table-row-expander button').click();
    fixture.detectChanges();
    expect(element('#runner-detail').hidden).toBe(false);
    await resize(800);
    expect(element('[ptahCollapsible]').hidden).toBe(false);
    expect(element('ptah-table-row-expander').hidden).toBe(true);
    expect(element('#runner-detail').hidden).toBe(true);
    expect(element('ptah-table > div').className).toBe('overflow-x-auto');
    expect(element('ptah-table').hasAttribute('data-reflow')).toBe(false);
  });

  it('hides header and body cells one at a time by priority and later ties first', async () => {
    fixture.detectChanges();
    const wrapper = element('.ptah-table-reflow');
    expect(wrapper.classList.contains('overflow-x-auto')).toBe(false);
    expect(element('ptah-table').getAttribute('data-reflow')).toBe('columns');
    expect(table.columnsMode()).toBe(true);
    expect(table.visibleColumnCount()).toBe(4);
    expect(table.detailEnabled()).toBe(false);
    expectCells([]);
    for (const [width, hidden] of [
      [399, ['time']], [299, ['time', 'cost']], [199, ['time', 'cost', 'status']],
    ] as const) {
      await resize(width);
      expectCells(hidden);
      expect(table.visibleColumnCount()).toBe(4 - hidden.length);
      expect(element('td[ptahDetailCell]').getAttribute('colspan')).toBe(String(4 - hidden.length));
      expect(table.detailEnabled()).toBe(true);
      expect(table.collapsed()).toBe(false);
      expect(element('ptah-table-row-expander').hidden).toBe(false);
    }
    await resize(400);
    expectCells([]);
    expect(table.visibleColumnCount()).toBe(4);
    expect(table.detailEnabled()).toBe(false);
  });

  it('shows an open detail row and expander at full width with wideDetail', async () => {
    fixture.componentInstance.wideDetail.set(true);
    fixture.componentInstance.expanded.set(true);
    fixture.detectChanges();
    await resize(1000);
    expectCells([]);
    expect(table.detailEnabled()).toBe(true);
    expect(table.narrow()).toBe(false);
    expect(element('ptah-table-row-expander').hidden).toBe(false);
    expect(element('#runner-detail').hidden).toBe(false);
    fixture.componentInstance.wideDetail.set(false);
    fixture.detectChanges();
    expect(element('#runner-detail').hidden).toBe(true);
  });

  it.each(['pointer', 'Enter', 'Space'])('toggles via a native button click for %s activation', async () => {
    fixture.detectChanges();
    await resize(399);
    const button = element<HTMLButtonElement>('ptah-table-row-expander button');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-controls')).toBe('runner-detail');
    expect(button.getAttribute('aria-label')).toBe('Runner details');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // Native buttons dispatch click for Enter and Space; jsdom needs click explicitly.
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(element('#runner-detail').hidden).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(element('#runner-detail').hidden).toBe(true);
  });

  it('hides one additional optional column when rendered widths overflow', async () => {
    fixture.detectChanges();
    Object.defineProperty(element('.ptah-table-reflow'), 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(element('table.ptah-table-grid'), 'offsetWidth', {
      configurable: true,
      get: () => table.hiddenColumns().size < 2 ? 350 : 300,
    });
    await resize(300);
    expectCells(['time', 'cost']);
    expect(table.visibleColumnCount()).toBe(2);
    expect(table.overflowFallback()).toBe(false);
    expect(element('ptah-table').hasAttribute('data-overflow')).toBe(false);
  });

  it('falls back to scroll when overflowing with no optional column left', async () => {
    fixture.detectChanges();
    Object.defineProperty(element('.ptah-table-reflow'), 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(element('table.ptah-table-grid'), 'offsetWidth', { configurable: true, value: 100 });
    await resize(80);
    expectCells(['time', 'cost', 'status']);
    expect(table.visibleColumnCount()).toBe(1);
    expect(table.overflowFallback()).toBe(true);
    expect(element('ptah-table').getAttribute('data-overflow')).toBe('scroll');
    expect(element('.ptah-table-reflow').classList.contains('overflow-x-auto')).toBe(true);
    Object.defineProperty(element('.ptah-table-reflow'), 'clientWidth', { value: 500 });
    await resize(500);
    expectCells([]);
    expect(table.overflowFallback()).toBe(false);
    expect(element('ptah-table').hasAttribute('data-overflow')).toBe(false);
    expect(element('.ptah-table-reflow').classList.contains('overflow-x-auto')).toBe(false);
  });

  it('retains extra hides through 32px growth and resets them above 32px', async () => {
    fixture.detectChanges();
    let needed = 450;
    Object.defineProperty(element('.ptah-table-reflow'), 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(element('table.ptah-table-grid'), 'offsetWidth', {
      configurable: true,
      get: () => table.hiddenColumns().size > 0 ? 400 : needed,
    });
    await resize(500);
    expectCells(['time']);
    needed = 400;
    await resize(532);
    expectCells(['time']);
    await resize(533);
    expectCells([]);
    expect(table.visibleColumnCount()).toBe(4);
  });
});
