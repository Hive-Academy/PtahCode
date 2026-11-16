import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  PtahNumericCellDirective,
  PtahTableComponent,
  PtahTableRowDirective,
} from './table.component';

@Component({
  standalone: true,
  imports: [PtahTableComponent, PtahNumericCellDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-table label="Usage by day" [size]="size()" [density]="density()">
      <thead>
        <tr>
          <th>Day</th>
          <th ptahNumeric>Cost</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Monday</td>
          <td ptahNumeric>42</td>
        </tr>
      </tbody>
    </ptah-table>
  `,
})
class HostComponent {
  readonly size = signal<'xs' | 'sm'>('xs');
  readonly density = signal<'default' | 'compact' | undefined>(undefined);
}

@Component({
  standalone: true,
  imports: [PtahTableComponent],
  template: `<ptah-table label="Default"
    ><tbody>
      <tr>
        <td>One</td>
      </tr>
    </tbody></ptah-table
  >`,
})
class DefaultHostComponent {}

describe('PtahTableComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent, DefaultHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders projected table sections in an accessible native table with an overflow wrapper', () => {
    const host: HTMLElement = fixture.nativeElement;
    const table = host.querySelector('ptah-table table');
    expect(table?.getAttribute('aria-label')).toBe('Usage by day');
    expect(table?.querySelector('thead th')?.textContent).toBe('Day');
    expect(table?.querySelector('tbody td')?.textContent).toBe('Monday');
    expect(table?.parentElement?.classList.contains('overflow-x-auto')).toBe(
      true,
    );
    expect(
      host.querySelector('ptah-table')?.getAttribute('data-ptah-pattern'),
    ).toBe('table');
  });

  it('uses xs by default and switches to sm', () => {
    const defaultFixture = TestBed.createComponent(DefaultHostComponent);
    defaultFixture.detectChanges();
    expect(
      defaultFixture.nativeElement
        .querySelector('table')
        .classList.contains('table-xs'),
    ).toBe(true);
    fixture.componentInstance.size.set('sm');
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector(
      'table',
    ) as HTMLTableElement;
    expect(table.classList.contains('table-sm')).toBe(true);
    expect(table.classList.contains('table-xs')).toBe(false);
  });

  it('aligns numeric headers and cells with tabular figures', () => {
    const cells = fixture.nativeElement.querySelectorAll(
      '[ptahNumeric]',
    ) as NodeListOf<HTMLElement>;
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.classList.contains('text-right')).toBe(true);
      expect(cell.classList.contains('tabular-nums')).toBe(true);
    }
  });

  it('sets no density by default and accepts default and compact density', () => {
    const table = fixture.nativeElement.querySelector(
      'ptah-table',
    ) as HTMLElement;
    expect(table.hasAttribute('data-density')).toBe(false);
    fixture.componentInstance.density.set('default');
    fixture.detectChanges();
    expect(table.getAttribute('data-density')).toBe('default');
    fixture.componentInstance.density.set('compact');
    fixture.detectChanges();
    expect(table.getAttribute('data-density')).toBe('compact');
    expect(PtahTableRowDirective).toBeDefined();
  });
});
