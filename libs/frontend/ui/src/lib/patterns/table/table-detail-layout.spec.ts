import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahTableColumn } from './table-columns';
import { PtahTableComponent } from './table.component';
import {
  PtahTableDetailLayoutComponent,
  PtahTableDetailLayoutMode,
} from './table-detail-layout';

class ResizeObserverStub implements ResizeObserver {
  static current: ResizeObserverStub;
  readonly observe = jest.fn();
  readonly unobserve = jest.fn();
  readonly disconnect = jest.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.current = this;
  }

  width(width: number): void {
    this.callback([{ contentRect: { width } } as ResizeObserverEntry], this);
  }
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahTableDetailLayoutComponent],
  template: `
    <ptah-table-detail-layout [mode]="mode()">
      <dl ptahDetailFacts><dt>Status</dt><dd>Ready</dd></dl>
      <span ptahDetailChips>Active</span>
      <p>Additional information</p>
      <div ptahDetailActions><button type="button">Run</button></div>
    </ptah-table-detail-layout>
  `,
})
class StandaloneLayoutHostComponent {
  readonly mode = signal<PtahTableDetailLayoutMode>('auto');
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahTableComponent, PtahTableDetailLayoutComponent],
  template: `
    <ptah-table label="Usage" [columns]="columns()" [collapseBelow]="collapseBelow()">
      <tbody><tr><td>
        <ptah-table-detail-layout [mode]="mode()"><p>Details</p></ptah-table-detail-layout>
      </td></tr></tbody>
    </ptah-table>
  `,
})
class TableLayoutHostComponent {
  readonly columns = signal<readonly PtahTableColumn[]>([
    { id: 'name', minWidth: 100 },
    { id: 'status', minWidth: 100, priority: 1 },
    { id: 'cost', minWidth: 100, priority: 2 },
  ]);
  readonly collapseBelow = signal(0);
  readonly mode = signal<PtahTableDetailLayoutMode>('auto');
}

describe('table detail layout', () => {
  const original = globalThis.ResizeObserver;

  beforeEach(async () => {
    globalThis.ResizeObserver = ResizeObserverStub;
    await TestBed.configureTestingModule({
      imports: [StandaloneLayoutHostComponent, TableLayoutHostComponent],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    globalThis.ResizeObserver = original;
  });

  function layout<T>(fixture: ComponentFixture<T>): HTMLElement {
    const root: HTMLElement = fixture.nativeElement;
    const result = root.querySelector<HTMLElement>('ptah-table-detail-layout');
    if (!result) throw new Error('Missing detail layout');
    return result;
  }

  async function resize(fixture: ComponentFixture<TableLayoutHostComponent>, width: number): Promise<void> {
    ResizeObserverStub.current.width(width);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('projects facts, chips, default body and actions into their own slots', () => {
    const fixture = TestBed.createComponent(StandaloneLayoutHostComponent);
    fixture.detectChanges();
    const element = layout(fixture);
    expect(element.querySelector('.ptah-table-detail-facts > [ptahDetailFacts]')?.textContent).toBe('StatusReady');
    expect(element.querySelector('.ptah-table-detail-chips > [ptahDetailChips]')?.textContent).toBe('Active');
    expect(element.querySelector('.ptah-table-detail-body > p')?.textContent).toBe('Additional information');
    expect(element.querySelector('.ptah-table-detail-actions > [ptahDetailActions] button')?.textContent).toBe('Run');
    expect(element.querySelector('.ptah-table-detail-body')?.children).toHaveLength(1);
  });

  it.each(['list', 'wide'] as const)('honors explicit %s mode outside a table', (mode) => {
    const fixture = TestBed.createComponent(StandaloneLayoutHostComponent);
    fixture.componentInstance.mode.set(mode);
    fixture.detectChanges();
    expect(layout(fixture).getAttribute('data-mode')).toBe(mode);
  });

  it('uses list for auto outside a table and reacts to mode changes', () => {
    const fixture = TestBed.createComponent(StandaloneLayoutHostComponent);
    fixture.detectChanges();
    expect(layout(fixture).getAttribute('data-mode')).toBe('list');
    fixture.componentInstance.mode.set('wide');
    fixture.detectChanges();
    expect(layout(fixture).getAttribute('data-mode')).toBe('wide');
    fixture.componentInstance.mode.set('auto');
    fixture.detectChanges();
    expect(layout(fixture).getAttribute('data-mode')).toBe('list');
  });

  it('uses wide while any optional column is visible, list when all hide, and wide on growth', async () => {
    const fixture = TestBed.createComponent(TableLayoutHostComponent);
    fixture.detectChanges();
    expect(layout(fixture).getAttribute('data-mode')).toBe('wide');
    await resize(fixture, 299);
    expect(layout(fixture).getAttribute('data-mode')).toBe('wide');
    await resize(fixture, 199);
    expect(layout(fixture).getAttribute('data-mode')).toBe('list');
    await resize(fixture, 300);
    expect(layout(fixture).getAttribute('data-mode')).toBe('wide');
  });

  it('uses list when a legacy table collapses and wide at the threshold', async () => {
    const fixture = TestBed.createComponent(TableLayoutHostComponent);
    fixture.componentInstance.columns.set([]);
    fixture.componentInstance.collapseBelow.set(800);
    fixture.detectChanges();
    await resize(fixture, 799);
    expect(layout(fixture).getAttribute('data-mode')).toBe('list');
    await resize(fixture, 800);
    expect(layout(fixture).getAttribute('data-mode')).toBe('wide');
  });

  it.each(['list', 'wide'] as const)('keeps explicit %s mode across table width changes', async (mode) => {
    const fixture = TestBed.createComponent(TableLayoutHostComponent);
    fixture.componentInstance.mode.set(mode);
    fixture.componentInstance.collapseBelow.set(800);
    fixture.detectChanges();
    await resize(fixture, 1000);
    expect(layout(fixture).getAttribute('data-mode')).toBe(mode);
    await resize(fixture, 100);
    expect(layout(fixture).getAttribute('data-mode')).toBe(mode);
  });
});
