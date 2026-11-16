import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahTableComponent } from './table.component';
import {
  PtahCollapsibleCellDirective,
  PtahDetailCellDirective,
  PtahDetailRowDirective,
  PtahRowExpanderComponent,
} from './table-detail';

class ResizeObserverStub {
  static current: ResizeObserverStub;
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.current = this;
  }
  observe(): void {
    return;
  }
  disconnect(): void {
    return;
  }
  width(width: number): void {
    this.callback(
      [{ contentRect: { width } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahTableComponent,
    PtahCollapsibleCellDirective,
    PtahDetailCellDirective,
    PtahDetailRowDirective,
    PtahRowExpanderComponent,
  ],
  template: `<ptah-table label="Agents" [collapseBelow]="800"
    ><thead>
      <tr>
        <th>Agent</th>
        <th ptahCollapsible>Detail</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Quill</th>
        <td ptahCollapsible>Wide detail</td>
        <td>
          <ptah-table-row-expander
            label="Details for Quill"
            controls="quill-detail"
            [(expanded)]="expanded"
          />
        </td>
      </tr>
      <tr id="quill-detail" [ptahDetailRow]="expanded()">
        <td ptahDetailCell [colspan]="2">
          <dl>
            <dt>Detail</dt>
            <dd><button>Use control</button></dd>
          </dl>
        </td>
      </tr>
    </tbody></ptah-table
  >`,
})
class HostComponent {
  readonly expanded = signal(false);
}

describe('table detail', () => {
  const original = globalThis.ResizeObserver;
  beforeEach(async () => {
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
  });
  afterEach(() => {
    globalThis.ResizeObserver = original;
  });

  it('hides lower priority cells and shows the detail row only when expanded at narrow widths', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cells = root.querySelectorAll<HTMLElement>('[ptahCollapsible]');
    const row = root.querySelector<HTMLElement>('#quill-detail');
    const button = root.querySelector<HTMLElement>('ptah-table-row-expander');
    const inner = root.querySelector<HTMLButtonElement>(
      'ptah-table-row-expander button',
    );
    expect(cells[0].hidden).toBe(false);
    expect(row?.hidden).toBe(true);
    expect(button?.hidden).toBe(true);
    expect(getComputedStyle(button as HTMLElement).display).toBe('none');
    ResizeObserverStub.current.width(700);
    fixture.detectChanges();
    expect(cells[0].hidden).toBe(true);
    expect(cells[1].hidden).toBe(true);
    expect(button?.hidden).toBe(false);
    expect(row?.hidden).toBe(true);
    expect(inner?.getAttribute('aria-label')).toBe('Details for Quill');
    expect(inner?.getAttribute('aria-controls')).toBe('quill-detail');
    expect(inner?.getAttribute('aria-expanded')).toBe('false');
    inner?.click();
    fixture.detectChanges();
    expect(row?.hidden).toBe(false);
    expect(inner?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('#quill-detail button')).toBeTruthy();
    ResizeObserverStub.current.width(900);
    fixture.detectChanges();
    expect(row?.hidden).toBe(true);
    expect(cells[0].hidden).toBe(false);
    fixture.destroy();
  });

  it('toggles the expander through its native button', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    ResizeObserverStub.current.width(700);
    fixture.detectChanges();
    const inner = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLButtonElement>('ptah-table-row-expander button');
    inner?.click(); // a native button turns Enter and Space into click
    fixture.detectChanges();
    expect(inner?.getAttribute('aria-expanded')).toBe('true');
    inner?.click();
    fixture.detectChanges();
    expect(inner?.getAttribute('aria-expanded')).toBe('false');
    fixture.destroy();
  });

  it('shows an open detail row when no table context exists', () => {
    @Component({
      standalone: true,
      imports: [PtahDetailRowDirective, PtahDetailCellDirective],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<table>
        <tr ptahDetailRow="true">
          <td ptahDetailCell [colspan]="1">x</td>
        </tr>
        <tr ptahDetailRow="false">
          <td ptahDetailCell [colspan]="1">y</td>
        </tr>
      </table>`,
    })
    class StandaloneHostComponent {}
    const fixture = TestBed.createComponent(StandaloneHostComponent);
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr');
    expect(rows[0].hidden).toBe(false);
    expect(rows[1].hidden).toBe(true);
  });
});
